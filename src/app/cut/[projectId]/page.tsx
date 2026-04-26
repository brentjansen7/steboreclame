"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { analyzeSvg, svgUnitsToMm } from "@/lib/svgAnalyzer";
import { nestColorGroup, type NestedResult } from "@/lib/nestingEngine";
import {
  exportAsSvg,
  exportAsHpgl,
  exportAsDxf,
  downloadFile,
} from "@/lib/cutFileExporter";
import CutStep from "@/components/CutStep";
import type { Project, Design, CutStep as CutStepType } from "@/types";

export default function CutFlowPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [nestedResults, setNestedResults] = useState<NestedResult[]>([]);
  const [cutSteps, setCutSteps] = useState<CutStepType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

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
    setProject(proj);

    // Load existing cut steps
    const { data: steps } = await supabase
      .from("cut_steps")
      .select("*")
      .eq("project_id", projectId)
      .order("order_num");
    setCutSteps(steps || []);

    // Find first pending step
    if (steps) {
      const firstPending = steps.findIndex((s) => s.status === "pending");
      setActiveStep(firstPending >= 0 ? firstPending : steps.length - 1);
    }

    // Load designs and generate nested layouts
    const { data: designs } = await supabase
      .from("designs")
      .select("*")
      .eq("project_id", projectId);

    if (designs && designs.length > 0) {
      await generateNesting(designs, proj?.roll_width || 630, steps || []);
    }

    setLoading(false);
  }

  async function generateNesting(
    designs: Design[],
    rollWidth: number,
    existingSteps: CutStepType[]
  ) {
    // Collect all elements from all designs
    const allColorGroups = new Map<
      string,
      { elements: import("@/types").SvgElement[]; scale: number }
    >();

    for (const design of designs) {
      const { data } = await supabase.storage
        .from("designs")
        .download(design.file_path);
      if (!data) continue;

      const svgText = await data.text();
      const { colorGroups, viewBox } = analyzeSvg(svgText);
      const scale = svgUnitsToMm(1, viewBox.width, design.width_mm || undefined);

      for (const [color, elements] of colorGroups) {
        if (!allColorGroups.has(color)) {
          allColorGroups.set(color, { elements: [], scale });
        }
        allColorGroups.get(color)!.elements.push(...elements);
      }
    }

    // Nest each color group
    const results: NestedResult[] = [];
    const newSteps: CutStepType[] = [];

    let orderNum = 1;
    for (const [color, { elements, scale }] of allColorGroups) {
      const nested = nestColorGroup(elements, color, rollWidth, scale);
      results.push(nested);

      // Check if step already exists
      const existing = existingSteps.find(
        (s) => s.color === color
      );
      if (existing) {
        newSteps.push(existing);
      } else {
        // Create new cut step in Supabase
        const { data: step } = await supabase
          .from("cut_steps")
          .insert({
            project_id: projectId,
            color,
            order_num: orderNum,
            length_mm: nested.totalLengthMm,
            status: "pending",
          })
          .select()
          .single();
        if (step) newSteps.push(step);
      }
      orderNum++;
    }

    setNestedResults(results);
    setCutSteps(newSteps);
  }

  async function markAsCut(stepIndex: number) {
    const step = cutSteps[stepIndex];
    if (!step) return;

    await supabase
      .from("cut_steps")
      .update({ status: "done", cut_at: new Date().toISOString() })
      .eq("id", step.id);

    const updated = [...cutSteps];
    updated[stepIndex] = { ...step, status: "done", cut_at: new Date().toISOString() };
    setCutSteps(updated);

    // Move to next step
    if (stepIndex < cutSteps.length - 1) {
      setActiveStep(stepIndex + 1);
    }
  }

  async function handleExport(
    stepIndex: number,
    format: "svg" | "hpgl" | "dxf"
  ) {
    const result = nestedResults[stepIndex];
    if (!result) return;

    const colorName = result.color.replace("#", "");

    switch (format) {
      case "svg": {
        const svg = exportAsSvg(result);
        downloadFile(svg, `snij-${colorName}.svg`, "image/svg+xml");
        break;
      }
      case "hpgl": {
        const hpgl = exportAsHpgl(result);
        downloadFile(hpgl, `snij-${colorName}.plt`, "text/plain");
        break;
      }
      case "dxf": {
        const dxf = await exportAsDxf(result);
        downloadFile(dxf, `snij-${colorName}.dxf`, "application/dxf");
        break;
      }
    }
  }

  if (loading) return <p className="text-[var(--color-stebo-mute)]">Laden...</p>;
  if (!project) return <p className="text-red-600">Project niet gevonden</p>;

  const doneCount = cutSteps.filter((s) => s.status === "done").length;
  const allDone = doneCount === cutSteps.length && cutSteps.length > 0;

  return (
    <div className="max-w-5xl">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-stebo-blue-700)] uppercase mb-2">
            <span className="inline-block w-6 h-px bg-[var(--color-stebo-yellow)] align-middle mr-2" />
            Stap 4 — Snij-workflow
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[var(--color-stebo-ink)]">
            {project.name}
          </h1>
          <p className="text-[var(--color-stebo-mute)] mt-1.5">
            {doneCount} van {cutSteps.length} kleuren gesneden
          </p>
        </div>
        <Link href={`/calculator/${projectId}`} className="btn-ghost">
          ← Terug naar calculator
        </Link>
      </header>

      {/* Overall progress */}
      <div className="card p-5 mb-6">
        <div className="flex justify-between items-baseline mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)]">
            Totale voortgang
          </span>
          <span className="text-sm font-mono font-semibold text-[var(--color-stebo-ink)]">
            {doneCount} / {cutSteps.length} kleuren
          </span>
        </div>
        <div className="w-full bg-[var(--color-stebo-line)] rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-700 ${
              allDone ? "bg-[var(--color-stebo-yellow)]" : "bg-[var(--color-stebo-blue-700)]"
            }`}
            style={{
              width: cutSteps.length
                ? `${(doneCount / cutSteps.length) * 100}%`
                : "0%",
            }}
          />
        </div>
        {allDone && (
          <div className="flex items-center justify-center gap-2 mt-3 text-[var(--color-stebo-blue-900)] font-semibold">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-stebo-yellow)]">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <span>Alle kleuren gesneden — klaar voor montage</span>
          </div>
        )}
      </div>

      {/* Cut steps */}
      {nestedResults.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--color-stebo-yellow-50)] mb-4">
            <svg className="w-7 h-7 text-[var(--color-stebo-blue-700)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-[var(--color-stebo-ink)]">Geen ontwerpen gevonden</p>
          <p className="text-sm text-[var(--color-stebo-mute)] mt-1">
            Upload eerst een ontwerp via de{" "}
            <Link
              href={`/upload?projectId=${projectId}`}
              className="text-[var(--color-stebo-blue-700)] hover:text-[var(--color-stebo-blue-800)] underline underline-offset-2 font-medium"
            >
              upload pagina
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {nestedResults.map((result, i) => (
            <CutStep
              key={result.color}
              result={result}
              stepNumber={i + 1}
              totalSteps={nestedResults.length}
              status={cutSteps[i]?.status === "done" ? "done" : "pending"}
              onCut={() => markAsCut(i)}
              onExport={(format) => handleExport(i, format)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
