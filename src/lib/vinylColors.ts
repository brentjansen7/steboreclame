import { deltaE } from "./colorLayers";

export interface VinylColor {
  code: string; // Oracal 651 number
  name: string;
  hex: string;
}

// ORACAL 651 colour chart. Screen values are indicative: always check against
// a real colour fan before ordering. Source: jeepdecalstore.com/pages/oracal-651-color-chart
export const ORACAL_651: VinylColor[] = [
  { code: "010", name: "Wit", hex: "#E6E9EE" },
  { code: "070", name: "Zwart", hex: "#0D0E11" },
  { code: "072", name: "Lichtgrijs", hex: "#BFC2C0" },
  { code: "074", name: "Middengrijs", hex: "#8A948B" },
  { code: "076", name: "Telegrijs", hex: "#818689" },
  { code: "071", name: "Grijs", hex: "#757D7C" },
  { code: "073", name: "Donkergrijs", hex: "#4B4C4C" },
  { code: "025", name: "Zwavelgeel", hex: "#F2E210" },
  { code: "022", name: "Lichtgeel", hex: "#F2CA00" },
  { code: "021", name: "Geel", hex: "#FEC500" },
  { code: "019", name: "Signaalgeel", hex: "#E6A700" },
  { code: "020", name: "Goudgeel", hex: "#FBAA00" },
  { code: "035", name: "Pasteloranje", hex: "#FC6C00" },
  { code: "036", name: "Lichtoranje", hex: "#EA6700" },
  { code: "034", name: "Oranje", hex: "#DF4A06" },
  { code: "047", name: "Oranjerood", hex: "#D33100" },
  { code: "341", name: "Koraal", hex: "#F26241" },
  { code: "032", name: "Lichtrood", hex: "#C91100" },
  { code: "031", name: "Rood", hex: "#B0000D" },
  { code: "030", name: "Donkerrood", hex: "#900E16" },
  { code: "312", name: "Bordeaux", hex: "#6F000E" },
  { code: "026", name: "Purperrood", hex: "#5E050E" },
  { code: "045", name: "Zachtroze", hex: "#ED84B6" },
  { code: "041", name: "Roze", hex: "#C22B6B" },
  { code: "042", name: "Lila", hex: "#B893BC" },
  { code: "043", name: "Lavendel", hex: "#775EA0" },
  { code: "040", name: "Violet", hex: "#5D2C68" },
  { code: "404", name: "Paars", hex: "#412773" },
  { code: "056", name: "IJsblauw", hex: "#3DA1D2" },
  { code: "053", name: "Lichtblauw", hex: "#0089C3" },
  { code: "084", name: "Hemelsblauw", hex: "#0075BB" },
  { code: "052", name: "Azuurblauw", hex: "#005DAB" },
  { code: "098", name: "Gentiaan", hex: "#0050A2" },
  { code: "051", name: "Gentiaanblauw", hex: "#004684" },
  { code: "057", name: "Verkeersblauw", hex: "#00408C" },
  { code: "086", name: "Briljantblauw", hex: "#1930AB" },
  { code: "049", name: "Koningsblauw", hex: "#152A78" },
  { code: "065", name: "Kobaltblauw", hex: "#0D226C" },
  { code: "067", name: "Blauw", hex: "#003A79" },
  { code: "050", name: "Donkerblauw", hex: "#1B2E5D" },
  { code: "518", name: "Staalblauw", hex: "#13133E" },
  { code: "562", name: "Diepzeeblauw", hex: "#131E3A" },
  { code: "055", name: "Mint", hex: "#5FCDB7" },
  { code: "054", name: "Turquoise", hex: "#009B97" },
  { code: "066", name: "Turquoiseblauw", hex: "#00818C" },
  { code: "063", name: "Lindegroen", hex: "#6AA72D" },
  { code: "064", name: "Geelgroen", hex: "#289901" },
  { code: "062", name: "Lichtgroen", hex: "#00873C" },
  { code: "061", name: "Groen", hex: "#00784B" },
  { code: "068", name: "Grasgroen", hex: "#007A42" },
  { code: "613", name: "Bosgroen", hex: "#005236" },
  { code: "060", name: "Donkergroen", hex: "#004028" },
  { code: "023", name: "Crème", hex: "#EBD494" },
  { code: "082", name: "Beige", hex: "#CEC09F" },
  { code: "081", name: "Lichtbruin", hex: "#A8885C" },
  { code: "080", name: "Bruin", hex: "#432F1E" },
  { code: "090", name: "Zilver metallic", hex: "#686A6D" },
  { code: "091", name: "Goud metallic", hex: "#756232" },
  { code: "092", name: "Koper metallic", hex: "#6B411D" },
  { code: "824", name: "Imitatiegoud", hex: "#D2972F" },
];

export interface ColorMatch extends VinylColor {
  difference: number; // ΔE against the colour in the design
  close: boolean; // small enough to order without doubt
}

const CLOSE_ENOUGH = 10;

// Nearest vinyl from the chart. Pure code, no guessing: the difference is
// shown so you can see when a colour has to be ordered specially.
export function nearestVinylColor(hex: string, chart: VinylColor[] = ORACAL_651): ColorMatch {
  let best = chart[0];
  let bestDiff = Infinity;
  for (const color of chart) {
    const diff = deltaE(hex, color.hex);
    if (diff < bestDiff) {
      best = color;
      bestDiff = diff;
    }
  }
  return { ...best, difference: Math.round(bestDiff * 10) / 10, close: bestDiff <= CLOSE_ENOUGH };
}

export function vinylLabel(match: ColorMatch): string {
  return `Oracal 651-${match.code} ${match.name}`;
}
