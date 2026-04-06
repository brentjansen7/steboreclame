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

  return (
    <div
      className={`rounded-xl border-2 p-6 transition-colors ${
        status === "done"
          ? "border-green-300 bg-green-50"
          : "border-blue-300 bg-white"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg border-2 border-gray-300"
            style={{ backgroundColor: result.color }}
          />
          <div>
            <h3 className="font-bold text-lg">
              Kleur {stepNumber} van {totalSteps}:{" "}
              <span className="font-mono">{result.color}</span>
            </h3>
            <p className="text-sm text-gray-600">
              Rolbreedte: {result.rollWidthMm / 10}cm — Benodigde lengte:{" "}
              {(result.totalLengthMm / 10).toFixed(1)}cm
            </p>
          </div>
        </div>
        {status === "done" && (
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            Gesneden
          </span>
        )}
      </div>

      {/* Instructions */}
      {status === "pending" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="font-medium text-blue-800">
            Leg{" "}
            <span className="font-bold">{result.color.toUpperCase()}</span>{" "}
            folie in de machine
          </p>
          <p className="text-sm text-blue-600 mt-1">
            {result.rollWidthMm / 10}cm breed, minimaal{" "}
            {(result.totalLengthMm / 10).toFixed(1)}cm nodig
          </p>
        </div>
      )}

      {/* Nesting preview */}
      <div className="mb-4">
        <NestPreview result={result} />
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleExport("svg")}
          disabled={exporting}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Download SVG
        </button>
        <button
          onClick={() => handleExport("hpgl")}
          disabled={exporting}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Download HPGL/PLT
        </button>
        <button
          onClick={() => handleExport("dxf")}
          disabled={exporting}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Download DXF
        </button>
      </div>

      {/* Cut button */}
      {status === "pending" && (
        <button
          onClick={onCut}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-xl transition-colors shadow-lg hover:shadow-xl"
        >
          SNIJ DEZE KLEUR
        </button>
      )}

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex justify-between text-sm text-gray-500 mb-1">
          <span>Voortgang</span>
          <span>
            {stepNumber} van {totalSteps}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-500"
            style={{
              width: `${(stepNumber / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
