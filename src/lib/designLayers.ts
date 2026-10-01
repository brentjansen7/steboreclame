import { analyzeSvg } from "./svgAnalyzer";
import { groupIntoLayers, unionBox, type ColorLayer } from "./colorLayers";

// Browser-side: split a vector design into colour layers
export function extractLayers(svg: string): ColorLayer[] {
  return groupIntoLayers(analyzeSvg(svg).elements);
}

// Colours that are usually not vinyl start unticked: white (background) and
// hairlines (kader- en hulplijnen uit een tekening)
const HAIRLINE_FRACTION = 0.003; // thinner than 0.3% of the design width

export function defaultExcluded(layers: ColorLayer[]): string[] {
  const designWidth = unionBox(layers.flatMap((l) => l.elements)).width;
  return layers
    .filter(
      (l) =>
        l.color === "#FFFFFF" ||
        l.elements.every((el) => el.kind === "stroke" && (el.strokeWidth || 0) < designWidth * HAIRLINE_FRACTION)
    )
    .map((l) => l.color);
}

export function includedLayers(layers: ColorLayer[], excluded: string[]): ColorLayer[] {
  return layers.filter((l) => !excluded.includes(l.color));
}

// Height / width of the design itself (not the page it sits on)
export function designAspect(layers: ColorLayer[]): number {
  const box = unionBox(layers.flatMap((l) => l.elements));
  return box.width > 0 ? box.height / box.width : 1;
}

// Upload a PDF to the server and get the vector drawing back as SVG
export async function convertPdf(file: File): Promise<string> {
  const res = await fetch("/api/pdf-to-svg", { method: "POST", body: file });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "PDF kon niet gelezen worden");
  }
  return res.text();
}
