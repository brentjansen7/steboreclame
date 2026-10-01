"use client";

import type { DesignMeasurement, LayerMeasurement } from "@/lib/colorLayers";
import { vinylLabel, type ColorMatch } from "@/lib/vinylColors";

interface LayerTableProps {
  measurement: DesignMeasurement;
  matches?: Record<string, ColorMatch>; // nearest vinyl from the colour chart
  onDownloadPdf?: () => void;
  onDownloadCut?: (layer: LayerMeasurement, format: "plt" | "svg") => void;
}

const cm = (mm: number) => (mm / 10).toFixed(1);
const m2 = (mm2: number) => (mm2 / 1e6).toFixed(3);
const euro = (v: number) => `€ ${v.toFixed(2)}`;

export default function LayerTable({ measurement, matches, onDownloadPdf, onDownloadCut }: LayerTableProps) {
  const { layers } = measurement;
  if (layers.length === 0) return null;

  const quantity = layers[0].quantity;
  const showCost = layers.every((l) => l.cost !== null);
  const totalCost = layers.reduce((s, l) => s + (l.cost || 0), 0);
  const totalMeters = layers.reduce((s, l) => s + l.meters, 0);

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 bg-[var(--color-stebo-paper)] border-b border-[var(--color-stebo-line)] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title text-lg">Maten per kleurlaag</h3>
          <p className="text-xs text-[var(--color-stebo-mute)] mt-0.5">
            Logo {cm(measurement.widthMm)} × {cm(measurement.heightMm)} cm
            {quantity > 1 && <> · <strong>{quantity} stuks</strong></>}
          </p>
        </div>
        {onDownloadPdf && (
          <button onClick={onDownloadPdf} className="btn-primary">
            PDF per kleurlaag
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] border-b border-[var(--color-stebo-line)]">
              <th className="px-4 py-3">Kleur</th>
              <th className="px-4 py-3 text-right">B × H (cm)</th>
              <th className="px-4 py-3 text-right" title="Vanaf linksboven van het hele logo">Positie (cm)</th>
              <th className="px-4 py-3 text-right">m² per stuk</th>
              {quantity > 1 && <th className="px-4 py-3 text-right">m² totaal</th>}
              <th className="px-4 py-3 text-right">Rol</th>
              {showCost && <th className="px-4 py-3 text-right">Kosten</th>}
              {onDownloadCut && <th className="px-4 py-3 text-right">Snijbestand</th>}
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => (
              <tr key={l.color} className="border-b border-[var(--color-stebo-line)] last:border-0 hover:bg-[var(--color-stebo-paper)] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-md border border-[var(--color-stebo-line)] shadow-inner flex-shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <div>
                      {matches?.[l.color] && (
                        <p className="text-sm font-medium text-[var(--color-stebo-ink)]">
                          {vinylLabel(matches[l.color])}{" "}
                          <span
                            className={`font-normal text-xs ${
                              matches[l.color].close ? "text-[var(--color-stebo-mute)]" : "text-red-600"
                            }`}
                            title="Hoe ver de foliekleur van het ontwerp afligt (ΔE). Onder de 10 is een goede match."
                          >
                            {matches[l.color].close ? `ΔE ${matches[l.color].difference}` : `ΔE ${matches[l.color].difference} — niet gelijk`}
                          </span>
                        </p>
                      )}
                      <p className="font-mono text-xs text-[var(--color-stebo-mute)]">
                        {l.color}
                        {l.sourceColors.length > 1 && ` (+${l.sourceColors.length - 1} samengevoegd)`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold text-[var(--color-stebo-ink)]">
                  {cm(l.widthMm)} × {cm(l.heightMm)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-[var(--color-stebo-mute)]">
                  {cm(l.xMm)}, {cm(l.yMm)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">{m2(l.areaMm2)}</td>
                {quantity > 1 && (
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">{m2(l.totalAreaMm2)}</td>
                )}
                <td className="px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold text-[var(--color-stebo-ink)]">
                  {l.meters.toFixed(2)} m
                  {!l.fitsOnRoll && (
                    <span className="block text-[10px] font-sans font-normal text-red-600">past niet op rol</span>
                  )}
                </td>
                {showCost && (
                  <td className="px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold text-[var(--color-stebo-blue-700)]">
                    {euro(l.cost!)}
                  </td>
                )}
                {onDownloadCut && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => onDownloadCut(l, "plt")} className="btn-ghost text-xs px-2 py-1">PLT</button>{" "}
                    <button onClick={() => onDownloadCut(l, "svg")} className="btn-ghost text-xs px-2 py-1">SVG</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--color-stebo-blue-700)] text-white">
              <td colSpan={quantity > 1 ? 5 : 4} className="px-4 py-3 text-right font-semibold uppercase tracking-wider text-xs">
                <span className="text-[var(--color-stebo-yellow)]">●</span> Totaal{quantity > 1 && ` (${quantity} stuks)`}
              </td>
              <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">{totalMeters.toFixed(2)} m</td>
              {showCost && <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">{euro(totalCost)}</td>}
              {onDownloadCut && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-6 py-3 text-xs text-[var(--color-stebo-mute)] border-t border-[var(--color-stebo-line)]">
        Rol = stukken inclusief paskruisjes en marge, naast elkaar op de rol. Positie = afstand vanaf linksboven van het logo.
      </p>
    </div>
  );
}
