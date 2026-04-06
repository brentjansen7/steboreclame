import type { Placement } from "./nestingEngine";

const HPGL_UNITS_PER_MM = 40; // Standard HPGL: 40 units = 1mm

// Generate HPGL/PLT file content for a set of nested placements
export function generateHpgl(placements: Placement[]): string {
  const lines: string[] = [];

  lines.push("IN;"); // Initialize
  lines.push("SP1;"); // Select pen 1

  for (const placement of placements) {
    const pathData = placement.element.pathData;
    const points = pathToPoints(pathData);

    if (points.length < 2) continue;

    // Scale and offset to placement position
    const scaledPoints = points.map((p) => ({
      x: Math.round((placement.x + p.x) * HPGL_UNITS_PER_MM),
      y: Math.round((placement.y + p.y) * HPGL_UNITS_PER_MM),
    }));

    // Pen up, move to first point
    lines.push(`PU${scaledPoints[0].x},${scaledPoints[0].y};`);

    // Pen down, draw to remaining points
    const drawPoints = scaledPoints
      .slice(1)
      .map((p) => `${p.x},${p.y}`)
      .join(",");
    lines.push(`PD${drawPoints};`);

    // Pen up
    lines.push("PU;");
  }

  lines.push("SP0;"); // Put pen away
  lines.push("IN;"); // Reinitialize

  return lines.join("\n");
}

// Simple path-to-points converter (linearizes curves)
function pathToPoints(
  d: string
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  let cx = 0,
    cy = 0;

  // Match all SVG path commands
  const commands = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g);
  if (!commands) return points;

  for (const cmd of commands) {
    const type = cmd[0];
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    switch (type) {
      case "M":
        cx = nums[0];
        cy = nums[1];
        points.push({ x: cx, y: cy });
        // Implicit lineto for remaining pairs
        for (let i = 2; i < nums.length; i += 2) {
          cx = nums[i];
          cy = nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "m":
        cx += nums[0];
        cy += nums[1];
        points.push({ x: cx, y: cy });
        for (let i = 2; i < nums.length; i += 2) {
          cx += nums[i];
          cy += nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "L":
        for (let i = 0; i < nums.length; i += 2) {
          cx = nums[i];
          cy = nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "l":
        for (let i = 0; i < nums.length; i += 2) {
          cx += nums[i];
          cy += nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case "H":
        cx = nums[0];
        points.push({ x: cx, y: cy });
        break;
      case "h":
        cx += nums[0];
        points.push({ x: cx, y: cy });
        break;
      case "V":
        cy = nums[0];
        points.push({ x: cx, y: cy });
        break;
      case "v":
        cy += nums[0];
        points.push({ x: cx, y: cy });
        break;
      case "C":
        // Cubic bezier: linearize with endpoint only (for MVP)
        for (let i = 0; i < nums.length; i += 6) {
          // Add midpoint approximation
          const mx = (cx + nums[i + 4]) / 2;
          const my = (cy + nums[i + 5]) / 2;
          points.push({ x: mx, y: my });
          cx = nums[i + 4];
          cy = nums[i + 5];
          points.push({ x: cx, y: cy });
        }
        break;
      case "c":
        for (let i = 0; i < nums.length; i += 6) {
          const mx = cx + nums[i + 4] / 2;
          const my = cy + nums[i + 5] / 2;
          points.push({ x: mx, y: my });
          cx += nums[i + 4];
          cy += nums[i + 5];
          points.push({ x: cx, y: cy });
        }
        break;
      case "Q":
        for (let i = 0; i < nums.length; i += 4) {
          cx = nums[i + 2];
          cy = nums[i + 3];
          points.push({ x: cx, y: cy });
        }
        break;
      case "q":
        for (let i = 0; i < nums.length; i += 4) {
          cx += nums[i + 2];
          cy += nums[i + 3];
          points.push({ x: cx, y: cy });
        }
        break;
      case "A":
      case "a":
        // Arc: just use endpoint for MVP
        if (type === "A") {
          cx = nums[5];
          cy = nums[6];
        } else {
          cx += nums[5];
          cy += nums[6];
        }
        points.push({ x: cx, y: cy });
        break;
      case "Z":
      case "z":
        if (points.length > 0) {
          points.push({ x: points[0].x, y: points[0].y });
        }
        break;
    }
  }

  return points;
}
