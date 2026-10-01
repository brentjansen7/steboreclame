"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import ColorList from "@/components/ColorList";
import LayerTable from "@/components/LayerTable";
import { analyzeRaster } from "@/lib/svgAnalyzer";
import { calculateVinylFromFractions, formatTotalCost } from "@/lib/vinylCalculator";
import { measureDesign, type ColorLayer } from "@/lib/colorLayers";
import { convertPdf, defaultExcluded, designAspect, extractLayers, includedLayers } from "@/lib/designLayers";
import { downloadLayerCutFile, downloadLayerPdf } from "@/lib/layerExport";
import { adviseLayers } from "@/lib/layerAdvice";
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
  const [layers, setLayers] = useState<ColorLayer[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<string>("1");
  const [colorPrices, setColorPrices] = useState<ColorPrice[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    setColorPrices(loadColorPrices());
  }, []);

  function loadVectorDesign(svgText: string) {
    const found = extractLayers(svgText);
    const skip = defaultExcluded(found);
    setSvgContent(svgText);
    setDesignImageUrl(null);
    setRasterColors(null);
    setLayers(found);
    setExcluded(skip);
    setAspect(designAspect(includedLayers(found, skip)));
  }

  async function handleDesignLoaded(content: string, name: string, file: File) {
    setFileName(name);
    setColorGroups([]);
    setLoadError(null);
    setHeightLocked(true); // re-enable auto-fill on new design
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(name);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(name);

    if (isPdf) {
      setConverting(true);
      try {
        loadVectorDesign(await convertPdf(file));
      } catch (err) {
        setSvgContent(null);
        setLayers([]);
        setLoadError(err instanceof Error ? err.message : "PDF kon niet gelezen worden");
      } finally {
        setConverting(false);
      }
    } else if (isSvg) {
      const reader = new FileReader();
      reader.onload = (e) => loadVectorDesign(e.target?.result as string);
      reader.readAsText(file);
    } else {
      setSvgContent(null);
      setLayers([]);
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

    if (rasterColors) {
      const results = calculateVinylFromFractions(rasterColors, widthMm, heightMm, rollWidth, price, priceForColor);
      setColorGroups(results);
    }
  }, [realWidthCm, realHeightCm, pricePerMeter, rollWidth, rasterColors, colorPrices]);

  // Vector designs (SVG/PDF): exact measurements per colour layer
  const activeLayers = useMemo(() => includedLayers(layers, excluded), [layers, excluded]);
  const qty = Math.max(1, parseInt(quantity) || 1);
  const measurement = useMemo(() => {
    const widthMm = parseFloat(realWidthCm) * 10;
    if (!svgContent || activeLayers.length === 0 || !(widthMm > 0)) return null;
    return measureDesign({
      layers: activeLayers,
      realWidthMm: widthMm,
      quantity: qty,
      rollWidthMm: rollWidth,
      pricePerMeter: pricePerMeter ? parseFloat(pricePerMeter) : null,
      priceForColor: (hex) => findPriceForColor(hex, colorPrices),
    });
  }, [svgContent, activeLayers, realWidthCm, qty, rollWidth, pricePerMeter, colorPrices]);

  // Nearest vinyl colour + points to check, all computed in code
  const advice = useMemo(
    () => (measurement ? adviseLayers(measurement, activeLayers, rollWidth) : null),
    [measurement, activeLayers, rollWidth]
  );

  function toggleLayer(color: string) {
    const next = excluded.includes(color) ? excluded.filter((c) => c !== color) : [...excluded, color];
    setExcluded(next);
    setAspect(designAspect(includedLayers(layers, next)));
  }

  async function saveDesign() {
    if ((!svgContent && !designImageUrl) || !projectId) return;
    setSaving(true);
    setSaveError(null);

    // PDFs are stored as the converted SVG
    const storedName = svgContent ? (fileName || "ontwerp").replace(/\.pdf$/i, ".svg") : fileName;
    const filePath = `${projectId}/${Date.now()}-${storedName}`;
    const blob = svgContent
      ? new Blob([svgContent], { type: "image/svg+xml" })
      : await fetch(designImageUrl!).then((r) => r.blob());
    const upload = await supabase.storage.from("designs").upload(filePath, blob);
    if (upload.error) {
      // Without the file the calculator and the cut page have nothing to work with
      setSaveError(`Ontwerp kon niet geüpload worden: ${upload.error.message}`);
      setSaving(false);
      return;
    }

    const widthMm = parseFloat(realWidthCm) * 10;
    const heightMm = parseFloat(realHeightCm) * 10;

    const row = {
      project_id: projectId,
      file_path: filePath,
      file_name: fileName,
      colors: measurement ? measurement.layers.map((l) => l.color) : colorGroups.map((g) => g.color),
      width_mm: widthMm || null,
      height_mm: (measurement ? measurement.heightMm : heightMm) || null,
    };
    const { error } = await supabase.from("designs").insert({
      ...row,
      quantity: qty,
      excluded_colors: excluded,
      color_layers: measurement?.layers ?? null,
    });
    if (error) {
      // Database without migration 002: save without the new columns
      console.warn("Opslaan met kleurlagen mislukt, opnieuw zonder:", error.message);
      const retry = await supabase.from("designs").insert(row);
      if (retry.error) {
        setSaveError(`Opslaan mislukt: ${retry.error.message}`);
        setSaving(false);
        return;
      }
    }

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
          PDF of SVG geeft exacte maten per kleurlaag. PNG/JPEG werkt ook voor schattingen.
        </p>
      </header>

      <div className="mb-6">
        <FileUpload
          accept=".pdf,application/pdf,.svg,image/svg+xml,image/png,image/jpeg"
          label="Upload ontwerp (PDF, SVG, PNG of JPEG)"
          onFileLoaded={handleDesignLoaded}
          readAsText={false}
        />
        {converting && <p className="text-sm text-[var(--color-stebo-mute)] mt-3">PDF wordt gelezen…</p>}
        {loadError && <p className="text-sm text-red-600 mt-3">{loadError}</p>}
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
            {svgContent && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
                  Aantal stuks
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="input-stebo"
                />
                <p className="text-xs text-[var(--color-stebo-mute)] mt-1.5">
                  Hetzelfde ontwerp meerdere keren maken? Folie en kosten worden voor alle stuks samen berekend.
                </p>
              </div>
            )}
          </div>
          {layers.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-2">
                Gevonden kleuren · vink uit wat geen folie is (bijv. achtergrond)
              </p>
              <div className="flex flex-wrap gap-2">
                {layers.map((l) => (
                  <label
                    key={l.color}
                    className="flex items-center gap-2 border border-[var(--color-stebo-line)] rounded-md px-2.5 py-1.5 text-sm cursor-pointer hover:bg-[var(--color-stebo-paper)]"
                  >
                    <input type="checkbox" checked={!excluded.includes(l.color)} onChange={() => toggleLayer(l.color)} />
                    <span className="w-4 h-4 rounded border border-[var(--color-stebo-line)]" style={{ backgroundColor: l.color }} />
                    <span className="font-mono text-xs">{l.color}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
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

      {(colorGroups.length > 0 || measurement) && (
        <>
          {advice && advice.warnings.length > 0 && (
            <ul className="mb-3 text-sm text-[var(--color-stebo-ink)] bg-[var(--color-stebo-yellow-50)] border-l-4 border-[var(--color-stebo-yellow)] rounded-r px-4 py-3 space-y-1 list-disc list-inside">
              {advice.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {measurement ? (
            <LayerTable
              measurement={measurement}
              matches={advice?.matches}
              onDownloadPdf={() => downloadLayerPdf(fileName || "ontwerp", activeLayers, measurement, advice?.names)}
              onDownloadCut={(layer, format) =>
                downloadLayerCutFile(fileName || "ontwerp", activeLayers, measurement, layer, rollWidth, format)
              }
            />
          ) : (
            <ColorList colorGroups={colorGroups} totalCost={totalCost} />
          )}

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
              <div className="text-right">
                <button
                  onClick={saveDesign}
                  disabled={saving}
                  className="btn-yellow"
                >
                  {saving ? "Opslaan..." : "Opslaan & verder →"}
                </button>
                {saveError && <p className="text-sm text-[var(--color-stebo-yellow)] mt-2 max-w-md">{saveError}</p>}
              </div>
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
