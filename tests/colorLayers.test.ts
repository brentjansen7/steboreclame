import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pdfToSvg } from "@/lib/pdfToSvg";
import { analyzeSvg } from "@/lib/svgAnalyzer";
import { groupIntoLayers, layerArea, measureDesign, rollLengthForPieces } from "@/lib/colorLayers";
import { defaultExcluded } from "@/lib/designLayers";
import type { SvgElement } from "@/types";

// The example PDFs contain the full logo at the top and loose layer sheets
// below it. Stephan will upload only the logo, so the tests keep the top part.
const LOGO_BOTTOM = 290;

function loadLogo(name: string) {
  const pdf = fs.readFileSync(path.join(__dirname, "fixtures", `${name}.pdf`));
  const svg = pdfToSvg(new Uint8Array(pdf));
  const { elements } = analyzeSvg(svg);
  return elements.filter((el) => el.bbox.y + el.bbox.height < LOGO_BOTTOM);
}

function measure(name: string, quantity = 1) {
  return measureDesign({
    layers: groupIntoLayers(loadLogo(name)),
    realWidthMm: 3000,
    quantity,
    rollWidthMm: 1260,
    pricePerMeter: 10,
  });
}

const square = (x: number, y: number, size: number, clockwise: boolean) =>
  clockwise
    ? `M${x} ${y}H${x + size}V${y + size}H${x}Z`
    : `M${x} ${y}V${y + size}H${x + size}V${y}Z`;

const el = (pathData: string, extra: Partial<SvgElement> = {}): SvgElement => ({
  id: "t",
  tagName: "path",
  fill: "#000000",
  pathData,
  bbox: { x: 0, y: 0, width: 100, height: 100 },
  kind: "fill",
  ...extra,
});

describe("EVS Infrabouw", () => {
  it("splits into blue, green and grey", () => {
    const result = measure("evs");
    expect(result.layers.map((l) => l.color).sort()).toEqual(["#1375BC", "#58595B", "#8CC63F"]);
  });

  it("scales the whole logo to the requested width", () => {
    const result = measure("evs");
    expect(result.widthMm).toBeCloseTo(3000, 0);
    // The blue bar runs across the full width
    const blue = result.layers.find((l) => l.color === "#1375BC")!;
    expect(blue.widthMm).toBeCloseTo(3000, 0);
    expect(blue.xMm).toBeCloseTo(0, 0);
  });

  it("prints the measurements", () => {
    console.table(
      measure("evs").layers.map((l) => ({
        kleur: l.color,
        "B×H cm": `${(l.widthMm / 10).toFixed(1)} × ${(l.heightMm / 10).toFixed(1)}`,
        "positie cm": `${(l.xMm / 10).toFixed(1)}, ${(l.yMm / 10).toFixed(1)}`,
        m2: (l.areaMm2 / 1e6).toFixed(3),
        rol_m: l.meters,
      }))
    );
  });
});

describe("ARMA Infra", () => {
  it("merges the two near-identical yellows into one layer", () => {
    const layers = groupIntoLayers(loadLogo("arma"));
    const yellow = layers.find((l) => l.sourceColors.includes("#F9E046"))!;
    expect(yellow.sourceColors.sort()).toEqual(["#F5E04F", "#F9E046"]);
  });

  it("prints the measurements", () => {
    console.table(
      measure("arma").layers.map((l) => ({
        kleur: l.color,
        bron: l.sourceColors.join(" "),
        "B×H cm": `${(l.widthMm / 10).toFixed(1)} × ${(l.heightMm / 10).toFixed(1)}`,
        "positie cm": `${(l.xMm / 10).toFixed(1)}, ${(l.yMm / 10).toFixed(1)}`,
        m2: (l.areaMm2 / 1e6).toFixed(3),
        rol_m: l.meters,
      }))
    );
  });
});

describe("which colours count as vinyl", () => {
  it("unticks the thin frame lines of the example sheet", () => {
    // The whole example page, including the loose layer sheets with their frames
    const pdf = fs.readFileSync(path.join(__dirname, "fixtures", "evs.pdf"));
    const layers = groupIntoLayers(analyzeSvg(pdfToSvg(new Uint8Array(pdf))).elements);
    expect(defaultExcluded(layers)).toEqual(["#231F20"]);
  });

  it("keeps a thick coloured outline", () => {
    const outline = el("M0 0 H1000 V500 H0 Z", { fill: "#FF0000", kind: "stroke", strokeWidth: 20 });
    expect(defaultExcluded(groupIntoLayers([outline]))).toEqual([]);
  });
});

describe("area", () => {
  it("subtracts holes instead of using the bounding box", () => {
    const d = `${square(0, 0, 100, true)} ${square(25, 25, 50, false)}`;
    expect(layerArea([el(d)])).toBeCloseTo(7500, 3);
  });

  it("does not count overlapping shapes twice", () => {
    const a = el(square(0, 0, 100, true));
    const b = el(square(50, 0, 100, true));
    expect(layerArea([a, b])).toBeCloseTo(15000, 3);
  });

  it("counts a stroke as length × width", () => {
    expect(layerArea([el("M0 0 H100", { kind: "stroke", strokeWidth: 2 })])).toBeCloseTo(200, 3);
  });

  it("measures a circle within 0.5%", () => {
    const r = 50;
    const d = `M${-r} 0 A${r} ${r} 0 1 0 ${r} 0 A${r} ${r} 0 1 0 ${-r} 0Z`;
    expect(Math.abs(layerArea([el(d)]) - Math.PI * r * r) / (Math.PI * r * r)).toBeLessThan(0.005);
  });
});

describe("quantity", () => {
  it("multiplies area exactly and packs pieces side by side on the roll", () => {
    const one = measure("evs", 1);
    const three = measure("evs", 3);
    one.layers.forEach((l, i) => {
      expect(three.layers[i].totalAreaMm2).toBeCloseTo(l.areaMm2 * 3, 3);
      expect(three.layers[i].rollLengthMm).toBeLessThanOrEqual(l.rollLengthMm * 3);
    });
  });

  it("puts small pieces next to each other", () => {
    // 3 pieces of 300 mm wide fit in one row on a 1260 mm roll
    expect(rollLengthForPieces(300, 200, 3, 1260).lengthMm).toBeLessThan(300);
  });

  it("flags pieces that are too big for the roll", () => {
    expect(rollLengthForPieces(3000, 1500, 1, 1260).fits).toBe(false);
  });
});
