import type { ColorLayer, DesignMeasurement } from "./colorLayers";
import { deltaE } from "./colorLayers";
import { nearestVinylColor, vinylLabel, type ColorMatch } from "./vinylColors";

// ΔE: layers that survived the merge but still sit close together. Above the
// merge tolerance (6), below the point where colours clearly differ.
const NEARLY_THE_SAME = 12;
const TINY_AREA_M2 = 0.01;
const ROLL_BORDER_MM = 3;

export interface LayerAdvice {
  matches: Record<string, ColorMatch>; // hex of the design → vinyl from the chart
  names: Record<string, string>; // hex → "Oracal 751-070 Zwart"
  warnings: string[];
}

const cm = (mm: number) => (mm / 10).toFixed(0);

// Everything the app can say about the layers with certainty: which vinyl comes
// closest, and what is worth a second look before cutting.
export function adviseLayers(
  measurement: DesignMeasurement,
  layers: ColorLayer[],
  rollWidthMm: number
): LayerAdvice {
  const matches: Record<string, ColorMatch> = {};
  const names: Record<string, string> = {};
  const warnings: string[] = [];

  for (const layer of measurement.layers) {
    const match = nearestVinylColor(layer.color);
    matches[layer.color] = match;
    names[layer.color] = vinylLabel(match);

    if (!match.close) {
      warnings.push(
        `${layer.color} is geen standaardkleur. Dichtstbij is ${vinylLabel(match)}, maar dat scheelt zichtbaar (ΔE ${match.difference}) — kleur laten maken of zelf kiezen.`
      );
    }
    if (layer.areaMm2 / 1e6 < TINY_AREA_M2) {
      warnings.push(`${layer.color} is maar ${(layer.areaMm2 / 1e6).toFixed(3)} m² — fijn snijwerk, let op het pellen.`);
    }
    if (!layer.fitsOnRoll) {
      const strips = Math.ceil(layer.pieceWidthMm / (rollWidthMm - 2 * ROLL_BORDER_MM));
      warnings.push(
        `${layer.color} is ${cm(layer.widthMm)} × ${cm(layer.heightMm)} cm en past niet op een rol van ${cm(rollWidthMm)} cm: minimaal ${strips} banen nodig.`
      );
    }

    const source = layers.find((l) => l.color === layer.color);
    if (source?.elements.some((el) => el.kind === "stroke")) {
      warnings.push(`${layer.color} bevat contourlijnen. Die worden over het hart gesneden, niet als vlak — controleer dit ontwerp.`);
    }
  }

  // Layers you might be able to cut from one roll: close together, or both
  // landing on the same vinyl from the chart
  const colors = measurement.layers.map((l) => l.color);
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const sameVinyl = matches[colors[i]].code === matches[colors[j]].code;
      const difference = deltaE(colors[i], colors[j]);
      if (sameVinyl || difference < NEARLY_THE_SAME) {
        warnings.push(
          sameVinyl
            ? `${colors[i]} en ${colors[j]} komen allebei uit op ${vinylLabel(matches[colors[i]])} — één folie of toch twee?`
            : `${colors[i]} en ${colors[j]} liggen dicht bij elkaar (ΔE ${difference.toFixed(1)}) — misschien één folie?`
        );
      }
    }
  }

  return { matches, names, warnings };
}
