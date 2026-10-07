import { describe, expect, it } from "vitest";
import { ORACAL_751, ORACAL_651, nearestVinylColor, vinylLabel } from "@/lib/vinylColors";
import { adviseLayers } from "@/lib/layerAdvice";
import { groupIntoLayers, measureDesign } from "@/lib/colorLayers";
import type { SvgElement } from "@/types";

const el = (fill: string, pathData: string, bbox: SvgElement["bbox"], extra: Partial<SvgElement> = {}): SvgElement => ({
  id: fill,
  tagName: "path",
  fill,
  pathData,
  bbox,
  kind: "fill",
  ...extra,
});

const bigSquare = (fill: string) => el(fill, "M0 0 H1000 V1000 H0 Z", { x: 0, y: 0, width: 1000, height: 1000 });

function advise(elements: SvgElement[], realWidthMm = 1000, rollWidthMm = 1260) {
  const layers = groupIntoLayers(elements, 0.1);
  const measurement = measureDesign({ layers, realWidthMm, quantity: 1, rollWidthMm, pricePerMeter: null });
  return { advice: adviseLayers(measurement, layers, rollWidthMm), measurement };
}

describe("vinyl colour charts", () => {
  it("have unique, valid entries", () => {
    for (const series of [ORACAL_751, ORACAL_651]) {
      expect(series.colors.length).toBeGreaterThan(50);
      for (const c of series.colors) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(new Set(series.colors.map((c) => c.code)).size).toBe(series.colors.length);
    }
  });

  it("defaults to Oracal 751 — Stephan's main material", () => {
    const match = nearestVinylColor("#0E0D0D");
    expect(match.series).toBe("Oracal 751");
  });

  it("matches a colour from the chart exactly", () => {
    const black = nearestVinylColor("#0E0D0D", ORACAL_751);
    expect(vinylLabel(black)).toBe("Oracal 751-070 Zwart");
    expect(black.difference).toBe(0);
    expect(black.close).toBe(true);
  });

  it("can match against a different series when asked", () => {
    const black = nearestVinylColor("#0D0E11", ORACAL_651);
    expect(vinylLabel(black)).toBe("Oracal 651-070 Zwart");
  });

  it("says so when nothing is close", () => {
    const match = nearestVinylColor("#FF00FF");
    expect(match.close).toBe(false);
    expect(match.difference).toBeGreaterThan(10);
  });
});

describe("advice", () => {
  it("warns about a colour that is not on the chart", () => {
    const { advice } = advise([bigSquare("#FF00FF")]);
    expect(advice.warnings.some((w) => w.includes("standaardkleur"))).toBe(true);
  });

  it("says how many strips a layer that is too wide needs", () => {
    // 3 m wide on a 1.26 m roll
    const { advice } = advise([bigSquare("#0E0D0D")], 3000, 1260);
    expect(advice.warnings.some((w) => /banen nodig/.test(w))).toBe(true);
  });

  it("warns about outlines that are cut down the middle", () => {
    const outline = el("#0E0D0D", "M0 0 H1000 V1000 H0 Z", { x: 0, y: 0, width: 1000, height: 1000 }, {
      kind: "stroke",
      strokeWidth: 20,
    });
    const { advice } = advise([outline]);
    expect(advice.warnings.some((w) => w.includes("contourlijnen"))).toBe(true);
  });

  it("keeps quiet about a normal design", () => {
    const { advice } = advise([bigSquare("#0E0D0D")]);
    expect(advice.warnings).toEqual([]);
    expect(advice.names["#0E0D0D"]).toBe("Oracal 751-070 Zwart");
  });
});
