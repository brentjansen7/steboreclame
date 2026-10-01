"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { nestColorGroup } from "@/lib/nestingEngine";
import { measureDesign } from "@/lib/colorLayers";
import { extractLayers, includedLayers } from "@/lib/designLayers";
import { planFromLayer, planFromNesting, type CutMode, type CutPlan } from "@/lib/cutPlan";
import {
  exportAsSvg,
  exportAsHpgl,
  exportAsDxf,
  downloadFile,
} from "@/lib/cutFileExporter";
import CutStep from "@/components/CutStep";
import type { Project, Design, CutStep as CutStepType } from "@/types";

interface ColorPlans {
  design: Design;
  color: string;
  laag: CutPlan; // whole layer with registration marks, × quantity
  zuinig: CutPlan; // loose shapes, least vinyl
}

export default function CutFlowPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [plans, setPlans] = useState<ColorPlans[]>([]);
  const [mode, setMode] = useState<CutMode>("laag");
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
      await generatePlans(designs, proj?.roll_width || 630, steps || []);
    }

    setLoading(false);
  }

  // Build both cut plans per colour: the whole layer with registration marks
  // (how Stephan layers vinyl) and the thrifty version with loose shapes.
  async function generatePlans(
    designs: Design[],
    rollWidth: number,
    existingSteps: CutStepType[]
  ) {
    const built: ColorPlans[] = [];

    for (const design of designs) {
      if (!/\.svg$/i.test(design.file_path)) continue;
      const { data } = await supabase.storage.from("designs").download(design.file_path);
      if (!data) continue;

      const svgText = await data.text();
      const layers = includedLayers(extractLayers(svgText), design.excluded_colors || []);
      if (layers.length === 0 || !design.width_mm) continue;

      const measurement = measureDesign({
        layers,
        realWidthMm: Number(design.width_mm),
        quantity: design.quantity || 1,
        rollWidthMm: rollWidth,
        pricePerMeter: null,
      });

      for (const m of measurement.layers) {
        const layer = layers.find((l) => l.color === m.color)!;
        built.push({
          design,
          color: m.color,
          laag: planFromLayer(layer, m, measurement.scaleMmPerUnit, rollWidth),
          zuinig: planFromNesting(
            nestColorGroup(layer.elements, m.color, rollWidth, measurement.scaleMmPerUnit)
          ),
        });
      }
    }

    // One cut step per colour, in the order they are cut
    const newSteps: CutStepType[] = [];
    let orderNum = 1;
    for (const { color, laag } of built) {
      const existing = existingSteps.find((s) => s.color === color);
      if (existing) {
        newSteps.push(existing);
      } else {
        const { data: step } = await supabase
          .from("cut_steps")
          .insert({
            project_id: projectId,
            color,
            order_num: orderNum,
            length_mm: laag.totalLengthMm,
            status: "pending",
          })
          .select()
          .single();
        if (step) newSteps.push(step);
      }
      orderNum++;
    }

    setPlans(built);
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
    const plan = plans[stepIndex]?.[mode];
    if (!plan) return;

    const base = `snij-${plan.color.replace("#", "")}-${mode}${plan.pieces > 1 ? `-x${plan.pieces}` : ""}`;

    switch (format) {
      case "svg": {
        downloadFile(exportAsSvg(plan), `${base}.svg`, "image/svg+xml");
        break;
      }
      case "hpgl": {
        downloadFile(exportAsHpgl(plan), `${base}.plt`, "text/plain");
        break;
      }
      case "dxf": {
        downloadFile(await exportAsDxf(plan), `${base}.dxf`, "application/dxf");
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

      {/* How to cut */}
      {plans.length > 0 && (
        <div className="card p-5 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] mb-3">
            Hoe wil je snijden?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              {
                value: "laag" as const,
                title: "Hele laag met paskruisjes",
                text: "Alle vormen blijven op hun plek, inclusief paskruisjes en het aantal stuks. Je plakt de laag in één keer over met overzetfolie.",
              },
              {
                value: "zuinig" as const,
                title: "Zuinig: losse vormen",
                text: "Elke vorm apart op de rol. Kost veel minder folie, maar je plakt elk stuk zelf op de goede plek.",
              },
            ]).map((option) => (
              <label
                key={option.value}
                className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  mode === option.value
                    ? "border-[var(--color-stebo-blue-700)] bg-[var(--color-stebo-blue-50)]"
                    : "border-[var(--color-stebo-line)] hover:bg-[var(--color-stebo-paper)]"
                }`}
              >
                <input
                  type="radio"
                  name="cutmode"
                  className="mt-1"
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span>
                  <span className="block font-semibold text-sm text-[var(--color-stebo-ink)]">{option.title}</span>
                  <span className="block text-xs text-[var(--color-stebo-mute)] mt-1">{option.text}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Cut steps */}
      {plans.length === 0 ? (
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
          {plans.map((p, i) => (
            <CutStep
              key={`${p.design.id}-${p.color}`}
              plan={p[mode]}
              stepNumber={i + 1}
              totalSteps={plans.length}
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
