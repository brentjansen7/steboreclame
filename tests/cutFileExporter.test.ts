import { describe, expect, it } from "vitest";
import { generateHpgl, placementLines } from "@/lib/hpglGenerator";
import type { Placement } from "@/lib/nestingEngine";
import type { SvgElement } from "@/types";

// 100 × 50 SVG units, drawn away from the origin to test origin handling
const element: SvgElement = {
  id: "r",
  tagName: "rect",
  fill: "#FF0000",
  pathData: "M200 300 H300 V350 H200 Z",
  bbox: { x: 200, y: 300, width: 100, height: 50 },
  kind: "fill",
};

const place = (rotated: boolean): Placement => ({
  element,
  x: 10,
  y: 20,
  width: rotated ? 105 : 205,
  height: rotated ? 205 : 105,
  rotated,
});

const bounds = (points: { x: number; y: number }[]) => ({
  minX: Math.min(...points.map((p) => p.x)),
  maxX: Math.max(...points.map((p) => p.x)),
  minY: Math.min(...points.map((p) => p.y)),
  maxY: Math.max(...points.map((p) => p.y)),
});

describe("nested cut files", () => {
  it("applies the scale and starts at the placement position", () => {
    // scale 2: 100 × 50 units become 200 × 100 mm
    const b = bounds(placementLines([place(false)], 2)[0]);
    expect(b).toEqual({ minX: 10, maxX: 210, minY: 20, maxY: 120 });
  });

  it("turns rotated placements a quarter turn inside their spot", () => {
    const b = bounds(placementLines([place(true)], 2)[0]);
    expect(b).toEqual({ minX: 10, maxX: 110, minY: 20, maxY: 220 });
  });

  it("writes 200 × 100 mm as 8000 × 4000 HPGL units", () => {
    const hpgl = generateHpgl([place(false)], 2);
    const coords = [...hpgl.matchAll(/(\d+),(\d+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    const b = bounds(coords);
    // Plotter X runs along the roll (the 100 mm side here)
    expect(b.maxX - b.minX).toBe(4000);
    expect(b.maxY - b.minY).toBe(8000);
  });
});
