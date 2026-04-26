"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import ColorList from "@/components/ColorList";
import { analyzeSvg, analyzeRaster } from "@/lib/svgAnalyzer";
import { calculateVinyl, calculateVinylFromFractions, formatTotalCost } from "@/lib/vinylCalculator";
import { supabase } from "@/lib/supabase";
import { loadColorPrices, findPriceForColor, type ColorPrice } from "@/lib/colorPrices";
import type { ColorGroup } from "@/types";
import Link from "next/link";

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
  const [realHeightCm, setRealHeightCm] = useState<string>("");
  const [heightLocked, setHeightLocked] = useState<boolean>(true); // auto-fill from aspect until user edits
  const [aspect, setAspect] = useState<number>(1); // height / width
  const [rasterColors, setRasterColors] = useState<RasterColors | null>(null);
  const [svgViewBox, setSvgViewBox] = useState<{ width: number; height: number } | null>(null);
  const [colorPrices, setColorPrices] = useState<ColorPrice[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setColorPrices(loadColorPrices());
  }, []);

  async function handleDesignLoaded(content: string, name: string, file: File) {
    setFileName(name);
    setColorGroups([]);
    setHeightLocked(true); // re-enable auto-fill on new design
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

  // Auto-fill height from width × aspect while user hasn't manually edited height
  useEffect(() => {
    if (!heightLocked) return;
    const w = parseFloat(realWidthCm);
    if (w > 0) {
      setRealHeightCm((w * aspect).toFixed(1));
    } else {
      setRealHeightCm("");
    }
  }, [realWidthCm, aspect, heightLocked]);

  // Recalculate whenever inputs change
  useEffect(() => {
    const widthMm = parseFloat(realWidthCm) * 10;
    const heightMm = parseFloat(realHeightCm) * 10;
    if (!widthMm || !heightMm || widthMm <= 0 || heightMm <= 0) {
      setColorGroups([]);
      return;
    }
    const price = pricePerMeter ? parseFloat(pricePerMeter) : null;
    const priceForColor = (hex: string) => findPriceForColor(hex, colorPrices);

    if (svgContent && svgViewBox) {
      const { colorGroups: groups } = analyzeSvg(svgContent);
      const results = calculateVinyl(groups, rollWidth, price, svgViewBox, widthMm, priceForColor);
      setColorGroups(results);
    } else if (rasterColors) {
      const results = calculateVinylFromFractions(rasterColors, widthMm, heightMm, rollWidth, price, priceForColor);
      setColorGroups(results);
    }
  }, [realWidthCm, realHeightCm, pricePerMeter, rollWidth, svgContent, svgViewBox, rasterColors, colorPrices]);

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
    const heightMm = parseFloat(realHeightCm) * 10;

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
    <div className="max-w-5xl">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-stebo-blue-700)] uppercase mb-2">
          <span className="inline-block w-6 h-px bg-[var(--color-stebo-yellow)] align-middle mr-2" />
          Stap 1 — Ontwerp
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-stebo-ink)]">
          Ontwerp uploaden
        </h1>
        <p className="text-[var(--color-stebo-mute)] mt-1.5">
          SVG geeft de meest precieze berekening. PNG/JPEG werkt ook voor schattingen.
        </p>
      </header>

      <div className="mb-6">
        <FileUpload
          accept=".svg,image/svg+xml,image/png,image/jpeg"
          label="Upload ontwerp (SVG, PNG of JPEG)"
          onFileLoaded={handleDesignLoaded}
          readAsText={false}
        />
      </div>

      {designReady && (
        <div className="card p-6 mb-6">
          <h3 className="section-title text-lg mb-6">Afmetingen op de gevel</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
                Werkelijke breedte (cm) *
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={realWidthCm}
                onChange={(e) => setRealWidthCm(e.target.value)}
                placeholder="bijv. 200"
                className="input-stebo"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
                <span>Werkelijke hoogte (cm) *</span>
                {heightLocked && (
                  <span className="font-normal normal-case tracking-normal text-[10px] text-[var(--color-stebo-blue-700)] bg-[var(--color-stebo-blue-50)] px-2 py-0.5 rounded">
                    auto uit verhouding
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={realHeightCm}
                  onChange={(e) => {
                    setHeightLocked(false);
                    setRealHeightCm(e.target.value);
                  }}
                  placeholder="bijv. 80"
                  className="input-stebo flex-1"
                />
                {!heightLocked && (
                  <button
                    type="button"
                    onClick={() => setHeightLocked(true)}
                    className="btn-ghost"
                    title="Herstel verhouding van ontwerp"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
                Folierol breedte
              </label>
              <select
                value={rollWidth}
                onChange={(e) => setRollWidth(parseInt(e.target.value))}
                className="input-stebo appearance-none"
              >
                <option value={630}>63 cm (standaard)</option>
                <option value={1260}>126 cm (breed)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
                Standaardprijs per meter (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricePerMeter}
                onChange={(e) => setPricePerMeter(e.target.value)}
                placeholder="bijv. 4.50"
                className="input-stebo"
              />
              <p className="text-xs text-[var(--color-stebo-mute)] mt-1.5 leading-relaxed">
                Gebruikt voor kleuren zonder eigen prijs. Stel per kleur in via{" "}
                <Link href="/instellingen" className="text-[var(--color-stebo-blue-700)] underline underline-offset-2">
                  Instellingen
                </Link>
                {colorPrices.length > 0 && ` (${colorPrices.length} kleuren ingesteld)`}.
              </p>
            </div>
          </div>
          {!widthValid && (
            <div className="mt-4 flex gap-2 items-start text-sm bg-[var(--color-stebo-yellow-50)] border-l-4 border-[var(--color-stebo-yellow)] rounded-r p-3">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--color-stebo-yellow-700)]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <span className="text-[var(--color-stebo-ink)]">
                Vul eerst breedte en hoogte in om folie per kleur te berekenen.
              </span>
            </div>
          )}
        </div>
      )}

      {colorGroups.length > 0 && (
        <>
          <ColorList colorGroups={colorGroups} totalCost={totalCost} />

          <div className="mt-6 card p-6">
            <h3 className="section-title text-lg mb-6">Ontwerp preview</h3>
            <div
              className="bg-[var(--color-stebo-paper)] border border-dashed border-[var(--color-stebo-line)] rounded-lg p-6 flex justify-center"
              style={{ maxHeight: 400, overflow: "auto" }}
            >
              {svgContent ? (
                <div dangerouslySetInnerHTML={{ __html: svgContent }} />
              ) : designImageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={designImageUrl}
                  alt="Design preview"
                  style={{ maxWidth: "100%", maxHeight: "100%" }}
                />
              ) : null}
            </div>
          </div>

          {projectId && (
            <div className="mt-6 flex items-center justify-between gap-4 card p-5 bg-[var(--color-stebo-blue-700)] text-white border-[var(--color-stebo-blue-700)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-yellow)]">
                  Klaar
                </p>
                <p className="font-semibold">Opslaan en doorgaan naar de calculator</p>
              </div>
              <button
                onClick={saveDesign}
                disabled={saving}
                className="btn-yellow"
              >
                {saving ? "Opslaan..." : "Opslaan & verder →"}
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
    <Suspense fallback={<p className="text-[var(--color-stebo-mute)]">Laden...</p>}>
      <UploadContent />
    </Suspense>
  );
}
