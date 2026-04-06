import { MaxRectsPacker, Rectangle } from "maxrects-packer";
import type { SvgElement } from "@/types";

export interface NestedResult {
  color: string;
  rollWidthMm: number;
  totalLengthMm: number;
  placements: Placement[];
}

export interface Placement {
  element: SvgElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

// Nest all elements of one color onto a vinyl roll using MaxRects bin packing
export function nestColorGroup(
  elements: SvgElement[],
  color: string,
  rollWidthMm: number,
  svgToMmScale: number
): NestedResult {
  // Use a very tall bin (strip packing: fixed width, minimize height)
  const packer = new MaxRectsPacker(rollWidthMm, 100000, 5, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: true,
    border: 3, // 3mm between edge and elements
  });

  // Convert elements to rectangles with mm dimensions
  const rects: (Rectangle & { elementRef: SvgElement })[] = elements.map(
    (el) => {
      const w = Math.ceil(el.bbox.width * svgToMmScale) + 5; // 5mm spacing
      const h = Math.ceil(el.bbox.height * svgToMmScale) + 5;
      const rect = new Rectangle(w, h);
      (rect as Rectangle & { elementRef: SvgElement }).elementRef = el;
      return rect as Rectangle & { elementRef: SvgElement };
    }
  );

  packer.addArray(rects);

  // Extract placements from packer bins
  const placements: Placement[] = [];
  let totalLengthMm = 0;

  for (const bin of packer.bins) {
    for (const rect of bin.rects) {
      const r = rect as Rectangle & { elementRef: SvgElement };
      placements.push({
        element: r.elementRef,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotated: rect.rot || false,
      });
      totalLengthMm = Math.max(totalLengthMm, rect.y + rect.height);
    }
  }

  return {
    color,
    rollWidthMm,
    totalLengthMm: Math.ceil(totalLengthMm),
    placements,
  };
}

// Generate an SVG preview of the nested layout
export function generateNestPreviewSvg(result: NestedResult): string {
  const { rollWidthMm, totalLengthMm, placements, color } = result;
  const padding = 10;
  const viewWidth = rollWidthMm + padding * 2;
  const viewHeight = totalLengthMm + padding * 2;

  const rects = placements
    .map(
      (p) =>
        `  <rect x="${p.x + padding}" y="${p.y + padding}" width="${p.width - 5}" height="${p.height - 5}" fill="${color}" fill-opacity="0.7" stroke="${color}" stroke-width="0.5" />`
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" width="100%" height="100%">
  <rect x="${padding}" y="${padding}" width="${rollWidthMm}" height="${totalLengthMm}" fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="4,2" />
  <text x="${viewWidth / 2}" y="${padding - 2}" text-anchor="middle" font-size="8" fill="#999">${rollWidthMm}mm breed</text>
  <text x="${padding - 2}" y="${viewHeight / 2}" text-anchor="middle" font-size="8" fill="#999" transform="rotate(-90 ${padding - 2} ${viewHeight / 2})">${totalLengthMm}mm lang</text>
${rects}
</svg>`;
}
