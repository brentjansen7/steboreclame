import type { NestedResult } from "./nestingEngine";
import { generateHpgl } from "./hpglGenerator";

// Export nested result as SVG cutting file
export function exportAsSvg(result: NestedResult): string {
  const { rollWidthMm, totalLengthMm, placements, color } = result;

  const paths = placements
    .map((p) => {
      const transform = p.rotated
        ? `translate(${p.x},${p.y}) rotate(90)`
        : `translate(${p.x},${p.y})`;
      return `  <path d="${p.element.pathData}" fill="none" stroke="${color}" stroke-width="0.1" transform="${transform}" />`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rollWidthMm} ${totalLengthMm}" width="${rollWidthMm}mm" height="${totalLengthMm}mm">
  <!-- Roll: ${rollWidthMm}mm breed x ${totalLengthMm}mm lang -->
  <!-- Kleur: ${color} -->
${paths}
</svg>`;
}

// Export nested result as HPGL/PLT cutting file
export function exportAsHpgl(result: NestedResult): string {
  return generateHpgl(result.placements);
}

// Export nested result as DXF (using makerjs)
export async function exportAsDxf(result: NestedResult): Promise<string> {
  // Dynamic import to avoid SSR issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makerjs: any = await import("makerjs");

  const models: Record<string, unknown> = {};

  result.placements.forEach((p, i) => {
    const pathData = p.element.pathData;
    try {
      const model = makerjs.importer.fromSVGPathData(pathData);
      if (model) {
        makerjs.model.moveRelative(model, [p.x, p.y]);
        if (p.rotated) {
          makerjs.model.rotate(model, 90, [p.x, p.y]);
        }
        models[`shape_${i}`] = model;
      }
    } catch {
      // Skip shapes that can't be imported
    }
  });

  const combined = { models };
  return makerjs.exporter.toDXF(combined);
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
