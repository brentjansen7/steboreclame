"use client";

import type { ColorGroup } from "@/types";

interface ColorListProps {
  colorGroups: ColorGroup[];
  totalCost: number | null;
}

export default function ColorList({ colorGroups, totalCost }: ColorListProps) {
  if (colorGroups.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 bg-[var(--color-stebo-paper)] border-b border-[var(--color-stebo-line)] flex items-center justify-between">
        <h3 className="section-title text-lg">Folie-berekening per kleur</h3>
        <span className="text-xs font-mono text-[var(--color-stebo-mute)]">
          {colorGroups.length} {colorGroups.length === 1 ? "kleur" : "kleuren"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] border-b border-[var(--color-stebo-line)]">
              <th className="px-6 py-3">Kleur</th>
              <th className="px-6 py-3 text-right">Elementen</th>
              <th className="px-6 py-3 text-right">Oppervlakte</th>
              <th className="px-6 py-3 text-right">Lengte</th>
              <th className="px-6 py-3 text-right">Folie</th>
              {totalCost !== null && <th className="px-6 py-3 text-right">Kosten</th>}
            </tr>
          </thead>
          <tbody>
            {colorGroups.map((group) => (
              <tr
                key={group.color}
                className="border-b border-[var(--color-stebo-line)] last:border-0 hover:bg-[var(--color-stebo-paper)] transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-md border border-[var(--color-stebo-line)] shadow-inner flex-shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="font-mono text-sm text-[var(--color-stebo-ink)]">
                      {group.color}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-mono text-sm tabular-nums">
                  {group.elements.length}
                </td>
                <td className="px-6 py-4 text-right font-mono text-sm tabular-nums text-[var(--color-stebo-mute)]">
                  {(group.totalArea / 100).toFixed(1)} cm²
                </td>
                <td className="px-6 py-4 text-right font-mono text-sm tabular-nums text-[var(--color-stebo-mute)]">
                  {(group.requiredLength / 10).toFixed(1)} cm
                </td>
                <td className="px-6 py-4 text-right font-mono font-semibold tabular-nums text-[var(--color-stebo-ink)]">
                  {group.meters.toFixed(2)} m
                </td>
                {totalCost !== null && (
                  <td className="px-6 py-4 text-right font-mono font-semibold tabular-nums text-[var(--color-stebo-blue-700)]">
                    {group.cost !== null ? `€ ${group.cost.toFixed(2)}` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totalCost !== null && (
            <tfoot>
              <tr className="bg-[var(--color-stebo-blue-700)] text-white">
                <td colSpan={5} className="px-6 py-4 text-right font-semibold uppercase tracking-wider text-xs">
                  <span className="text-[var(--color-stebo-yellow)]">●</span> Totaal materiaalkosten
                </td>
                <td className="px-6 py-4 text-right font-mono text-lg font-bold tabular-nums">
                  € {totalCost.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
