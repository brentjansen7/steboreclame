"use client";

import type { NestedResult } from "@/lib/nestingEngine";

interface NestPreviewProps {
  result: NestedResult;
}

export default function NestPreview({ result }: NestPreviewProps) {
  const { rollWidthMm, totalLengthMm, placements, color } = result;

  // Scale to fit in the preview area
  const maxWidth = 600;
  const scale = maxWidth / rollWidthMm;
  const displayHeight = totalLengthMm * scale;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-6 h-6 rounded border border-gray-300"
          style={{ backgroundColor: color }}
        />
        <span className="font-mono text-sm">{color}</span>
        <span className="text-sm text-gray-500">
          {rollWidthMm / 10}cm breed × {(totalLengthMm / 10).toFixed(1)}cm lang
        </span>
      </div>
      <div
        className="relative bg-gray-100 border border-dashed border-gray-300 rounded"
        style={{ width: maxWidth, height: Math.max(displayHeight, 60) }}
      >
        {/* Roll outline */}
        <div className="absolute inset-0" />

        {/* Placed elements */}
        {placements.map((p, i) => (
          <div
            key={i}
            className="absolute border border-opacity-50"
            style={{
              left: p.x * scale,
              top: p.y * scale,
              width: (p.width - 5) * scale,
              height: (p.height - 5) * scale,
              backgroundColor: color,
              opacity: 0.7,
              borderColor: color,
            }}
            title={`${p.element.id}: ${p.width.toFixed(0)}×${p.height.toFixed(0)}mm`}
          />
        ))}

        {/* Dimension labels */}
        <div className="absolute -top-5 left-0 right-0 text-center text-xs text-gray-400">
          {rollWidthMm / 10} cm
        </div>
        <div
          className="absolute -left-10 top-0 bottom-0 flex items-center text-xs text-gray-400"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {(totalLengthMm / 10).toFixed(1)} cm
        </div>
      </div>
    </div>
  );
}
