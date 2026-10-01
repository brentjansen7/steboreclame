import type { Placement } from "./nestingEngine";
import { flattenPath, type Polyline } from "./pathGeometry";

const HPGL_UNITS_PER_MM = 40; // Standard HPGL: 40 units = 1mm

// Cut lines of all placements in roll space (mm): x across the roll, y along
// the roll, y pointing down (same orientation as the nest preview).
export function placementLines(placements: Placement[], svgToMmScale: number): Polyline[] {
  const lines: Polyline[] = [];
  for (const p of placements) {
    const { bbox } = p.element;
    const heightMm = bbox.height * svgToMmScale;
    for (const poly of flattenPath(p.element.pathData)) {
      lines.push(
        poly.map((pt) => {
          const lx = (pt.x - bbox.x) * svgToMmScale;
          const ly = (pt.y - bbox.y) * svgToMmScale;
          // Rotated by the packer: turn 90° (not mirrored)
          return p.rotated ? { x: p.x + heightMm - ly, y: p.y + lx } : { x: p.x + lx, y: p.y + ly };
        })
      );
    }
  }
  return lines;
}

// Generate HPGL/PLT file content for a set of nested placements
export function generateHpgl(placements: Placement[], svgToMmScale: number): string {
  const u = (v: number) => Math.round(v * HPGL_UNITS_PER_MM);
  const lines: string[] = ["IN;", "SP1;"];

  for (const line of placementLines(placements, svgToMmScale)) {
    if (line.length < 2) continue;
    // Plotter: X along the roll, Y across. Swapping axes also turns the
    // y-down screen space into y-up plotter space, so nothing is mirrored.
    lines.push(`PU${u(line[0].y)},${u(line[0].x)};`);
    lines.push(`PD${line.slice(1).map((p) => `${u(p.y)},${u(p.x)}`).join(",")};`);
  }

  lines.push("PU;", "SP0;", "IN;");
  return lines.join("\n");
}
