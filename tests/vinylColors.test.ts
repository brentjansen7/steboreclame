import { describe, expect, it } from "vitest";
import { ORACAL_651, nearestVinylColor, vinylLabel } from "@/lib/vinylColors";
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

describe("vinyl colour chart", () => {
  it("has unique, valid entries", () => {
    expect(ORACAL_651.length).toBeGreaterThan(50);
    for (const c of ORACAL_651) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(ORACAL_651.map((c) => c.code)).size).toBe(ORACAL_651.length);
  });

  it("matches a colour from the chart exactly", () => {
    const black = nearestVinylColor("#0D0E11");
    expect(vinylLabel(black)).toBe("Oracal 651-070 Zwart");
    expect(black.difference).toBe(0);
    expect(black.close).toBe(true);
  });

  it("finds the nearest colour and says how far off it is", () => {
    // EVS blue is almost exactly sky blue; EVS green has no good match
    const blue = nearestVinylColor("#1375BC");
    expect(vinylLabel(blue)).toBe("Oracal 651-084 Hemelsblauw");
    expect(blue.close).toBe(true);

    const green = nearestVinylColor("#8CC63F");
    expect(green.code).toBe("063");
    expect(green.close).toBe(false);
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

  it("warns when two layers end up on the same vinyl", () => {
    // The two greens of ARMA both land on forest green
    const { advice } = advise([
      bigSquare("#005442"),
      el("#30694E", "M0 1100 H1000 V2000 H0 Z", { x: 0, y: 1100, width: 1000, height: 900 }),
    ]);
    expect(advice.warnings.some((w) => w.includes("allebei uit op"))).toBe(true);
  });

  it("says how many strips a layer that is too wide needs", () => {
    // 3 m wide on a 1.26 m roll
    const { advice } = advise([bigSquare("#0D0E11")], 3000, 1260);
    expect(advice.warnings.some((w) => /banen nodig/.test(w))).toBe(true);
  });

  it("warns about outlines that are cut down the middle", () => {
    const outline = el("#0D0E11", "M0 0 H1000 V1000 H0 Z", { x: 0, y: 0, width: 1000, height: 1000 }, {
      kind: "stroke",
      strokeWidth: 20,
    });
    const { advice } = advise([outline]);
    expect(advice.warnings.some((w) => w.includes("contourlijnen"))).toBe(true);
  });

  it("keeps quiet about a normal design", () => {
    const { advice } = advise([bigSquare("#0D0E11")]);
    expect(advice.warnings).toEqual([]);
    expect(advice.names["#0D0E11"]).toBe("Oracal 651-070 Zwart");
  });
});
