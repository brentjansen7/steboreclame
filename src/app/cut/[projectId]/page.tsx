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

  if (loading) return <p className="text-gray-500">Laden...</p>;
  if (!project) return <p className="text-red-500">Project niet gevonden</p>;

  const doneCount = cutSteps.filter((s) => s.status === "done").length;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-gray-500">
            Snij-workflow — {doneCount} van {cutSteps.length} kleuren gesneden
          </p>
        </div>
        <Link
          href={`/calculator/${projectId}`}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Terug naar calculator
        </Link>
      </div>

      {/* Overall progress */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Totale voortgang</span>
          <span>
            {doneCount} / {cutSteps.length} kleuren
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-green-500 h-4 rounded-full transition-all duration-700"
            style={{
              width: cutSteps.length
                ? `${(doneCount / cutSteps.length) * 100}%`
                : "0%",
            }}
          />
        </div>
        {doneCount === cutSteps.length && cutSteps.length > 0 && (
          <p className="text-green-600 font-semibold mt-2 text-center">
            Alle kleuren gesneden!
          </p>
        )}
      </div>

      {/* Cut steps */}
      {nestedResults.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">Geen ontwerpen gevonden</p>
          <p className="text-sm mt-1">
            Upload eerst een ontwerp via de{" "}
            <Link
              href={`/upload?projectId=${projectId}`}
              className="text-blue-600 hover:underline"
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
