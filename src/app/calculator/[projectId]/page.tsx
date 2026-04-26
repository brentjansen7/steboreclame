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

  if (loading) return <p className="text-[var(--color-stebo-mute)]">Laden...</p>;
  if (!project) return <p className="text-red-600">Project niet gevonden</p>;

  const totalCost = formatTotalCost(colorGroups);

  return (
    <div className="max-w-5xl">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-stebo-blue-700)] uppercase mb-2">
            <span className="inline-block w-6 h-px bg-[var(--color-stebo-yellow)] align-middle mr-2" />
            Stap 2 — Calculator
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-stebo-ink)]">
            {project.name}
          </h1>
          <p className="text-[var(--color-stebo-mute)] mt-1.5">Folie per kleur, totaalkosten en rolverbruik</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/preview/${projectId}`} className="btn-ghost">
            Pand-preview
          </Link>
          <Link href={`/cut/${projectId}`} className="btn-primary">
            Snij-workflow →
          </Link>
        </div>
      </header>

      {/* Settings */}
      <div className="card p-6 mb-6">
        <h3 className="section-title text-lg mb-6">Instellingen</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
              Folierol breedte
            </label>
            <select
              value={rollWidth}
              onChange={(e) => setRollWidth(parseInt(e.target.value))}
              className="input-stebo appearance-none"
            >
              <option value={630}>63 cm</option>
              <option value={1260}>126 cm</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-1.5">
              Prijs per meter (€)
            </label>
            <input
              type="number"
              step="0.01"
              value={pricePerMeter}
              onChange={(e) => setPricePerMeter(e.target.value)}
              placeholder="4.50"
              className="input-stebo"
            />
          </div>
          <div>
            <button onClick={updateSettings} className="btn-primary w-full">
              Herbereken
            </button>
          </div>
        </div>
      </div>

      {/* Designs list */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title text-lg">
            Ontwerpen <span className="text-[var(--color-stebo-mute)] font-normal">· {designs.length}</span>
          </h3>
          <Link
            href={`/upload?projectId=${projectId}`}
            className="text-sm font-medium text-[var(--color-stebo-blue-700)] hover:text-[var(--color-stebo-blue-800)] underline underline-offset-2"
          >
            + Upload ontwerp
          </Link>
        </div>
        {designs.length === 0 ? (
          <p className="text-[var(--color-stebo-mute)] text-sm italic">
            Nog geen ontwerpen. Upload eerst een SVG bestand.
          </p>
        ) : (
          <div className="space-y-2">
            {designs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3 border border-[var(--color-stebo-line)] rounded-lg hover:border-[var(--color-stebo-blue-300)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-[var(--color-stebo-yellow-50)] text-[var(--color-stebo-blue-700)]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-medium text-[var(--color-stebo-ink)]">{d.file_name}</p>
                    <p className="text-xs text-[var(--color-stebo-mute)]">
                      {d.colors?.length || 0} kleuren
                      {d.width_mm &&
                        d.height_mm &&
                        ` · ${(d.width_mm / 10).toFixed(0)}×${(d.height_mm / 10).toFixed(0)} cm`}
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
