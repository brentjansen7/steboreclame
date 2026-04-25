"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import ColorList from "@/components/ColorList";
import { analyzeSvg, analyzeRaster, svgUnitsToMm } from "@/lib/svgAnalyzer";
import { calculateVinyl, formatTotalCost } from "@/lib/vinylCalculator";
import { supabase } from "@/lib/supabase";
import type { ColorGroup } from "@/types";

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
  const [saving, setSaving] = useState(false);

  async function handleDesignLoaded(content: string, name: string, file: File) {
    setFileName(name);
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(name);

    if (isSvg) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const svgText = e.target?.result as string;
        setSvgContent(svgText);
        setDesignImageUrl(null);

        const { colorGroups: groups, viewBox } = analyzeSvg(svgText);
        const price = pricePerMeter ? parseFloat(pricePerMeter) : null;
        const results = calculateVinyl(groups, rollWidth, price, viewBox);
        setColorGroups(results);
      };
      reader.readAsText(file);
    } else {
      setSvgContent(null);
      setDesignImageUrl(content);

      const { colorGroups: groups, viewBox } = await analyzeRaster(content);
      const price = pricePerMeter ? parseFloat(pricePerMeter) : null;
      const results = calculateVinyl(groups, rollWidth, price, viewBox);
      setColorGroups(results);
    }
  }

  function recalculate() {
    if (!svgContent) return;
    const { colorGroups: groups, viewBox } = analyzeSvg(svgContent);
    const price = pricePerMeter ? parseFloat(pricePerMeter) : null;
    const results = calculateVinyl(groups, rollWidth, price, viewBox);
    setColorGroups(results);
  }

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

    let viewBox = { width: 1000, height: 1000 };
    if (svgContent) {
      const analyzed = analyzeSvg(svgContent);
      viewBox = analyzed.viewBox;
    } else if (designImageUrl) {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = designImageUrl;
      });
      viewBox = { width: img.naturalWidth, height: img.naturalHeight };
    }
    const widthMm = svgUnitsToMm(viewBox.width, viewBox.width);
    const heightMm = svgUnitsToMm(viewBox.height, viewBox.width);

    await supabase.from("designs").insert({
      project_id: projectId,
      file_path: filePath,
      file_name: fileName,
      colors: colorGroups.map((g) => g.color),
      width_mm: widthMm,
      height_mm: heightMm,
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

      {svgContent && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold mb-4">Instellingen</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Folierol breedte
              </label>
              <select
                value={rollWidth}
                onChange={(e) => {
                  setRollWidth(parseInt(e.target.value));
                  setTimeout(recalculate, 0);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={630}>63 cm (standaard)</option>
                <option value={1260}>126 cm (breed)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Inkoopprijs per meter folie (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricePerMeter}
                onChange={(e) => {
                  setPricePerMeter(e.target.value);
                  setTimeout(recalculate, 0);
                }}
                placeholder="bijv. 4.50"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
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
                <div
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
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
