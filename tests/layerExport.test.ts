import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { groupIntoLayers, measureDesign, MARK_GAP_MM, MARK_SIZE_MM } from "@/lib/colorLayers";
import { pieceCutLines, planFromLayer } from "@/lib/cutPlan";
import { exportAsHpgl, exportAsSvg } from "@/lib/cutFileExporter";
import { flattenPath } from "@/lib/pathGeometry";
import { generateLayerPdf } from "@/lib/layerExport";
import { pdfToSvg } from "@/lib/pdfToSvg";
import { analyzeSvg } from "@/lib/svgAnalyzer";
import type { Polyline } from "@/lib/pathGeometry";
import type { SvgElement } from "@/types";

// A 100 × 50 unit red rectangle; with a real width of 100 mm, 1 unit = 1 mm
const rect: SvgElement = {
  id: "r",
  tagName: "rect",
  fill: "#FF0000",
  pathData: "M0 0 H100 V50 H0 Z",
  bbox: { x: 0, y: 0, width: 100, height: 50 },
  kind: "fill",
};

function setup(quantity = 1, rollWidthMm = 630, element: SvgElement = rect, realWidthMm = 100) {
  const layers = groupIntoLayers([element]);
  const measurement = measureDesign({ layers, realWidthMm, quantity, rollWidthMm, pricePerMeter: null });
  return { layers, measurement };
}

const box = (line: Polyline) => ({
  minX: Math.min(...line.map((p) => p.x)),
  maxX: Math.max(...line.map((p) => p.x)),
  minY: Math.min(...line.map((p) => p.y)),
  maxY: Math.max(...line.map((p) => p.y)),
});

const shoelace = (line: Polyline) =>
  line.slice(0, -1).reduce((sum, p, i) => sum + (p.x * line[i + 1].y - line[i + 1].x * p.y), 0);

describe("cut files", () => {
  it("writes closed shapes in the SVG, at true size", () => {
    const { layers, measurement } = setup();
    const plan = planFromLayer(layers[0], measurement.layers[0], measurement.scaleMmPerUnit, 630);
    const svg = exportAsSvg(plan);
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    // 1 shape + 4 marks, all closed
    expect(paths).toHaveLength(5);
    for (const d of paths) expect(d.endsWith(" Z")).toBe(true);
    // The rectangle is 100 × 50 mm in the file (1 unit = 1 mm)
    const b = box(flattenPath(paths[0])[0]);
    expect(b.maxX - b.minX).toBeCloseTo(100, 6);
    expect(b.maxY - b.minY).toBeCloseTo(50, 6);
    expect(svg).toContain('width="630mm"');
  });

  it("adds 4 registration marks around every piece", () => {
    const { layers, measurement } = setup();
    const piece = pieceCutLines(layers[0], measurement.scaleMmPerUnit);
    expect(piece.lines).toHaveLength(1 + 4);
    expect(piece.widthMm).toBeCloseTo(100 + 2 * (MARK_GAP_MM + MARK_SIZE_MM));
  });

  it("writes a 100 × 50 mm rectangle as 4000 × 2000 HPGL units", () => {
    const { layers, measurement } = setup();
    const plan = planFromLayer(layers[0], measurement.layers[0], measurement.scaleMmPerUnit, 630);
    // Only the shape itself, without the marks around it
    const hpgl = exportAsHpgl({ ...plan, lines: [plan.lines[0]] });
    const coords = [...hpgl.matchAll(/(\d+),(\d+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
    const b = box(coords);
    expect([b.maxX - b.minX, b.maxY - b.minY].sort((p, q) => p - q)).toEqual([2000, 4000]);
  });

  it("puts every copy on the roll without overlap", () => {
    const { layers, measurement } = setup(4);
    const plan = planFromLayer(layers[0], measurement.layers[0], measurement.scaleMmPerUnit, 630);
    // 4 copies × (1 shape + 4 marks)
    expect(plan.lines).toHaveLength(20);

    const boxes = [0, 5, 10, 15].map((i) => box(plan.lines[i]));
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const overlap =
          boxes[a].minX < boxes[b].maxX && boxes[b].minX < boxes[a].maxX &&
          boxes[a].minY < boxes[b].maxY && boxes[b].minY < boxes[a].maxY;
        expect(overlap).toBe(false);
      }
    }
    for (const line of plan.lines) for (const p of line) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(630);
      expect(p.y).toBeLessThanOrEqual(plan.totalLengthMm);
    }
  });

  it("does not mirror the design, in either orientation", () => {
    // An L-shape: the foot points right. Mirroring would flip the winding.
    const lShape: SvgElement = { ...rect, pathData: "M0 0 H10 V40 H30 V50 H0 Z", bbox: { x: 0, y: 0, width: 30, height: 50 } };
    const turned = new Set<boolean>();
    // A wide roll lays the piece down; a narrow roll forces a quarter turn
    for (const roll of [630, 80]) {
      const { layers, measurement } = setup(1, roll, lShape, 30);
      const plan = planFromLayer(layers[0], measurement.layers[0], measurement.scaleMmPerUnit, roll);
      turned.add(box(plan.lines[0]).maxX - box(plan.lines[0]).minX < 40);
      // Roll space has y pointing down like the SVG, so the sign must stay the same
      expect(shoelace(plan.lines[0])).toBeGreaterThan(0);
    }
    // One roll width forced the piece to be turned a quarter turn
    expect(turned).toEqual(new Set([false, true]));
  });
});

describe("layer PDF", () => {
  it("draws a piece that fits on the page at true size", async () => {
    const { layers, measurement } = setup();
    const pdf = await generateLayerPdf({ title: "Test", layers, measurement });
    // Read the PDF back as vectors and measure the red rectangle on paper
    const red = analyzeSvg(pdfToSvg(new Uint8Array(pdf))).elements.find((e) => e.fill === "#FF0000" && e.bbox.width > 50);
    const ptToMm = 25.4 / 72;
    expect(red!.bbox.width * ptToMm).toBeCloseTo(100, 1);
    expect(red!.bbox.height * ptToMm).toBeCloseTo(50, 1);
  });

  it("scales down a piece that is too big for the page", async () => {
    const { layers, measurement } = setup(1, 1260, rect, 2000); // 2 m wide
    const pdf = await generateLayerPdf({ title: "Test", layers, measurement });
    const red = analyzeSvg(pdfToSvg(new Uint8Array(pdf))).elements.find((e) => e.fill === "#FF0000" && e.bbox.width > 50);
    expect(red!.bbox.width * (25.4 / 72)).toBeLessThan(297);
  });

  it("makes one page per colour layer", async () => {
    const blue: SvgElement = { ...rect, id: "b", fill: "#0000FF", pathData: "M0 60 H100 V80 H0 Z", bbox: { x: 0, y: 60, width: 100, height: 20 } };
    const layers = groupIntoLayers([rect, blue]);
    const measurement = measureDesign({ layers, realWidthMm: 1000, quantity: 2, rollWidthMm: 630, pricePerMeter: 5 });
    const bytes = await generateLayerPdf({ title: "Test", layers, measurement });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });
});
