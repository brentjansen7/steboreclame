"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import FileUpload from "@/components/FileUpload";
import BuildingCanvas from "@/components/BuildingCanvas";
import { downloadPreview } from "@/lib/perspectiveEngine";
import type { CornerPoints } from "@/lib/perspectiveEngine";
import type { Project } from "@/types";

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
  }

  function handleSvgLoaded(text: string) {
    setDesignSvg(text);
  }

  // Resize image and return { base64, mediaType, width, height }
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
        // Use low quality JPEG to keep payload small
        const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.5);
        const base64 = jpegDataUrl.split(",")[1];
        resolve({ base64, mediaType: "image/jpeg", w: canvas.width, h: canvas.height });
      };
      img.src = dataUrl;
    });
  }

  async function analyzeWithClaude() {
    setAiError(null);
    if (!photoUrl) { setAiError("Upload eerst een gevelfoto."); return; }
    if (!instruction.trim()) { setAiError("Typ een instructie."); return; }
    setAnalyzing(true);

    try {
      // Prepare small JPEG for Claude — send resized dimensions, scale back after
      const actualW = canvasRef?.width || 800;
      const actualH = canvasRef?.height || 500;
      const { base64, mediaType, w: smallW, h: smallH } = await prepareImageForApi(photoUrl, 600);

      const response = await fetch("/api/analyze-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoBase64: base64,
          mediaType,
          instruction,
          photoWidth: smallW,
          photoHeight: smallH,
        }),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setAiError(`Server gaf ongeldig antwoord: ${text.substring(0, 100)}`);
        setAnalyzing(false);
        return;
      }

      if (data.error) {
        setAiError(data.error);
      } else if (data.corners) {
        // Scale corners from small image coordinates to actual canvas coordinates
        const scaleX = actualW / smallW;
        const scaleY = actualH / smallH;
        const scaled = {
          topLeft: [Math.round(data.corners.topLeft[0] * scaleX), Math.round(data.corners.topLeft[1] * scaleY)] as [number, number],
          topRight: [Math.round(data.corners.topRight[0] * scaleX), Math.round(data.corners.topRight[1] * scaleY)] as [number, number],
          bottomRight: [Math.round(data.corners.bottomRight[0] * scaleX), Math.round(data.corners.bottomRight[1] * scaleY)] as [number, number],
          bottomLeft: [Math.round(data.corners.bottomLeft[0] * scaleX), Math.round(data.corners.bottomLeft[1] * scaleY)] as [number, number],
        };
        setCorners(scaled);
        setAiError(null);
      } else {
        setAiError("Geen plaatsing ontvangen van Claude. Probeer opnieuw.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Onbekende fout";
      setAiError(`Fout: ${msg}`);
      console.error("Analyse mislukt:", error);
    }

    setAnalyzing(false);
  }

  function handleCornersChange(newCorners: CornerPoints) {
    setCorners(newCorners);
  }

  function handleExport(canvas: HTMLCanvasElement) {
    downloadPreview(canvas, `${project?.name || "preview"}.png`);
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
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold mb-2 text-sm">AI Plaatsing Assistant</h3>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Bijv. 'plaats het logo op de gevel boven de deur' of 'zet het ontwerp over het blokker logo'"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
            <button
              onClick={analyzeWithClaude}
              disabled={analyzing || !instruction.trim() || !photoUrl}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {analyzing ? "Claude analyseert..." : "AI plaatsing berekenen"}
            </button>
            {aiError && (
              <p className="text-xs text-red-600 mt-2 font-medium">{aiError}</p>
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
          <BuildingCanvas
            buildingPhotoUrl={photoUrl}
            designSvg={designSvg}
            onCornersChange={handleCornersChange}
            onExport={handleExport}
            setCanvasRef={setCanvasRef}
            initialCorners={corners}
          />
        </div>
      </div>
    </div>
  );
}
