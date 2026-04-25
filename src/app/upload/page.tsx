"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import ColorList from "@/components/ColorList";
import { analyzeSvg, analyzeRaster } from "@/lib/svgAnalyzer";
import { calculateVinyl, calculateVinylFromFractions, formatTotalCost } from "@/lib/vinylCalculator";
import { supabase } from "@/lib/supabase";
import type { ColorGroup } from "@/types";

type RasterColors = { hex: string; fraction: number }[];

function UploadContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("projectId");

  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [designImageUrl, setDesignImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [rollWidth, setRollWidth] = useState<number>(630);
  const [pricePerMeter, setPricePerMeter] = useState<string>("");
  const [realWidthCm, setRealWidthCm] = useState<string>("");
  const [aspect, setAspect] = useState<number>(1); // height / width
  const [rasterColors, setRasterColors] = useState<RasterColors | null>(null);
  const [svgViewBox, setSvgViewBox] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleDesignLoaded(content: string, name: string, file: File) {
    setFileName(name);
    setColorGroups([]);
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(name);

    if (isSvg) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgText = e.target?.result as string;
        setSvgContent(svgText);
        setDesignImageUrl(null);
        setRasterColors(null);

        const { viewBox } = analyzeSvg(svgText);
        setSvgViewBox(viewBox);
        setAspect(viewBox.height / viewBox.width);
      };
      reader.readAsText(file);
    } else {
      setSvgContent(null);
      setSvgViewBox(null);
      setDesignImageUrl(content);

      const { colors, viewBox } = await analyzeRaster(content);
      setRasterColors(colors);
      setAspect(viewBox.height / viewBox.width);
    }
  }

  // Recalculate whenever inputs change
  useEffect(() => {
    const widthMm = parseFloat(realWidthCm) * 10;
    if (!widthMm || widthMm <= 0) {
      setColorGroups([]);
      return;
    }
    const heightMm = widthMm * aspect;
    const price = pricePerMeter ? parseFloat(pricePerMeter) : null;

    if (svgContent && svgViewBox) {
      const { colorGroups: groups } = analyzeSvg(svgContent);
      const results = calculateVinyl(groups, rollWidth, price, svgViewBox, widthMm);
      setColorGroups(results);
    } else if (rasterColors) {
      const results = calculateVinylFromFractions(rasterColors, widthMm, heightMm, rollWidth, price);
      setColorGroups(results);
    }
  }, [realWidthCm, pricePerMeter, rollWidth, svgContent, svgViewBox, rasterColors, aspect]);

  async function saveDesign() {
    if ((!svgContent && !designImageUrl) || !projectId) return;
    setSaving(true);

    const filePath = `${projectId}/${Date.now()}-${fileName}`;
    if (svgContent) {
      await supabase.storage
        .from("designs")
        .upload(filePath, new Blob([svgContent], { type: "image/svg+xml" }));
    } else if (designImageUrl) {
      const blob = await fetch(designImageUrl).then((r) => r.blob());
      await supabase.storage.from("designs").upload(filePath, blob);
    }

    const widthMm = parseFloat(realWidthCm) * 10;
    const heightMm = widthMm * aspect;

    await supabase.from("designs").insert({
      project_id: projectId,
      file_path: filePath,
      file_name: fileName,
      colors: colorGroups.map((g) => g.color),
      width_mm: widthMm || null,
      height_mm: heightMm || null,
    });

    if (pricePerMeter) {
      await supabase
        .from("projects")
        .update({
          roll_width: rollWidth,
          price_per_m: parseFloat(pricePerMeter),
        })
        .eq("id", projectId);
    }

    setSaving(false);
    router.push(`/calculator/${projectId}`);
  }

  const totalCost = formatTotalCost(colorGroups);
  const designReady = !!(svgContent || designImageUrl);
  const widthValid = parseFloat(realWidthCm) > 0;

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Ontwerp uploaden</h1>

      <div className="mb-6">
        <FileUpload
          accept=".svg,image/svg+xml,image/png,image/jpeg"
          label="Upload ontwerp (SVG, PNG of JPEG)"
          onFileLoaded={handleDesignLoaded}
          readAsText={false}
        />
      </div>

      {designReady && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold mb-4">Afmetingen op de gevel</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Werkelijke breedte (cm) *
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={realWidthCm}
                onChange={(e) => setRealWidthCm(e.target.value)}
                placeholder="bijv. 200"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {widthValid && (
                <p className="text-xs text-gray-500 mt-1">
                  Hoogte: {(parseFloat(realWidthCm) * aspect).toFixed(0)} cm (bewaard van ontwerp)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Folierol breedte
              </label>
              <select
                value={rollWidth}
                onChange={(e) => setRollWidth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={630}>63 cm (standaard)</option>
                <option value={1260}>126 cm (breed)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inkoopprijs per meter folie (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricePerMeter}
                onChange={(e) => setPricePerMeter(e.target.value)}
                placeholder="bijv. 4.50"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {!widthValid && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
              Vul eerst de werkelijke breedte in om folie per kleur te berekenen.
            </p>
          )}
        </div>
      )}

      {colorGroups.length > 0 && (
        <>
          <ColorList colorGroups={colorGroups} totalCost={totalCost} />

          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold mb-3">Ontwerp preview</h3>
            <div
              className="bg-gray-100 rounded-lg p-4 flex justify-center"
              style={{ maxHeight: 400, overflow: "auto" }}
            >
              {svgContent ? (
                <div dangerouslySetInnerHTML={{ __html: svgContent }} />
              ) : designImageUrl ? (
                <img
                  src={designImageUrl}
                  alt="Design preview"
                  style={{ maxWidth: "100%", maxHeight: "100%" }}
                />
              ) : null}
            </div>
          </div>

          {projectId && (
            <div className="mt-6">
              <button
                onClick={saveDesign}
                disabled={saving}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
              >
                {saving ? "Opslaan..." : "Opslaan & ga naar calculator"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">Laden...</p>}>
      <UploadContent />
    </Suspense>
  );
}
