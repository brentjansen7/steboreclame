import type { CutPlan } from "./cutPlan";

const HPGL_UNITS_PER_MM = 40; // Standard HPGL: 40 units = 1mm
const round = (v: number) => Math.round(v * 100) / 100;

// Export a cut plan as an SVG cutting file (mm, 1:1)
export function exportAsSvg(plan: CutPlan): string {
  // Shapes that end where they start become closed paths (Z), so CorelDraw and
  // the like import them as closed curves instead of open lines
  const paths = plan.lines
    .filter((l) => l.length > 1)
    .map((l) => {
      const first = l[0];
      const last = l[l.length - 1];
      const closed = first.x === last.x && first.y === last.y && l.length > 2;
      const pts = (closed ? l.slice(0, -1) : l).map((p) => `${round(p.x)},${round(p.y)}`);
      return `    <path d="M${pts.join(" L")}${closed ? " Z" : ""}" />`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.rollWidthMm} ${plan.totalLengthMm}" width="${plan.rollWidthMm}mm" height="${plan.totalLengthMm}mm">
  <!-- Rol: ${plan.rollWidthMm}mm breed x ${plan.totalLengthMm}mm lang -->
  <!-- Kleur: ${plan.color} · ${plan.pieces}x · ${plan.mode === "laag" ? "hele laag met paskruisjes" : "losse vormen"} -->
  <g fill="none" stroke="${plan.color}" stroke-width="0.1">
${paths}
  </g>
</svg>`;
}

// Export a cut plan as HPGL/PLT. The plotter runs X along the roll and Y across
// it; swapping the axes also turns y-down into y-up, so nothing is mirrored.
export function exportAsHpgl(plan: CutPlan): string {
  const u = (v: number) => Math.round(v * HPGL_UNITS_PER_MM);
  const out = ["IN;", "SP1;"];
  for (const line of plan.lines) {
    if (line.length < 2) continue;
    out.push(`PU${u(line[0].y)},${u(line[0].x)};`);
    out.push(`PD${line.slice(1).map((p) => `${u(p.y)},${u(p.x)}`).join(",")};`);
  }
  out.push("PU;", "SP0;", "IN;");
  return out.join("\n");
}

// Export a cut plan as DXF (using makerjs), in mm with y pointing up
export async function exportAsDxf(plan: CutPlan): Promise<string> {
  // Dynamic import to avoid SSR issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makerjs: any = await import("makerjs");

  const models: Record<string, unknown> = {};
  plan.lines.forEach((line, i) => {
    if (line.length < 2) return;
    const first = line[0];
    const last = line[line.length - 1];
    const closed = first.x === last.x && first.y === last.y;
    const points = (closed ? line.slice(0, -1) : line).map((p) => [round(p.x), round(plan.totalLengthMm - p.y)]);
    models[`shape_${i}`] = new makerjs.models.ConnectTheDots(closed, points);
  });

  return makerjs.exporter.toDXF({ models }, { units: makerjs.unitType.Millimeter });
}

// Download a string as a file in the browser
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain"
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
