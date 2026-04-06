"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { analyzeSvg } from "@/lib/svgAnalyzer";
import { calculateVinyl, formatTotalCost } from "@/lib/vinylCalculator";
import ColorList from "@/components/ColorList";
import type { Project, Design, ColorGroup } from "@/types";

export default function CalculatorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [rollWidth, setRollWidth] = useState(630);
  const [pricePerMeter, setPricePerMeter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    // Load project
    const { data: proj } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (proj) {
      setProject(proj);
      setRollWidth(proj.roll_width || 630);
      if (proj.price_per_m) setPricePerMeter(String(proj.price_per_m));
    }

    // Load designs
    const { data: des } = await supabase
      .from("designs")
      .select("*")
      .eq("project_id", projectId);
    setDesigns(des || []);

    // Load and analyze each design's SVG
    if (des && des.length > 0) {
      await analyzeDesigns(des, proj?.roll_width || 630, proj?.price_per_m);
    }

    setLoading(false);
  }

  async function analyzeDesigns(
    designList: Design[],
    width: number,
    price: number | null
  ) {
    const allGroups = new Map<string, ColorGroup>();

    for (const design of designList) {
      // Download SVG from storage
      const { data } = await supabase.storage
        .from("designs")
        .download(design.file_path);
      if (!data) continue;

      const svgText = await data.text();
      const { colorGroups: groups, viewBox } = analyzeSvg(svgText);
      const results = calculateVinyl(groups, width, price, viewBox);

      for (const group of results) {
        if (allGroups.has(group.color)) {
          const existing = allGroups.get(group.color)!;
          existing.elements.push(...group.elements);
          existing.totalArea += group.totalArea;
          existing.requiredLength += group.requiredLength;
          existing.meters += group.meters;
          if (existing.cost !== null && group.cost !== null) {
            existing.cost += group.cost;
          }
        } else {
          allGroups.set(group.color, { ...group });
        }
      }
    }

    setColorGroups(
      Array.from(allGroups.values()).sort((a, b) => b.meters - a.meters)
    );
  }

  async function updateSettings() {
    if (!project) return;
    const price = pricePerMeter ? parseFloat(pricePerMeter) : null;

    await supabase
      .from("projects")
      .update({ roll_width: rollWidth, price_per_m: price })
      .eq("id", projectId);

    // Recalculate
    await analyzeDesigns(designs, rollWidth, price);
  }

  if (loading) return <p className="text-gray-500">Laden...</p>;
  if (!project) return <p className="text-red-500">Project niet gevonden</p>;

  const totalCost = formatTotalCost(colorGroups);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-gray-500">Folie-calculator</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/preview/${projectId}`}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Pand-preview
          </Link>
          <Link
            href={`/cut/${projectId}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start snij-workflow
          </Link>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold mb-4">Instellingen</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Folierol breedte
            </label>
            <select
              value={rollWidth}
              onChange={(e) => setRollWidth(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value={630}>63 cm</option>
              <option value={1260}>126 cm</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prijs per meter (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={pricePerMeter}
              onChange={(e) => setPricePerMeter(e.target.value)}
              placeholder="4.50"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={updateSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Herbereken
            </button>
          </div>
        </div>
      </div>

      {/* Designs list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Ontwerpen ({designs.length})</h3>
          <Link
            href={`/upload?projectId=${projectId}`}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Upload ontwerp
          </Link>
        </div>
        {designs.length === 0 ? (
          <p className="text-gray-500 text-sm">
            Nog geen ontwerpen. Upload een SVG bestand.
          </p>
        ) : (
          <div className="space-y-2">
            {designs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <p className="font-medium">{d.file_name}</p>
                    <p className="text-xs text-gray-500">
                      {d.colors?.length || 0} kleuren
                      {d.width_mm &&
                        d.height_mm &&
                        ` — ${(d.width_mm / 10).toFixed(0)}×${(d.height_mm / 10).toFixed(0)}cm`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <ColorList colorGroups={colorGroups} totalCost={totalCost} />
    </div>
  );
}
