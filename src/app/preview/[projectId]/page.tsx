"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import FileUpload from "@/components/FileUpload";
import BuildingCanvas from "@/components/BuildingCanvas";
import { downloadPreview } from "@/lib/perspectiveEngine";
import type { CornerPoints } from "@/lib/perspectiveEngine";
import type { Project, Design } from "@/types";

export default function PreviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [designSvg, setDesignSvg] = useState<string | null>(null);
  const [corners, setCorners] = useState<CornerPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    const { data: proj } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    setProject(proj);

    const { data: des } = await supabase
      .from("designs")
      .select("*")
      .eq("project_id", projectId);
    setDesigns(des || []);

    const { data: preview } = await supabase
      .from("previews")
      .select("*")
      .eq("project_id", projectId)
      .single();

    if (preview) {
      const { data: photoData } = supabase.storage
        .from("photos")
        .getPublicUrl(preview.photo_path);
      setPhotoUrl(photoData.publicUrl);
      setCorners(preview.corners as unknown as CornerPoints);
    }

    if (des && des.length > 0) {
      const { data: svgFile } = await supabase.storage
        .from("designs")
        .download(des[0].file_path);
      if (svgFile) {
        setDesignSvg(await svgFile.text());
      }
    }

    setLoading(false);
  }

  async function handlePhotoLoaded(
    dataUrl: string,
    fileName: string,
    file: File
  ) {
    // Use local base64 dataUrl directly — no Supabase needed for display
    setPhotoUrl(dataUrl);

    // Try to save to Supabase in background (may fail behind firewall)
    try {
      const filePath = `${projectId}/${Date.now()}-${fileName}`;
      await supabase.storage.from("photos").upload(filePath, file);
      await supabase.from("previews").upsert(
        {
          project_id: projectId,
          photo_path: filePath,
          corners: corners || {
            topLeft: [100, 100],
            topRight: [400, 100],
            bottomRight: [400, 300],
            bottomLeft: [100, 300],
          },
        },
        { onConflict: "project_id" }
      );
    } catch {
      // Silently ignore — local display works without Supabase
    }
  }

  const [aiError, setAiError] = useState<string | null>(null);

  async function analyzeWithClaude() {
    setAiError(null);
    if (!photoUrl) { setAiError("Upload eerst een gevelfoto."); return; }
    if (!instruction.trim()) { setAiError("Typ een instructie."); return; }
    setAnalyzing(true);

    try {
      const response = await fetch("/api/analyze-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrl,
          instruction,
          photoWidth: canvasRef?.width || 800,
          photoHeight: canvasRef?.height || 500,
        }),
      });

      const data = await response.json();
      if (data.error) {
        setAiError(data.error);
      } else if (data.corners) {
        setCorners(data.corners);
      }
    } catch (error) {
      setAiError("Verbindingsfout. Probeer opnieuw.");
      console.error("Analyse mislukt:", error);
    }

    setAnalyzing(false);
  }

  async function handleCornersChange(newCorners: CornerPoints) {
    setCorners(newCorners);
    await supabase
      .from("previews")
      .update({ corners: newCorners as unknown as Record<string, unknown> })
      .eq("project_id", projectId);
  }

  async function handleExport(canvas: HTMLCanvasElement) {
    downloadPreview(canvas, `${project?.name || "preview"}.png`);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const filePath = `${projectId}/preview-${Date.now()}.png`;
      await supabase.storage.from("exports").upload(filePath, blob);
      await supabase
        .from("previews")
        .update({ export_path: filePath })
        .eq("project_id", projectId);
    });
  }

  async function handleDesignSelect(designId: string) {
    const design = designs.find((d) => d.id === designId);
    if (!design) return;
    try {
      const { data } = await supabase.storage
        .from("designs")
        .download(design.file_path);
      if (data) {
        setDesignSvg(await data.text());
      }
    } catch {
      // Silently ignore if Supabase is unreachable
    }
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
        {/* Left: uploads + instruction */}
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
            {designs.length > 0 && (
              <select
                onChange={(e) => handleDesignSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
              >
                {designs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.file_name}
                  </option>
                ))}
              </select>
            )}
            <FileUpload
              accept=".svg"
              label="Of upload SVG lokaal"
              onFileLoaded={(text) => setDesignSvg(text)}
              readAsText
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold mb-2 text-sm">
                AI Plaatsing Assistant
              </h3>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Bijv. 'plaats het logo linksboven op de gevel' of 'zet de tekst midden op het raam'"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
              <button
                onClick={analyzeWithClaude}
                disabled={analyzing || !instruction.trim()}
                className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
              >
                {analyzing ? "Claude analyseert..." : "AI plaatsing berekenen"}
              </button>
              {aiError && (
                <p className="text-xs text-red-600 mt-2 font-medium">{aiError}</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Claude Vision bepaalt automatisch waar het ontwerp moet op basis van je instructie
              </p>
            </div>

          <div className="text-sm text-gray-500 space-y-1">
            <p>1. Upload een foto van het pand</p>
            <p>2. Selecteer het ontwerp</p>
            <p>3. Geef instructie aan Claude</p>
            <p>4. Sleep hoekpunten (optioneel)</p>
            <p>5. Exporteer als PNG</p>
          </div>
        </div>

        {/* Right: canvas */}
        <div className="col-span-2">
          <BuildingCanvas
            buildingPhotoUrl={photoUrl}
            designSvg={designSvg}
            onCornersChange={handleCornersChange}
            onExport={handleExport}
            canvasRef={canvasRef}
            setCanvasRef={setCanvasRef}
          />
        </div>
      </div>
    </div>
  );
}
