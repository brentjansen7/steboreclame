"use client";

import type { ColorGroup } from "@/types";

interface ColorListProps {
  colorGroups: ColorGroup[];
  totalCost: number | null;
}

export default function ColorList({ colorGroups, totalCost }: ColorListProps) {
  if (colorGroups.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-lg">Folie-berekening per kleur</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-gray-500 border-b">
            <th className="px-6 py-3">Kleur</th>
            <th className="px-6 py-3">Elementen</th>
            <th className="px-6 py-3">Oppervlakte</th>
            <th className="px-6 py-3">Benodigde lengte</th>
            <th className="px-6 py-3">Meters folie</th>
            {totalCost !== null && <th className="px-6 py-3">Kosten</th>}
          </tr>
        </thead>
        <tbody>
          {colorGroups.map((group) => (
            <tr key={group.color} className="border-b last:border-0">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded border border-gray-300"
                    style={{ backgroundColor: group.color }}
                  />
                  <span className="font-mono text-sm">{group.color}</span>
                </div>
              </td>
              <td className="px-6 py-4">{group.elements.length}</td>
              <td className="px-6 py-4">
                {(group.totalArea / 100).toFixed(1)} cm²
              </td>
              <td className="px-6 py-4">
                {(group.requiredLength / 10).toFixed(1)} cm
              </td>
              <td className="px-6 py-4 font-semibold">
                {group.meters.toFixed(2)} m
              </td>
              {totalCost !== null && (
                <td className="px-6 py-4">
                  {group.cost !== null ? `€${group.cost.toFixed(2)}` : "-"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {totalCost !== null && (
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={5} className="px-6 py-3 text-right">
                Totaal materiaalkosten:
              </td>
              <td className="px-6 py-3">€{totalCost.toFixed(2)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
