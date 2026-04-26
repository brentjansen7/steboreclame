"use client";

import { useState } from "react";
import type { NestedResult } from "@/lib/nestingEngine";
import NestPreview from "./NestPreview";

interface CutStepProps {
  result: NestedResult;
  stepNumber: number;
  totalSteps: number;
  status: "pending" | "done";
  onCut: () => void;
  onExport: (format: "svg" | "hpgl" | "dxf") => void;
}

export default function CutStep({
  result,
  stepNumber,
  totalSteps,
  status,
  onCut,
  onExport,
}: CutStepProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: "svg" | "hpgl" | "dxf") => {
    setExporting(true);
    onExport(format);
    setTimeout(() => setExporting(false), 500);
  };

  const isDone = status === "done";

  return (
    <article
      className={`card p-6 transition-all ${
        isDone
          ? "border-[var(--color-stebo-yellow-200)] bg-[var(--color-stebo-yellow-50)]"
          : "border-[var(--color-stebo-line)] hover:border-[var(--color-stebo-blue-300)]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4">
          <div
            className="relative w-14 h-14 rounded-lg border-2 border-white shadow-md flex-shrink-0"
            style={{ backgroundColor: result.color }}
          >
            <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--color-stebo-blue-700)] text-white text-[11px] font-bold flex items-center justify-center font-mono shadow">
              {stepNumber}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)]">
              Kleur {stepNumber} van {totalSteps}
            </p>
            <h3 className="font-bold text-lg text-[var(--color-stebo-ink)] font-mono mt-0.5">
              {result.color}
            </h3>
            <p className="text-sm text-[var(--color-stebo-mute)] mt-1">
              Rolbreedte <span className="font-mono font-semibold text-[var(--color-stebo-ink)]">{result.rollWidthMm / 10} cm</span>
              <span className="mx-2">·</span>
              Lengte <span className="font-mono font-semibold text-[var(--color-stebo-ink)]">{(result.totalLengthMm / 10).toFixed(1)} cm</span>
            </p>
          </div>
        </div>
        {isDone && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-stebo-yellow)] text-[var(--color-stebo-blue-900)] rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Gesneden
          </span>
        )}
      </div>

      {/* Instructions */}
      {!isDone && (
        <div className="bg-[var(--color-stebo-paper)] border-l-4 border-[var(--color-stebo-yellow)] rounded-r-lg p-4 mb-4">
          <p className="font-semibold text-[var(--color-stebo-ink)] text-sm">
            Leg <span className="font-mono font-bold">{result.color.toUpperCase()}</span> folie in de machine
          </p>
          <p className="text-xs text-[var(--color-stebo-mute)] mt-1">
            {result.rollWidthMm / 10} cm breed · minimaal {(result.totalLengthMm / 10).toFixed(1)} cm nodig
          </p>
        </div>
      )}

      {/* Nesting preview */}
      <div className="mb-4">
        <NestPreview result={result} />
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-stebo-mute)] flex items-center mr-2">
          Export
        </p>
        {(["svg", "hpgl", "dxf"] as const).map((fmt) => (
          <button
            key={fmt}
            onClick={() => handleExport(fmt)}
            disabled={exporting}
            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-[var(--color-stebo-line)] hover:border-[var(--color-stebo-blue-700)] hover:bg-white text-[var(--color-stebo-ink)] rounded-md transition-colors"
          >
            {fmt === "hpgl" ? "HPGL/PLT" : fmt}
          </button>
        ))}
      </div>

      {/* Cut button */}
      {!isDone && (
        <button
          onClick={onCut}
          className="w-full py-4 bg-[var(--color-stebo-blue-700)] hover:bg-[var(--color-stebo-blue-800)] text-white font-bold text-base uppercase tracking-wider rounded-lg transition-colors shadow-sm hover:shadow-md flex items-center justify-center gap-3"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-stebo-yellow)]" />
          Snij deze kleur
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-stebo-yellow)]" />
        </button>
      )}

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex justify-between text-xs text-[var(--color-stebo-mute)] mb-2">
          <span className="font-semibold uppercase tracking-wider">Voortgang</span>
          <span className="font-mono">
            {stepNumber} / {totalSteps}
          </span>
        </div>
        <div className="w-full bg-[var(--color-stebo-line)] rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-[var(--color-stebo-blue-700)] h-1.5 rounded-full transition-all duration-500"
            style={{
              width: `${(stepNumber / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>
    </article>
  );
}
