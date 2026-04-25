import type { SvgElement, ColorGroup } from "@/types";
import { svgUnitsToMm } from "./svgAnalyzer";

// For raster designs: known total design size + per-color fraction.
// Computes vinyl length on roll per color using oppervlakte / rolBreedte.
export function calculateVinylFromFractions(
  colors: { hex: string; fraction: number }[],
  designWidthMm: number,
  designHeightMm: number,
  rollWidthMm: number,
  pricePerMeter: number | null
): ColorGroup[] {
  if (designWidthMm <= 0 || designHeightMm <= 0) return [];

  const totalDesignArea = designWidthMm * designHeightMm; // mm²

  const results: ColorGroup[] = colors.map((c) => {
    const colorArea = totalDesignArea * c.fraction; // mm²
    // Approximate roll length: area divided by usable roll width.
    // If color area exceeds rollWidth^2 we still divide by rollWidth (multi-strip).
    const rawLength = colorArea / rollWidthMm; // mm on roll
    const requiredLength = Math.ceil(rawLength * 1.1); // 10% waste margin
    const meters = requiredLength / 1000;
    const cost = pricePerMeter ? meters * pricePerMeter : null;

    return {
      color: c.hex,
      elements: [],
      totalArea: colorArea,
      requiredLength,
      meters: Math.round(meters * 100) / 100,
      cost: cost ? Math.round(cost * 100) / 100 : null,
    };
  });

  return results.sort((a, b) => b.meters - a.meters);
}

export function calculateVinyl(
  colorGroups: Map<string, SvgElement[]>,
  rollWidthMm: number,
  pricePerMeter: number | null,
  svgViewBox: { width: number; height: number },
  realWidthMm?: number
): ColorGroup[] {
  const results: ColorGroup[] = [];

  for (const [color, elements] of colorGroups) {
    // Convert each element's bbox to mm
    const elementsInMm = elements.map((el) => ({
      ...el,
      bboxMm: {
        x: svgUnitsToMm(el.bbox.x, svgViewBox.width, realWidthMm),
        y: svgUnitsToMm(el.bbox.y, svgViewBox.width, realWidthMm),
        width: svgUnitsToMm(el.bbox.width, svgViewBox.width, realWidthMm),
        height: svgUnitsToMm(el.bbox.height, svgViewBox.width, realWidthMm),
      },
    }));

    // Total area of all bounding boxes (mm²)
    const totalArea = elementsInMm.reduce(
      (sum, el) => sum + el.bboxMm.width * el.bboxMm.height,
      0
    );

    // Simple strip packing estimate:
    // Sort by height descending, pack in rows on the roll
    const sorted = [...elementsInMm].sort(
      (a, b) => b.bboxMm.height - a.bboxMm.height
    );

    let currentRowWidth = 0;
    let currentRowHeight = 0;
    let totalLength = 0;

    for (const el of sorted) {
      const w = el.bboxMm.width + 5; // 5mm spacing between elements
      const h = el.bboxMm.height + 5;

      if (currentRowWidth + w <= rollWidthMm) {
        // Fits in current row
        currentRowWidth += w;
        currentRowHeight = Math.max(currentRowHeight, h);
      } else {
        // Start new row
        totalLength += currentRowHeight;
        currentRowWidth = w;
        currentRowHeight = h;
      }
    }
    totalLength += currentRowHeight; // Don't forget last row

    // Add 10% waste margin
    const requiredLength = Math.ceil(totalLength * 1.1);
    const meters = requiredLength / 1000;
    const cost = pricePerMeter ? meters * pricePerMeter : null;

    results.push({
      color,
      elements,
      totalArea,
      requiredLength,
      meters: Math.round(meters * 100) / 100,
      cost: cost ? Math.round(cost * 100) / 100 : null,
    });
  }

  return results.sort((a, b) => b.meters - a.meters);
}

export function formatTotalCost(groups: ColorGroup[]): number | null {
  if (groups.some((g) => g.cost === null)) return null;
  return Math.round(groups.reduce((sum, g) => sum + (g.cost || 0), 0) * 100) / 100;
}
