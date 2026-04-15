"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import BuildingCanvas from "@/components/BuildingCanvas";
import { downloadPreview } from "@/lib/perspectiveEngine";
import type { CornerPoints } from "@/lib/perspectiveEngine";
import type { Project } from "@/types";

interface AiFeedback {
  confidence: number;
  reasoning: string;
  targetDescription: string;
  found: boolean;
}

// Rasterize SVG string to PNG base64 (client-side, no CORS issues)
function svgToPngBase64(svgText: string, maxPx = 512): Promise<{ base64: string; mediaType: "image/png" } | null> {
  return new Promise((resolve) => {
    const wm = svgText.match(/\bwidth\s*=\s*["']?\s*([0-9.]+)/);
    const hm = svgText.match(/\bheight\s*=\s*["']?\s*([0-9.]+)/);
    const vm = svgText.match(/viewBox\s*=\s*["']([^"']*)["']/);
    let W = wm ? parseFloat(wm[1]) : 0;
    let H = hm ? parseFloat(hm[1]) : 0;
    if ((!W || !H) && vm) {
      const p = vm[1].trim().split(/[\s,]+/).map(Number);
      if (p.length === 4) { W = p[2]; H = p[3]; }
    }
    if (!W || W < 1) W = 800;
    if (!H || H < 1) H = 600;

    const fixed = svgText
      .replace(/(<svg\b[^>]*?)\s+width\s*=\s*["'][^"']*["']/g, "$1")
      .replace(/(<svg\b[^>]*?)\s+height\s*=\s*["'][^"']*["']/g, "$1")
      .replace("<svg", `<svg width="${W}" height="${H}"`);

    const scale = Math.min(1, maxPx / Math.max(W, H));
    const cW = Math.max(1, Math.round(W * scale));
    const cH = Math.max(1, Math.round(H * scale));

    const blob = new Blob([fixed], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = cW; c.height = cH;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "white";
      cx.fillRect(0, 0, cW, cH);
      cx.drawImage(img, 0, 0, cW, cH);
      const dataUrl = c.toDataURL("image/png");
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/png" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default function PreviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [designSvg, setDesignSvg] = useState<string | null>(null);
  const [corners, setCorners] = useState<CornerPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<AiFeedback | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [refineText, setRefineText] = useState("");

  useEffect(() => {
    loadProject();
  }, [projectId]);

  async function loadProject() {
    try {
      const res = await fetch(`/api/projects`);
      const projects = await res.json();
      const proj = projects.find((p: Project) => p.id === projectId);
      setProject(proj || null);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  function handlePhotoLoaded(dataUrl: string) {
    setPhotoUrl(dataUrl);
    setAiFeedback(null);
    setCorners(null);
  }

  function handleSvgLoaded(text: string) {
    setDesignSvg(text);
  }

  // Draw a yellow percentage grid on the canvas so Claude can see exact coordinate references
  function drawCoordGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const fontSize = Math.max(10, Math.round(Math.min(w, h) / 22));
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = Math.round(w * i / 10);
      const y = Math.round(h * i / 10);
      ctx.strokeStyle = "rgba(255,220,0,0.55)";
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      if (i > 0 && i < 10) {
        const label = `${i * 10}`;
        ctx.setLineDash([]);
        ctx.font = `bold ${fontSize}px monospace`;
        // Shadow for readability
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillText(label, x - fontSize * label.length * 0.28 + 1, fontSize + 3);
        ctx.fillText(label, 3, y + fontSize / 2 + 1);
        ctx.fillStyle = "rgba(255,220,0,1)";
        ctx.fillText(label, x - fontSize * label.length * 0.28, fontSize + 2);
        ctx.fillText(label, 2, y + fontSize / 2);
        ctx.setLineDash([4, 4]);
      }
    }
    ctx.restore();
  }

  function prepareImageForApi(dataUrl: string, maxSize: number): Promise<{ base64: string; mediaType: string; w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Draw coordinate grid so Claude can read exact % positions
        drawCoordGrid(ctx, canvas.width, canvas.height);
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.88);
        const base64 = jpegDataUrl.split(",")[1];
        resolve({ base64, mediaType: "image/jpeg", w: canvas.width, h: canvas.height });
      };
      img.src = dataUrl;
    });
  }

  function cropImageForRefinement(
    dataUrl: string,
    roughCorners: CornerPoints,
    smallW: number,
    smallH: number
  ): Promise<{
    base64: string;
    mediaType: string;
    w: number;
    h: number;
    cropPct: { x1: number; y1: number; x2: number; y2: number };
  }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Rough corners are in smallW/smallH space, convert to percentages
        const x1_pct = Math.max(0, (roughCorners.topLeft[0] / smallW) * 100);
        const y1_pct = Math.max(0, (roughCorners.topLeft[1] / smallH) * 100);
        const x2_pct = Math.min(100, (roughCorners.bottomRight[0] / smallW) * 100);
        const y2_pct = Math.min(100, (roughCorners.bottomRight[1] / smallH) * 100);

        // Add 40% margin
        const w_pct = x2_pct - x1_pct;
        const h_pct = y2_pct - y1_pct;
        const margin_x = w_pct * 0.4;
        const margin_y = h_pct * 0.4;

        const crop_x1_pct = Math.max(0, x1_pct - margin_x);
        const crop_y1_pct = Math.max(0, y1_pct - margin_y);
        const crop_x2_pct = Math.min(100, x2_pct + margin_x);
        const crop_y2_pct = Math.min(100, y2_pct + margin_y);

        // Convert to original image pixel coordinates
        const crop_x1_px = (crop_x1_pct / 100) * img.naturalWidth;
        const crop_y1_px = (crop_y1_pct / 100) * img.naturalHeight;
        const crop_w_px = ((crop_x2_pct - crop_x1_pct) / 100) * img.naturalWidth;
        const crop_h_px = ((crop_y2_pct - crop_y1_pct) / 100) * img.naturalHeight;

        // Create canvas for cropped image, scale to max 1024px
        const scale = Math.min(1024 / crop_w_px, 1024 / crop_h_px, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(crop_w_px * scale);
        canvas.height = Math.round(crop_h_px * scale);
        const ctx = canvas.getContext("2d")!;

        // Draw the cropped region
        ctx.drawImage(img, crop_x1_px, crop_y1_px, crop_w_px, crop_h_px, 0, 0, canvas.width, canvas.height);

        // Draw coordinate grid
        drawCoordGrid(ctx, canvas.width, canvas.height);

        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.88);
        const base64 = jpegDataUrl.split(",")[1];

        resolve({
          base64,
          mediaType: "image/jpeg",
          w: canvas.width,
          h: canvas.height,
          cropPct: { x1: crop_x1_pct, y1: crop_y1_pct, x2: crop_x2_pct, y2: crop_y2_pct },
        });
      };
      img.src = dataUrl;
    });
  }

  async function callAnalyzeApi(
    promptText: string,
    prevCorners?: CornerPoints
  ) {
    setAiError(null);
    setAiFeedback(null);
    if (!photoUrl) { setAiError("Upload eerst een gevelfoto."); return; }
    if (!promptText.trim()) { setAiError("Typ een instructie."); return; }
    setAnalyzing(true);

    try {
      const actualDims = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = photoUrl!;
      });
      const { base64, mediaType, w: smallW, h: smallH } = await prepareImageForApi(photoUrl, 1024);

      // Rasterize SVG design if present
      let designPayload: { base64: string; mediaType: "image/png" } | null = null;
      if (designSvg) {
        designPayload = await svgToPngBase64(designSvg, 512);
      }

      // Canvas renders at max 1200px (matching BuildingCanvas MAX_CANVAS=1200)
      const canvasW = Math.min(actualDims.w, 1200);
      const canvasH = Math.round(actualDims.h * (canvasW / actualDims.w));

      // Convert absolute canvas corners to percentage for previousCorners
      let previousCornersPct: Record<string, [number, number]> | undefined;
      if (prevCorners && canvasW && canvasH) {
        const toPct = (pt: [number, number]): [number, number] => [
          Math.round((pt[0] / canvasW) * 1000) / 10,
          Math.round((pt[1] / canvasH) * 1000) / 10,
        ];
        previousCornersPct = {
          topLeft: toPct(prevCorners.topLeft),
          topRight: toPct(prevCorners.topRight),
          bottomRight: toPct(prevCorners.bottomRight),
          bottomLeft: toPct(prevCorners.bottomLeft),
        };
      }

      // PASS 1: Rough detection with full image
      const response = await fetch("/api/analyze-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoBase64: base64,
          mediaType,
          instruction: promptText,
          photoWidth: smallW,
          photoHeight: smallH,
          ...(designPayload && {
            designBase64: designPayload.base64,
            designMediaType: designPayload.mediaType,
          }),
          ...(previousCornersPct && { previousCorners: previousCornersPct }),
        }),
      });

      const text = await response.text();
      let data: {
        corners?: CornerPoints;
        found?: boolean;
        confidence?: number;
        reasoning?: string;
        targetDescription?: string;
        raw?: string;
        error?: string;
        remaining?: number;
      };
      try {
        data = JSON.parse(text);
      } catch {
        setAiError(`Server gaf ongeldig antwoord: ${text.substring(0, 100)}`);
        setAnalyzing(false);
        return;
      }

      if (data.error) {
        setAiError(data.error);
      } else if (data.corners && data.found) {
        // PASS 2: Refined detection on cropped region
        try {
          const crop = await cropImageForRefinement(photoUrl, data.corners, smallW, smallH);

          // Call API again with cropped image
          const refineResponse = await fetch("/api/analyze-placement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              photoBase64: crop.base64,
              mediaType: crop.mediaType,
              instruction: promptText,
              photoWidth: crop.w,
              photoHeight: crop.h,
              isCrop: true,
            }),
          });

          const refineText = await refineResponse.text();
          let refineData: any;
          try {
            refineData = JSON.parse(refineText);
          } catch {
            // Fallback to Pass 1 result if Pass 2 fails
            refineData = null;
          }

          // Use refined result if available, otherwise fall back to rough result
          let finalCorners = data.corners;
          let finalFeedback = {
            found: data.found ?? true,
            confidence: data.confidence ?? 0.7,
            reasoning: data.reasoning ?? "",
            targetDescription: data.targetDescription ?? "",
          };

          if (refineData?.corners && refineData?.found) {
            // Map Pass 2 coordinates (crop space) back to full image coordinates
            const cropPct = crop.cropPct;
            const remappedCorners: CornerPoints = {
              topLeft: [
                Math.round((cropPct.x1 + (refineData.corners.topLeft[0] / crop.w) * (cropPct.x2 - cropPct.x1)) / 100 * smallW),
                Math.round((cropPct.y1 + (refineData.corners.topLeft[1] / crop.h) * (cropPct.y2 - cropPct.y1)) / 100 * smallH),
              ],
              topRight: [
                Math.round((cropPct.x1 + (refineData.corners.topRight[0] / crop.w) * (cropPct.x2 - cropPct.x1)) / 100 * smallW),
                Math.round((cropPct.y1 + (refineData.corners.topRight[1] / crop.h) * (cropPct.y2 - cropPct.y1)) / 100 * smallH),
              ],
              bottomRight: [
                Math.round((cropPct.x1 + (refineData.corners.bottomRight[0] / crop.w) * (cropPct.x2 - cropPct.x1)) / 100 * smallW),
                Math.round((cropPct.y1 + (refineData.corners.bottomRight[1] / crop.h) * (cropPct.y2 - cropPct.y1)) / 100 * smallH),
              ],
              bottomLeft: [
                Math.round((cropPct.x1 + (refineData.corners.bottomLeft[0] / crop.w) * (cropPct.x2 - cropPct.x1)) / 100 * smallW),
                Math.round((cropPct.y1 + (refineData.corners.bottomLeft[1] / crop.h) * (cropPct.y2 - cropPct.y1)) / 100 * smallH),
              ],
            };
            finalCorners = remappedCorners;
            finalFeedback = {
              found: refineData.found ?? true,
              confidence: refineData.confidence ?? 0.7,
              reasoning: refineData.reasoning ?? "",
              targetDescription: refineData.targetDescription ?? "",
            };
          }

          // Scale corners from small image to canvas coordinates
          const scaleX = canvasW / smallW;
          const scaleY = canvasH / smallH;
          const scaled: CornerPoints = {
            topLeft: [Math.round(finalCorners.topLeft[0] * scaleX), Math.round(finalCorners.topLeft[1] * scaleY)],
            topRight: [Math.round(finalCorners.topRight[0] * scaleX), Math.round(finalCorners.topRight[1] * scaleY)],
            bottomRight: [Math.round(finalCorners.bottomRight[0] * scaleX), Math.round(finalCorners.bottomRight[1] * scaleY)],
            bottomLeft: [Math.round(finalCorners.bottomLeft[0] * scaleX), Math.round(finalCorners.bottomLeft[1] * scaleY)],
          };

          setCorners(scaled);
          setAiFeedback(finalFeedback);
          if (refineData?.raw) setRawResponse(refineData.raw);
        } catch (cropError) {
          // If cropping fails, fall back to Pass 1 result
          const scaleX = canvasW / smallW;
          const scaleY = canvasH / smallH;
          const scaled: CornerPoints = {
            topLeft: [Math.round(data.corners.topLeft[0] * scaleX), Math.round(data.corners.topLeft[1] * scaleY)],
            topRight: [Math.round(data.corners.topRight[0] * scaleX), Math.round(data.corners.topRight[1] * scaleY)],
            bottomRight: [Math.round(data.corners.bottomRight[0] * scaleX), Math.round(data.corners.bottomRight[1] * scaleY)],
            bottomLeft: [Math.round(data.corners.bottomLeft[0] * scaleX), Math.round(data.corners.bottomLeft[1] * scaleY)],
          };
          setCorners(scaled);
          setAiFeedback({
            found: data.found ?? true,
            confidence: data.confidence ?? 0.7,
            reasoning: data.reasoning ?? "",
            targetDescription: data.targetDescription ?? "",
          });
          if (data.raw) setRawResponse(data.raw);
        }
      } else {
        setAiError("Geen plaatsing ontvangen. Probeer opnieuw.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Onbekende fout";
      setAiError(`Fout: ${msg}`);
    }

    setAnalyzing(false);
  }

  async function analyzeWithClaude() {
    await callAnalyzeApi(instruction);
  }

  async function refineWithClaude() {
    if (!refineText.trim()) return;
    await callAnalyzeApi(refineText, corners ?? undefined);
    setRefineText("");
  }

  function handleCornersChange(newCorners: CornerPoints) {
    setCorners(newCorners);
  }

  function handleExport(canvas: HTMLCanvasElement) {
    downloadPreview(canvas, `${project?.name || "preview"}.png`);
  }

  function confidenceColor(c: number) {
    if (c >= 0.7) return "bg-green-100 text-green-800 border-green-200";
    if (c >= 0.4) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-red-100 text-red-800 border-red-200";
  }

  if (loading) return <p className="text-gray-500">Laden...</p>;
  if (!project) return <p className="text-red-500">Project niet gevonden</p>;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-gray-500">Pand-preview met AI plaatsing</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/calculator/${projectId}`}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Calculator
          </Link>
          <Link
            href={`/cut/${projectId}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Snij-workflow
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Gevelfoto</h3>
            <FileUpload
              accept="image/*"
              label="Upload foto van het pand"
              onFileLoaded={handlePhotoLoaded}
              readAsText={false}
            />
          </div>

          <div>
            <h3 className="font-semibold mb-2">Ontwerp (SVG)</h3>
            <FileUpload
              accept=".svg"
              label="Upload SVG ontwerp"
              onFileLoaded={handleSvgLoaded}
              readAsText
            />
            {designSvg && (
              <p className="text-xs text-green-600 mt-1">SVG geladen — AI gebruikt dit als referentie</p>
            )}
          </div>

          {/* AI Placement */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold mb-2 text-sm flex items-center gap-1">
              <span>AI Plaatsing</span>
              <span className="text-xs font-normal text-blue-600">(Claude claude-sonnet-4-6)</span>
            </h3>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Bijv. 'vervang het Blokker logo door ons ontwerp' of 'plaats het SVG boven de deur'"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              rows={3}
            />
            <button
              onClick={analyzeWithClaude}
              disabled={analyzing || !instruction.trim() || !photoUrl}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Claude analyseert...
                </span>
              ) : "AI plaatsing berekenen"}
            </button>

            {aiError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {aiError}
              </div>
            )}

            {/* AI Feedback */}
            {aiFeedback && (
              <div className="mt-3 space-y-2">
                <div className={`flex items-center justify-between p-2 rounded border text-xs font-medium ${confidenceColor(aiFeedback.confidence)}`}>
                  <span>{aiFeedback.found ? "Locatie gevonden" : "Locatie onzeker"}</span>
                  <span>{Math.round(aiFeedback.confidence * 100)}% zekerheid</span>
                </div>
                {aiFeedback.targetDescription && (
                  <p className="text-xs text-gray-600 italic">{aiFeedback.targetDescription}</p>
                )}
                {aiFeedback.reasoning && (
                  <p className="text-xs text-gray-500">{aiFeedback.reasoning}</p>
                )}

                {/* Refine */}
                <div className="border-t border-blue-200 pt-2">
                  <p className="text-xs text-gray-500 mb-1">Verfijn plaatsing:</p>
                  <textarea
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    placeholder="Bijv. 'maak het groter' of 'schuif naar rechts'"
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    rows={2}
                  />
                  <button
                    onClick={refineWithClaude}
                    disabled={analyzing || !refineText.trim()}
                    className="w-full mt-1 px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {analyzing ? "Verfijnen..." : "Verfijn"}
                  </button>
                </div>

                {/* Raw toggle */}
                {rawResponse && (
                  <button
                    onClick={() => setShowRaw((v) => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    {showRaw ? "Verberg" : "Toon"} Claude-antwoord
                  </button>
                )}
                {showRaw && rawResponse && (
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all border">
                    {rawResponse}
                  </pre>
                )}
              </div>
            )}
          </div>

          <div className="text-sm text-gray-500 space-y-1">
            <p>1. Upload een foto van het pand</p>
            <p>2. Upload het SVG ontwerp</p>
            <p>3. Geef instructie aan Claude AI</p>
            <p>4. Of sleep de hoekpunten handmatig</p>
            <p>5. Exporteer als PNG</p>
          </div>
        </div>

        <div className="col-span-2">
          {photoUrl && (
            <p className="text-xs text-blue-600 mb-2 font-medium">
              Sleep een gebied op de foto om het ontwerp daar te plaatsen — of versleep de blauwe hoekpunten
            </p>
          )}
          <BuildingCanvas
            buildingPhotoUrl={photoUrl}
            designSvg={designSvg}
            onCornersChange={handleCornersChange}
            onExport={handleExport}
            setCanvasRef={setCanvasRef}
            initialCorners={corners}
            clickToPlace={true}
          />
        </div>
      </div>
    </div>
  );
}
