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

function padToSquareBase64(
  base64: string, mediaType: string
): Promise<{ base64: string; size: number; offsetX: number; offsetY: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.max(img.width, img.height);
      const offsetX = Math.floor((size - img.width) / 2);
      const offsetY = Math.floor((size - img.height) / 2);
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#888";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, offsetX, offsetY);
      resolve({ base64: c.toDataURL("image/jpeg", 0.88).split(",")[1], size, offsetX, offsetY });
    };
    img.src = `data:${mediaType};base64,${base64}`;
  });
}

function cornersToMaskBase64(
  corners: { topLeft: [number, number]; topRight: [number, number]; bottomRight: [number, number]; bottomLeft: [number, number] },
  canvasW: number, canvasH: number,
  maskW: number, maskH: number
): string {
  const scaleX = maskW / canvasW;
  const scaleY = maskH / canvasH;
  const c = document.createElement("canvas");
  c.width = maskW;
  c.height = maskH;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, maskW, maskH);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(corners.topLeft[0] * scaleX, corners.topLeft[1] * scaleY);
  ctx.lineTo(corners.topRight[0] * scaleX, corners.topRight[1] * scaleY);
  ctx.lineTo(corners.bottomRight[0] * scaleX, corners.bottomRight[1] * scaleY);
  ctx.lineTo(corners.bottomLeft[0] * scaleX, corners.bottomLeft[1] * scaleY);
  ctx.closePath();
  ctx.fill();
  return c.toDataURL("image/png").split(",")[1];
}

// Resize a raster (PNG/JPEG) data URL to a PNG base64 capped at maxPx
function rasterToPngBase64(dataUrl: string, maxPx = 512): Promise<{ base64: string; mediaType: "image/png" } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight;
      if (!W || !H) { resolve(null); return; }
      const scale = Math.min(1, maxPx / Math.max(W, H));
      const cW = Math.max(1, Math.round(W * scale));
      const cH = Math.max(1, Math.round(H * scale));
      const c = document.createElement("canvas");
      c.width = cW; c.height = cH;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "white"; cx.fillRect(0, 0, cW, cH);
      cx.drawImage(img, 0, 0, cW, cH);
      resolve({ base64: c.toDataURL("image/png").split(",")[1], mediaType: "image/png" });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
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
  const [designImageUrl, setDesignImageUrl] = useState<string | null>(null);
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
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

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

  function handleDesignLoaded(content: string, name: string, file: File) {
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(name);
    if (isSvg) {
      // FileUpload was called with readAsText=false (data URL); re-read SVG as text
      const reader = new FileReader();
      reader.onload = (e) => {
        setDesignSvg(e.target?.result as string);
        setDesignImageUrl(null);
      };
      reader.readAsText(file);
    } else {
      setDesignImageUrl(content);
      setDesignSvg(null);
    }
  }

  // Yellow 5%/10% grid with labels every 10% — lets Gemini read precise coords
  function drawCoordGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const fontSize = Math.max(10, Math.round(Math.min(w, h) / 22));
    ctx.save();
    ctx.lineWidth = 1;

    // Minor gridlines every 5% (thin, faint)
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(255,220,0,0.25)";
    for (let i = 0; i <= 20; i++) {
      if (i % 2 === 0) continue;
      const x = Math.round((w * i) / 20);
      const y = Math.round((h * i) / 20);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Major gridlines every 10% (with labels)
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,220,0,0.6)";
    for (let i = 0; i <= 10; i++) {
      const x = Math.round((w * i) / 10);
      const y = Math.round((h * i) / 10);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      if (i > 0 && i < 10) {
        const label = `${i * 10}`;
        ctx.setLineDash([]);
        ctx.font = `bold ${fontSize}px monospace`;
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

  function prepareImageForImagen(dataUrl: string, maxSize: number): Promise<{ base64: string; mediaType: string; w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve({ base64: jpegDataUrl.split(",")[1], mediaType: "image/jpeg", w: canvas.width, h: canvas.height });
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

      // Rasterize SVG design or resize raster design if present
      let designPayload: { base64: string; mediaType: "image/png" } | null = null;
      if (designSvg) {
        designPayload = await svgToPngBase64(designSvg, 512);
      } else if (designImageUrl) {
        designPayload = await rasterToPngBase64(designImageUrl, 512);
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
        // PASS 2: Refined detection on cropped region for better accuracy
        try {
          const crop = await cropImageForRefinement(photoUrl, data.corners, smallW, smallH);
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
          let refineData: any = null;
          try { refineData = JSON.parse(await refineResponse.text()); } catch { /* use pass 1 */ }

          let finalCorners = data.corners;
          let finalFeedback = { found: data.found ?? true, confidence: data.confidence ?? 0.7, reasoning: data.reasoning ?? "", targetDescription: data.targetDescription ?? "" };

          if (refineData?.corners && refineData?.found) {
            const cp = crop.cropPct;
            finalCorners = {
              topLeft:     [Math.round((cp.x1 + (refineData.corners.topLeft[0]     / crop.w) * (cp.x2 - cp.x1)) / 100 * smallW), Math.round((cp.y1 + (refineData.corners.topLeft[1]     / crop.h) * (cp.y2 - cp.y1)) / 100 * smallH)],
              topRight:    [Math.round((cp.x1 + (refineData.corners.topRight[0]    / crop.w) * (cp.x2 - cp.x1)) / 100 * smallW), Math.round((cp.y1 + (refineData.corners.topRight[1]    / crop.h) * (cp.y2 - cp.y1)) / 100 * smallH)],
              bottomRight: [Math.round((cp.x1 + (refineData.corners.bottomRight[0] / crop.w) * (cp.x2 - cp.x1)) / 100 * smallW), Math.round((cp.y1 + (refineData.corners.bottomRight[1] / crop.h) * (cp.y2 - cp.y1)) / 100 * smallH)],
              bottomLeft:  [Math.round((cp.x1 + (refineData.corners.bottomLeft[0]  / crop.w) * (cp.x2 - cp.x1)) / 100 * smallW), Math.round((cp.y1 + (refineData.corners.bottomLeft[1]  / crop.h) * (cp.y2 - cp.y1)) / 100 * smallH)],
            };
            finalFeedback = { found: refineData.found ?? true, confidence: refineData.confidence ?? 0.7, reasoning: refineData.reasoning ?? "", targetDescription: refineData.targetDescription ?? "" };
          }

          const scaleX = canvasW / smallW;
          const scaleY = canvasH / smallH;
          setCorners({
            topLeft:     [Math.round(finalCorners.topLeft[0] * scaleX),     Math.round(finalCorners.topLeft[1] * scaleY)],
            topRight:    [Math.round(finalCorners.topRight[0] * scaleX),    Math.round(finalCorners.topRight[1] * scaleY)],
            bottomRight: [Math.round(finalCorners.bottomRight[0] * scaleX), Math.round(finalCorners.bottomRight[1] * scaleY)],
            bottomLeft:  [Math.round(finalCorners.bottomLeft[0] * scaleX),  Math.round(finalCorners.bottomLeft[1] * scaleY)],
          });
          setAiFeedback(finalFeedback);
          if (refineData?.raw) setRawResponse(refineData.raw);
        } catch {
          const scaleX = canvasW / smallW; const scaleY = canvasH / smallH;
          setCorners({ topLeft: [Math.round(data.corners.topLeft[0]*scaleX), Math.round(data.corners.topLeft[1]*scaleY)], topRight: [Math.round(data.corners.topRight[0]*scaleX), Math.round(data.corners.topRight[1]*scaleY)], bottomRight: [Math.round(data.corners.bottomRight[0]*scaleX), Math.round(data.corners.bottomRight[1]*scaleY)], bottomLeft: [Math.round(data.corners.bottomLeft[0]*scaleX), Math.round(data.corners.bottomLeft[1]*scaleY)] });
          setAiFeedback({ found: data.found ?? true, confidence: data.confidence ?? 0.7, reasoning: data.reasoning ?? "", targetDescription: data.targetDescription ?? "" });
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

  async function handleAIEnhance() {
    if (!photoUrl) return;
    setEnhancing(true);
    setEnhanceError(null);
    setEnhancedImageUrl(null);
    try {
      // Load original building photo at natural resolution
      const buildingImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = photoUrl!;
      });
      const natW = buildingImg.naturalWidth;
      const natH = buildingImg.naturalHeight;

      // Get corners in natural image space
      let natCorners: CornerPoints | null = null;
      if (corners && canvasRef) {
        const sx = natW / canvasRef.width;
        const sy = natH / canvasRef.height;
        natCorners = {
          topLeft:     [corners.topLeft[0] * sx,     corners.topLeft[1] * sy],
          topRight:    [corners.topRight[0] * sx,    corners.topRight[1] * sy],
          bottomRight: [corners.bottomRight[0] * sx, corners.bottomRight[1] * sy],
          bottomLeft:  [corners.bottomLeft[0] * sx,  corners.bottomLeft[1] * sy],
        };
      } else {
        // Auto-detect corners using grid-annotated image for Claude
        const { base64: gridB64, mediaType: gridMT, w: apiW, h: apiH } = await prepareImageForApi(photoUrl, 1024);
        try {
          const analyzeRes = await fetch("/api/analyze-placement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              photoBase64: gridB64, mediaType: gridMT,
              instruction: instruction.trim() || "Detecteer ALLEEN het kleine gevelreclame-bord / winkellogo boven de ingang. Niet de hele gevel.",
              photoWidth: apiW, photoHeight: apiH,
            }),
          });
          const analyzeData = await analyzeRes.json();
          if (analyzeData.corners && analyzeData.found) {
            const sx = natW / apiW;
            const sy = natH / apiH;
            const raw = {
              topLeft:     [analyzeData.corners.topLeft[0] * sx,     analyzeData.corners.topLeft[1] * sy] as [number,number],
              topRight:    [analyzeData.corners.topRight[0] * sx,    analyzeData.corners.topRight[1] * sy] as [number,number],
              bottomRight: [analyzeData.corners.bottomRight[0] * sx, analyzeData.corners.bottomRight[1] * sy] as [number,number],
              bottomLeft:  [analyzeData.corners.bottomLeft[0] * sx,  analyzeData.corners.bottomLeft[1] * sy] as [number,number],
            };
            // Apply 5% inward tightening: prevents sign from extending too wide
            const cx = (raw.topLeft[0] + raw.topRight[0] + raw.bottomRight[0] + raw.bottomLeft[0]) / 4;
            const cy = (raw.topLeft[1] + raw.topRight[1] + raw.bottomRight[1] + raw.bottomLeft[1]) / 4;
            const tight = (pt: [number,number]): [number,number] => [cx + (pt[0]-cx)*0.93, cy + (pt[1]-cy)*0.93];
            natCorners = { topLeft: tight(raw.topLeft), topRight: tight(raw.topRight), bottomRight: tight(raw.bottomRight), bottomLeft: tight(raw.bottomLeft) };
          }
        } catch { /* continue without corners */ }
      }

      // Build composite: erase existing sign with white, then draw design on top
      let compositeB64: string | null = null;
      if (natCorners && (designSvg || designImageUrl)) {
        const Perspective = (await import("perspectivejs")).default;

        const signW = Math.round(Math.max(
          Math.hypot(natCorners.topRight[0]-natCorners.topLeft[0], natCorners.topRight[1]-natCorners.topLeft[1]),
          Math.hypot(natCorners.bottomRight[0]-natCorners.bottomLeft[0], natCorners.bottomRight[1]-natCorners.bottomLeft[1])
        ));
        const signH = Math.round(Math.max(
          Math.hypot(natCorners.bottomLeft[0]-natCorners.topLeft[0], natCorners.bottomLeft[1]-natCorners.topLeft[1]),
          Math.hypot(natCorners.bottomRight[0]-natCorners.topRight[0], natCorners.bottomRight[1]-natCorners.topRight[1])
        ));

        let designCanvas: HTMLCanvasElement;
        if (designSvg) {
          const { rasterizeSvg } = await import("@/lib/perspectiveEngine");
          designCanvas = await rasterizeSvg(designSvg, Math.max(signW, 64), Math.max(signH, 64));
        } else {
          designCanvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement("canvas");
              c.width = Math.max(signW, 64);
              c.height = Math.max(signH, 64);
              const cx = c.getContext("2d")!;
              cx.fillStyle = "white";
              cx.fillRect(0, 0, c.width, c.height);
              cx.drawImage(img, 0, 0, c.width, c.height);
              resolve(c);
            };
            img.onerror = reject;
            img.src = designImageUrl!;
          });
        }

        const compositeCanvas = document.createElement("canvas");
        compositeCanvas.width = natW;
        compositeCanvas.height = natH;
        const ctx = compositeCanvas.getContext("2d")!;

        // 1. Draw original building photo
        ctx.drawImage(buildingImg, 0, 0);

        // Helper to draw sign polygon path
        const signPath = () => {
          ctx.beginPath();
          ctx.moveTo(natCorners.topLeft[0], natCorners.topLeft[1]);
          ctx.lineTo(natCorners.topRight[0], natCorners.topRight[1]);
          ctx.lineTo(natCorners.bottomRight[0], natCorners.bottomRight[1]);
          ctx.lineTo(natCorners.bottomLeft[0], natCorners.bottomLeft[1]);
          ctx.closePath();
        };

        // 2. Cast shadow below the sign onto the wall
        const shadowH = Math.max(signH * 0.15, 20);
        const shadowGrad = ctx.createLinearGradient(
          0, natCorners.bottomLeft[1],
          0, natCorners.bottomLeft[1] + shadowH
        );
        shadowGrad.addColorStop(0, "rgba(0,0,0,0.35)");
        shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.moveTo(natCorners.bottomLeft[0] - 4, natCorners.bottomLeft[1]);
        ctx.lineTo(natCorners.bottomRight[0] + 4, natCorners.bottomRight[1]);
        ctx.lineTo(natCorners.bottomRight[0] + 4, natCorners.bottomRight[1] + shadowH);
        ctx.lineTo(natCorners.bottomLeft[0] - 4, natCorners.bottomLeft[1] + shadowH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 3. Draw sign board with soft drop shadow (canvas shadow API)
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.30)";
        ctx.shadowBlur = Math.max(signH * 0.06, 8);
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 5;
        ctx.fillStyle = "#f0f0f0";
        signPath();
        ctx.fill();
        ctx.restore();

        // 4. Off-white fill without shadow (crisp, on top)
        ctx.fillStyle = "#f0f0f0";
        signPath();
        ctx.fill();

        // 5. Draw design with source-over
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1.0;
        const p = new Perspective(ctx, designCanvas);
        p.draw([natCorners.topLeft, natCorners.topRight, natCorners.bottomRight, natCorners.bottomLeft]);

        // 6. Thin dark border around sign to give it a frame
        ctx.save();
        ctx.strokeStyle = "rgba(80,80,80,0.5)";
        ctx.lineWidth = Math.max(natW * 0.002, 2);
        signPath();
        ctx.stroke();
        ctx.restore();

        const scale = Math.min(1024 / compositeCanvas.width, 1024 / compositeCanvas.height, 1);
        const out = document.createElement("canvas");
        out.width = Math.round(compositeCanvas.width * scale);
        out.height = Math.round(compositeCanvas.height * scale);
        out.getContext("2d")!.drawImage(compositeCanvas, 0, 0, out.width, out.height);
        compositeB64 = out.toDataURL("image/jpeg", 0.92).split(",")[1];
      } else if (canvasRef && corners) {
        // Canvas already has composite — use directly
        const scale = Math.min(1024 / canvasRef.width, 1024 / canvasRef.height, 1);
        const out = document.createElement("canvas");
        out.width = Math.round(canvasRef.width * scale);
        out.height = Math.round(canvasRef.height * scale);
        out.getContext("2d")!.drawImage(canvasRef, 0, 0, out.width, out.height);
        compositeB64 = out.toDataURL("image/jpeg", 0.92).split(",")[1];
      }

      if (compositeB64) {
        // Try Gemini; fall back to composite directly if it times out
        try {
          const res = await fetch("/api/ai-enhance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              compositeBase64: compositeB64,
              photoMediaType: "image/jpeg",
            }),
          });
          const data = await res.json();
          if (data.error) {
            // Fallback: show composite directly
            setEnhancedImageUrl(`data:image/jpeg;base64,${compositeB64}`);
            setEnhanceError(`Gemini niet beschikbaar (${data.error.substring(0,60)}). Composite getoond.`);
          } else {
            setEnhancedImageUrl(`data:${data.mediaType};base64,${data.imageBase64}`);
          }
        } catch {
          setEnhancedImageUrl(`data:image/jpeg;base64,${compositeB64}`);
        }
      } else {
        setEnhanceError("Geen ontwerp of hoekpunten gevonden om te plaatsen.");
      }
    } catch (err) {
      setEnhanceError(err instanceof Error ? err.message : "Onbekende fout");
    }
    setEnhancing(false);
  }

  function confidenceColor(c: number) {
    if (c >= 0.7) return "bg-green-100 text-green-800 border-green-200";
    if (c >= 0.4) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-red-100 text-red-800 border-red-200";
  }

  if (loading) return <p className="text-[var(--color-stebo-mute)]">Laden...</p>;
  if (!project) return <p className="text-red-600">Project niet gevonden</p>;

  return (
    <div className="max-w-6xl">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-stebo-blue-700)] uppercase mb-2">
            <span className="inline-block w-6 h-px bg-[var(--color-stebo-yellow)] align-middle mr-2" />
            Stap 3 — Preview
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-stebo-ink)]">
            {project.name}
          </h1>
          <p className="text-[var(--color-stebo-mute)] mt-1.5">Pand-preview met AI plaatsing (Gemini)</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/calculator/${projectId}`} className="btn-ghost">
            Calculator
          </Link>
          <Link href={`/cut/${projectId}`} className="btn-primary">
            Snij-workflow →
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-2">
              Gevelfoto
            </h3>
            <FileUpload
              accept="image/*"
              label="Upload foto van het pand"
              onFileLoaded={handlePhotoLoaded}
              readAsText={false}
            />
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-2">
              Ontwerp (SVG, PNG of JPEG)
            </h3>
            <FileUpload
              accept=".svg,image/svg+xml,image/png,image/jpeg"
              label="Upload ontwerp"
              onFileLoaded={handleDesignLoaded}
              readAsText={false}
            />
            {designSvg && (
              <p className="text-xs text-[var(--color-stebo-blue-700)] mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-stebo-yellow)]" /> SVG geladen — AI gebruikt dit als referentie
              </p>
            )}
            {designImageUrl && (
              <p className="text-xs text-[var(--color-stebo-blue-700)] mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-stebo-yellow)]" /> Afbeelding geladen — AI gebruikt dit als referentie
              </p>
            )}
          </div>

          {/* AI Placement */}
          <div className="card p-4 border-[var(--color-stebo-blue-200)] bg-[var(--color-stebo-blue-50)]">
            <h3 className="font-semibold mb-3 text-sm flex items-center gap-2 text-[var(--color-stebo-blue-900)]">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[var(--color-stebo-yellow)] text-[var(--color-stebo-blue-900)] text-[10px] font-bold">AI</span>
              <span>Plaatsing met Gemini</span>
            </h3>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Bijv. 'vervang het Blokker logo door ons ontwerp' of 'plaats het SVG boven de deur'"
              className="input-stebo text-sm mb-2"
              rows={3}
            />
            <button
              onClick={analyzeWithClaude}
              disabled={analyzing || !instruction.trim() || !photoUrl}
              className="btn-primary w-full"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Gemini analyseert...
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
                  <p className="text-xs text-[var(--color-stebo-mute)] italic">{aiFeedback.targetDescription}</p>
                )}
                {aiFeedback.reasoning && (
                  <p className="text-xs text-[var(--color-stebo-mute)]">{aiFeedback.reasoning}</p>
                )}

                {/* Refine */}
                <div className="border-t border-[var(--color-stebo-blue-200)] pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1">
                    Verfijn plaatsing
                  </p>
                  <textarea
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                    placeholder="Bijv. 'maak het groter' of 'schuif naar rechts'"
                    className="input-stebo text-xs"
                    rows={2}
                  />
                  <button
                    onClick={refineWithClaude}
                    disabled={analyzing || !refineText.trim()}
                    className="btn-ghost w-full mt-1 text-xs"
                  >
                    {analyzing ? "Verfijnen..." : "Verfijn"}
                  </button>
                </div>

                {/* Raw toggle */}
                {rawResponse && (
                  <button
                    onClick={() => setShowRaw((v) => !v)}
                    className="text-xs text-[var(--color-stebo-mute)] hover:text-[var(--color-stebo-ink)] underline underline-offset-2"
                  >
                    {showRaw ? "Verberg" : "Toon"} Gemini-antwoord
                  </button>
                )}
                {showRaw && rawResponse && (
                  <pre className="text-xs bg-white p-2 rounded overflow-x-auto whitespace-pre-wrap break-all border border-[var(--color-stebo-line)] font-mono">
                    {rawResponse}
                  </pre>
                )}
              </div>
            )}
          </div>

          <ol className="text-xs text-[var(--color-stebo-mute)] space-y-1 pl-1">
            {[
              "Upload een foto van het pand",
              "Upload het SVG ontwerp",
              "Geef instructie voor de plaatsing",
              "Of sleep de hoekpunten handmatig",
              "Exporteer als PNG",
            ].map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono font-semibold text-[var(--color-stebo-blue-700)] flex-shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-2">
          {photoUrl && (
            <p className="text-xs text-[var(--color-stebo-blue-700)] mb-2 font-semibold flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-[var(--color-stebo-yellow)] border-2 border-[var(--color-stebo-blue-700)]" />
              Sleep een gebied op de foto — of versleep de blauwe hoekpunten
            </p>
          )}
          <div className="card p-2 overflow-hidden">
            <BuildingCanvas
              buildingPhotoUrl={photoUrl}
              designSvg={designSvg}
              designImageUrl={designImageUrl}
              onCornersChange={handleCornersChange}
              onExport={handleExport}
              setCanvasRef={setCanvasRef}
              initialCorners={corners}
              clickToPlace={true}
            />
          </div>

          {photoUrl && (
            <div className="mt-4 space-y-3">
              <div>
                <button
                  onClick={handleAIEnhance}
                  disabled={enhancing || !instruction.trim()}
                  className="btn-yellow w-full py-3"
                >
                  {enhancing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Gemini...
                    </span>
                  ) : "✨ Genereer foto-realistische preview"}
                </button>
                {enhanceError && <p className="mt-1 text-xs text-red-600">{enhanceError}</p>}
              </div>

              {enhancedImageUrl && (
                <div className="card p-3 mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-blue-700)] mb-2">
                    Gemini resultaat
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={enhancedImageUrl} alt="Gemini" className="w-full rounded-lg border border-[var(--color-stebo-line)]" />
                  <a
                    href={enhancedImageUrl}
                    download={`${project?.name || "preview"}-gemini.jpg`}
                    className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-[var(--color-stebo-blue-700)] hover:text-[var(--color-stebo-blue-800)] underline underline-offset-2"
                  >
                    Download
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
