"use client";

import type { CutPlan } from "@/lib/cutPlan";

interface NestPreviewProps {
  plan: CutPlan;
}

// Top-down view of the roll: width across, length downwards
export default function NestPreview({ plan }: NestPreviewProps) {
  const { rollWidthMm, totalLengthMm, color, lines } = plan;

  return (
    <div className="bg-white rounded-xl border border-[var(--color-stebo-line)] p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="w-6 h-6 rounded border border-[var(--color-stebo-line)]" style={{ backgroundColor: color }} />
        <span className="font-mono text-sm">{color}</span>
        <span className="text-sm text-[var(--color-stebo-mute)]">
          {rollWidthMm / 10} cm breed × {(totalLengthMm / 10).toFixed(1)} cm lang
          {plan.pieces > 1 && ` · ${plan.pieces} stuks`}
        </span>
      </div>
      <div className="bg-[var(--color-stebo-paper)] border border-dashed border-[var(--color-stebo-line)] rounded p-2">
        <svg
          viewBox={`0 0 ${rollWidthMm} ${totalLengthMm}`}
          width="100%"
          style={{ maxHeight: 320 }}
          preserveAspectRatio="xMidYMid meet"
        >
          <g fill={color} fillOpacity="0.25" stroke={color} strokeWidth={Math.max(rollWidthMm / 600, 0.5)}>
            {lines.map((line, i) => (
              <polyline key={i} points={line.map((p) => `${p.x},${p.y}`).join(" ")} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
