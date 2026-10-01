import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import type { SvgElement } from "@/types";
import { flattenPath, polylineLength, signedArea, type Polyline } from "./pathGeometry";

// Registration marks (paskruisjes): a square in every corner around each layer
export const MARK_SIZE_MM = 10;
export const MARK_GAP_MM = 5;
const ROLL_BORDER_MM = 3;
const PIECE_SPACING_MM = 5;
// Colours closer than this (CIE76 ΔE) are treated as the same vinyl
export const DEFAULT_COLOR_TOLERANCE = 6;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorLayer {
  color: string; // representative hex (largest area)
  sourceColors: string[]; // all hex colours merged into this layer
  elements: SvgElement[];
}

export interface LayerMeasurement {
  color: string;
  sourceColors: string[];
  elementCount: number;
  // All sizes in mm, for ONE piece
  widthMm: number;
  heightMm: number;
  xMm: number; // offset from the top-left of the whole design
  yMm: number;
  areaMm2: number; // real vinyl area (holes subtracted)
  pieceWidthMm: number; // layer incl. registration marks
  pieceHeightMm: number;
  // Totals for `quantity` pieces
  quantity: number;
  totalAreaMm2: number;
  rollLengthMm: number; // all pieces packed on the roll
  fitsOnRoll: boolean;
  meters: number;
  cost: number | null;
}

export interface DesignMeasurement {
  scaleMmPerUnit: number;
  designBox: Box; // in SVG units
  widthMm: number;
  heightMm: number;
  layers: LayerMeasurement[];
}

// ---------- colour clustering ----------

function hexToLab(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255);
  const g = lin((n >> 8) & 255);
  const b = lin(n & 255);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function deltaE(a: string, b: string): number {
  const la = hexToLab(a);
  const lb = hexToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

// Group elements by colour, merging near-identical colours into one layer
export function groupIntoLayers(
  elements: SvgElement[],
  tolerance = DEFAULT_COLOR_TOLERANCE
): ColorLayer[] {
  const byHex = new Map<string, SvgElement[]>();
  for (const el of elements) {
    if (!/^#[0-9A-F]{6}$/i.test(el.fill)) continue;
    const hex = el.fill.toUpperCase();
    if (!byHex.has(hex)) byHex.set(hex, []);
    byHex.get(hex)!.push(el);
  }

  // Biggest colours first so they become the representative colour
  const weight = (els: SvgElement[]) => els.reduce((s, e) => s + e.bbox.width * e.bbox.height, 0);
  const sorted = [...byHex.entries()].sort((a, b) => weight(b[1]) - weight(a[1]));

  const layers: ColorLayer[] = [];
  for (const [hex, els] of sorted) {
    const match = layers.find((l) => deltaE(l.color, hex) <= tolerance);
    if (match) {
      match.sourceColors.push(hex);
      match.elements.push(...els);
    } else {
      layers.push({ color: hex, sourceColors: [hex], elements: [...els] });
    }
  }
  return layers;
}

// ---------- geometry ----------

export function unionBox(elements: SvgElement[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.bbox.x);
    minY = Math.min(minY, el.bbox.y);
    maxX = Math.max(maxX, el.bbox.x + el.bbox.width);
    maxY = Math.max(maxY, el.bbox.y + el.bbox.height);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const toRing = (poly: Polyline): [number, number][] => poly.map((p) => [p.x, p.y]);

function multiPolygonArea(mp: MultiPolygon): number {
  let area = 0;
  for (const polygon of mp) {
    polygon.forEach((ring, i) => {
      const a = Math.abs(signedArea(ring.map(([x, y]) => ({ x, y }))));
      area += i === 0 ? a : -a;
    });
  }
  return area;
}

// Real vinyl area of a layer in SVG units². Filled shapes are merged, so
// overlapping pieces and letter counters (holes) are not counted twice.
export function layerArea(elements: SvgElement[]): number {
  let strokeArea = 0;
  const shapes: MultiPolygon[] = [];
  let fallback = 0;

  for (const el of elements) {
    const subpaths = flattenPath(el.pathData);
    if (el.kind === "stroke") {
      strokeArea += subpaths.reduce((s, p) => s + polylineLength(p), 0) * (el.strokeWidth || 0);
      continue;
    }
    const closed = subpaths.filter((p) => p.length >= 3);
    if (closed.length === 0) continue;
    fallback += Math.abs(closed.reduce((s, p) => s + signedArea(p), 0));
    try {
      const rings: Polygon[] = closed.map((p) => [toRing(p)]);
      shapes.push(rings.length === 1 ? [rings[0]] : polygonClipping.xor(rings[0], ...rings.slice(1)));
    } catch {
      shapes.push([]);
    }
  }

  if (shapes.length === 0) return strokeArea;
  try {
    const merged = polygonClipping.union(shapes[0], ...shapes.slice(1));
    return multiPolygonArea(merged) + strokeArea;
  } catch {
    return fallback + strokeArea;
  }
}

export interface RollLayout {
  rotated: boolean; // true = piece width runs across the roll
  across: number; // piece size across the roll (mm)
  along: number; // piece size along the roll (mm)
  perRow: number;
  rows: number;
  lengthMm: number;
  fits: boolean;
  border: number;
  spacing: number;
}

// Grid of identical pieces on the roll, in the orientation that uses the least roll
export function rollLayout(
  pieceWidthMm: number,
  pieceHeightMm: number,
  quantity: number,
  rollWidthMm: number
): RollLayout {
  const usable = rollWidthMm - 2 * ROLL_BORDER_MM;
  let best: RollLayout | null = null;

  for (const rotated of [true, false]) {
    const across = rotated ? pieceWidthMm : pieceHeightMm;
    const along = rotated ? pieceHeightMm : pieceWidthMm;
    if (across > usable) continue;
    const perRow = Math.max(1, Math.floor((usable + PIECE_SPACING_MM) / (across + PIECE_SPACING_MM)));
    const rows = Math.ceil(quantity / perRow);
    const lengthMm = Math.ceil(rows * along + (rows - 1) * PIECE_SPACING_MM + 2 * ROLL_BORDER_MM);
    if (!best || lengthMm < best.lengthMm) {
      best = { rotated, across, along, perRow, rows, lengthMm, fits: true, border: ROLL_BORDER_MM, spacing: PIECE_SPACING_MM };
    }
  }

  // Too wide for the roll even when rotated: has to be cut in parts
  return (
    best ?? {
      rotated: pieceWidthMm < pieceHeightMm,
      across: Math.min(pieceWidthMm, pieceHeightMm),
      along: Math.max(pieceWidthMm, pieceHeightMm),
      perRow: 1,
      rows: quantity,
      lengthMm: Math.ceil(quantity * (Math.max(pieceWidthMm, pieceHeightMm) + PIECE_SPACING_MM)),
      fits: false,
      border: ROLL_BORDER_MM,
      spacing: PIECE_SPACING_MM,
    }
  );
}

// Length of roll needed to cut `quantity` pieces of this size
export function rollLengthForPieces(
  pieceWidthMm: number,
  pieceHeightMm: number,
  quantity: number,
  rollWidthMm: number
): { lengthMm: number; fits: boolean } {
  const { lengthMm, fits } = rollLayout(pieceWidthMm, pieceHeightMm, quantity, rollWidthMm);
  return { lengthMm, fits };
}

// ---------- main entry ----------

export function measureDesign(options: {
  layers: ColorLayer[];
  realWidthMm: number;
  quantity: number;
  rollWidthMm: number;
  pricePerMeter: number | null;
  priceForColor?: (hex: string) => number | null;
}): DesignMeasurement {
  const { layers, realWidthMm, rollWidthMm, pricePerMeter, priceForColor } = options;
  const quantity = Math.max(1, Math.floor(options.quantity || 1));

  const designBox = unionBox(layers.flatMap((l) => l.elements));
  const scale = designBox.width > 0 ? realWidthMm / designBox.width : 0;
  const markMargin = 2 * (MARK_GAP_MM + MARK_SIZE_MM);

  const measured: LayerMeasurement[] = layers.map((layer) => {
    const box = unionBox(layer.elements);
    const widthMm = box.width * scale;
    const heightMm = box.height * scale;
    const areaMm2 = layerArea(layer.elements) * scale * scale;
    const pieceWidthMm = widthMm + markMargin;
    const pieceHeightMm = heightMm + markMargin;
    const roll = rollLengthForPieces(pieceWidthMm, pieceHeightMm, quantity, rollWidthMm);
    const meters = Math.round(roll.lengthMm / 10) / 100;
    const price = priceForColor?.(layer.color) ?? pricePerMeter;

    return {
      color: layer.color,
      sourceColors: layer.sourceColors,
      elementCount: layer.elements.length,
      widthMm,
      heightMm,
      xMm: (box.x - designBox.x) * scale,
      yMm: (box.y - designBox.y) * scale,
      areaMm2,
      pieceWidthMm,
      pieceHeightMm,
      quantity,
      totalAreaMm2: areaMm2 * quantity,
      rollLengthMm: roll.lengthMm,
      fitsOnRoll: roll.fits,
      meters,
      cost: price != null ? Math.round(meters * price * 100) / 100 : null,
    };
  });

  return {
    scaleMmPerUnit: scale,
    designBox,
    widthMm: designBox.width * scale,
    heightMm: designBox.height * scale,
    layers: measured.sort((a, b) => b.areaMm2 - a.areaMm2),
  };
}
