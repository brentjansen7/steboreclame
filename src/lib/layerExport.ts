import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import SvgPath from "svgpath";
import type { ColorLayer, DesignMeasurement, LayerMeasurement } from "./colorLayers";
import { MARK_GAP_MM, MARK_SIZE_MM, unionBox } from "./colorLayers";
import { exportAsHpgl, exportAsSvg } from "./cutFileExporter";
import { markRects, planFromLayer } from "./cutPlan";

const PT_PER_MM = 72 / 25.4; // PDF points per millimetre at true size

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// One A4 landscape page per colour layer, like the example sheets:
// only that layer, corner marks, and the measurements.
export async function generateLayerPdf(options: {
  title: string;
  layers: ColorLayer[];
  measurement: DesignMeasurement;
  colorNames?: Record<string, string>;
}): Promise<Uint8Array> {
  const { title, layers, measurement, colorNames } = options;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const PAGE_W = 841.89;
  const PAGE_H = 595.28;
  const MARGIN = 36;
  const TEXT_H = 90;
  const ink = rgb(0.14, 0.12, 0.13);

  for (const m of measurement.layers) {
    const layer = layers.find((l) => l.color === m.color);
    if (!layer) continue;
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const box = unionBox(layer.elements);
    const o = MARK_GAP_MM + MARK_SIZE_MM;

    // True size (1:1) when the piece fits on the page, so a printout can be
    // measured. Bigger pieces are scaled down, and the sheet says so.
    const areaW = PAGE_W - 2 * MARGIN;
    const areaH = PAGE_H - 2 * MARGIN - TEXT_H;
    const ptPerMm = Math.min(PT_PER_MM, areaW / m.pieceWidthMm, areaH / m.pieceHeightMm);
    const trueSize = ptPerMm >= PT_PER_MM - 1e-9;
    const left = MARGIN + (areaW - m.pieceWidthMm * ptPerMm) / 2;
    const top = PAGE_H - MARGIN - (areaH - m.pieceHeightMm * ptPerMm) / 2;
    const unitToPt = measurement.scaleMmPerUnit * ptPerMm;
    const color = hexToRgb(m.color);

    for (const el of layer.elements) {
      const d = SvgPath(el.pathData).translate(-box.x, -box.y).scale(unitToPt).toString();
      const at = { x: left + o * ptPerMm, y: top - o * ptPerMm };
      if (el.kind === "stroke") {
        page.drawSvgPath(d, { ...at, borderColor: color, borderWidth: (el.strokeWidth || 0) * unitToPt });
      } else {
        page.drawSvgPath(d, { ...at, color });
      }
    }

    // Frame + registration marks
    page.drawRectangle({
      x: left,
      y: top - m.pieceHeightMm * ptPerMm,
      width: m.pieceWidthMm * ptPerMm,
      height: m.pieceHeightMm * ptPerMm,
      borderColor: ink,
      borderWidth: 0.6,
    });
    for (const r of markRects(m.widthMm, m.heightMm)) {
      page.drawRectangle({
        x: left + (r.x + o) * ptPerMm,
        y: top - (r.y + o + r.height) * ptPerMm,
        width: r.width * ptPerMm,
        height: r.height * ptPerMm,
        borderColor: ink,
        borderWidth: 0.6,
      });
    }

    // Measurements
    const cm = (mm: number) => (mm / 10).toFixed(1);
    const name = colorNames?.[m.color] ? `${colorNames[m.color]} (${m.color})` : m.color;
    const lines = [
      `B × H: ${cm(m.widthMm)} × ${cm(m.heightMm)} cm   ·   met paskruisjes: ${cm(m.pieceWidthMm)} × ${cm(m.pieceHeightMm)} cm`,
      `Positie vanaf linksboven logo: ${cm(m.xMm)} cm rechts, ${cm(m.yMm)} cm omlaag`,
      `Oppervlakte: ${(m.areaMm2 / 1e6).toFixed(3)} m² per stuk   ·   Aantal: × ${m.quantity}   ·   Rol: ${m.meters.toFixed(2)} m`,
      trueSize
        ? "Ware grootte (1:1) — print op 100% / werkelijke grootte"
        : `Verkleind (schaal 1:${(PT_PER_MM / ptPerMm).toFixed(1)}) — niet nameten op papier`,
    ];
    page.drawRectangle({ x: MARGIN, y: MARGIN + TEXT_H - 34, width: 22, height: 22, color });
    page.drawText(name, { x: MARGIN + 32, y: MARGIN + TEXT_H - 28, size: 14, font: bold, color: ink });
    page.drawText(title, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(title, 9), y: MARGIN + TEXT_H - 26, size: 9, font, color: ink });
    lines.forEach((text, i) => {
      page.drawText(text, { x: MARGIN, y: MARGIN + TEXT_H - 52 - i * 15, size: 10, font, color: ink });
    });
  }

  return pdf.save();
}

const safeName = (s: string) => s.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60) || "ontwerp";

export async function downloadLayerPdf(
  designName: string,
  layers: ColorLayer[],
  measurement: DesignMeasurement,
  colorNames?: Record<string, string>
) {
  const cm = (mm: number) => (mm / 10).toFixed(0);
  const title = `${designName} · ${cm(measurement.widthMm)} × ${cm(measurement.heightMm)} cm`;
  const bytes = await generateLayerPdf({ title, layers, measurement, colorNames });
  downloadBytes(bytes, `${safeName(designName)}-kleurlagen.pdf`, "application/pdf");
}

export function downloadLayerCutFile(
  designName: string,
  layers: ColorLayer[],
  measurement: DesignMeasurement,
  layerMeasurement: LayerMeasurement,
  rollWidthMm: number,
  format: "plt" | "svg"
) {
  const layer = layers.find((l) => l.color === layerMeasurement.color);
  if (!layer) return;
  const plan = planFromLayer(layer, layerMeasurement, measurement.scaleMmPerUnit, rollWidthMm);
  const base = `${safeName(designName)}-${layer.color.slice(1)}-x${layerMeasurement.quantity}`;
  const content = format === "plt" ? exportAsHpgl(plan) : exportAsSvg(plan);
  const type = format === "plt" ? "text/plain" : "image/svg+xml";
  downloadBytes(new TextEncoder().encode(content), `${base}.${format}`, type);
}

export function downloadBytes(bytes: Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
