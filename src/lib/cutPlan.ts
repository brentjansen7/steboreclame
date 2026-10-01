import type { Box, ColorLayer, LayerMeasurement } from "./colorLayers";
import { MARK_GAP_MM, MARK_SIZE_MM, rollLayout, unionBox } from "./colorLayers";
import { placementLines } from "./hpglGenerator";
import type { NestedResult } from "./nestingEngine";
import { flattenPath, type Polyline } from "./pathGeometry";

// Corner marks of one piece, in mm relative to the layer's top-left
export function markRects(widthMm: number, heightMm: number): Box[] {
  const o = MARK_GAP_MM + MARK_SIZE_MM;
  return [
    { x: -o, y: -o },
    { x: widthMm + MARK_GAP_MM, y: -o },
    { x: -o, y: heightMm + MARK_GAP_MM },
    { x: widthMm + MARK_GAP_MM, y: heightMm + MARK_GAP_MM },
  ].map((p) => ({ ...p, width: MARK_SIZE_MM, height: MARK_SIZE_MM }));
}

const rectPolyline = (r: Box): Polyline => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
  { x: r.x, y: r.y },
];

// All cut lines of one piece in mm, origin at the top-left of the piece (incl. marks)
export function pieceCutLines(layer: ColorLayer, scaleMmPerUnit: number): {
  lines: Polyline[];
  widthMm: number;
  heightMm: number;
} {
  const box = unionBox(layer.elements);
  const o = MARK_GAP_MM + MARK_SIZE_MM;
  const lines: Polyline[] = [];

  for (const el of layer.elements) {
    for (const poly of flattenPath(el.pathData)) {
      lines.push(
        poly.map((p) => ({ x: (p.x - box.x) * scaleMmPerUnit + o, y: (p.y - box.y) * scaleMmPerUnit + o }))
      );
    }
  }

  const widthMm = box.width * scaleMmPerUnit;
  const heightMm = box.height * scaleMmPerUnit;
  for (const r of markRects(widthMm, heightMm)) {
    lines.push(rectPolyline({ ...r, x: r.x + o, y: r.y + o }));
  }
  return { lines, widthMm: widthMm + 2 * o, heightMm: heightMm + 2 * o };
}

export type CutMode = "laag" | "zuinig";

// One colour, ready to cut. All lines are in roll space (mm):
// x across the roll (0..rollWidthMm), y along the roll, y pointing down.
export interface CutPlan {
  color: string;
  mode: CutMode;
  rollWidthMm: number;
  totalLengthMm: number;
  pieces: number; // number of copies in this file
  fitsOnRoll: boolean;
  lines: Polyline[];
}

// "Zuinig": every shape packed separately — least vinyl, but loose pieces
export function planFromNesting(result: NestedResult): CutPlan {
  return {
    color: result.color,
    mode: "zuinig",
    rollWidthMm: result.rollWidthMm,
    totalLengthMm: result.totalLengthMm,
    pieces: 1,
    fitsOnRoll: result.placements.every((p) => p.width <= result.rollWidthMm),
    lines: placementLines(result.placements, result.svgToMmScale),
  };
}

// "Laag": the whole layer in one piece with registration marks, × quantity
export function planFromLayer(
  layer: ColorLayer,
  measurement: LayerMeasurement,
  scaleMmPerUnit: number,
  rollWidthMm: number
): CutPlan {
  const piece = pieceCutLines(layer, scaleMmPerUnit);
  const layout = rollLayout(piece.widthMm, piece.heightMm, measurement.quantity, rollWidthMm);
  const lines: Polyline[] = [];

  for (let i = 0; i < measurement.quantity; i++) {
    const across = layout.border + (i % layout.perRow) * (layout.across + layout.spacing);
    const along = layout.border + Math.floor(i / layout.perRow) * (layout.along + layout.spacing);
    for (const line of piece.lines) {
      lines.push(
        line.map((p) =>
          layout.rotated
            ? // piece width runs across the roll: same orientation
              { x: across + p.x, y: along + p.y }
            : // piece turned a quarter turn (not mirrored)
              { x: across + p.y, y: along + piece.widthMm - p.x }
        )
      );
    }
  }

  return {
    color: layer.color,
    mode: "laag",
    rollWidthMm,
    totalLengthMm: layout.lengthMm,
    pieces: measurement.quantity,
    fitsOnRoll: layout.fits,
    lines,
  };
}
