import { deltaE } from "./colorLayers";

export interface VinylColor {
  code: string;
  name: string;
  hex: string;
}

export interface VinylSeries {
  id: string;
  label: string; // "Oracal 751"
  colors: VinylColor[];
}

// ORACAL 751C (cast, long-term) colour chart — Stephan's main material.
// Screen values are indicative: always check against a real colour fan
// before ordering. Source: orafol.com/en/americas/products/oracal-751c-high-performance-cast
export const ORACAL_751: VinylSeries = {
  id: "oracal-751",
  label: "Oracal 751",
  colors: [
    { code: "010", name: "Wit", hex: "#EFF2F2" },
    { code: "020", name: "Goudgeel", hex: "#FCAC00" },
    { code: "211", name: "Zonnegeel", hex: "#FCBB00" },
    { code: "019", name: "Signaalgeel", hex: "#E9AA00" },
    { code: "209", name: "Maïsgeel", hex: "#FDC200" },
    { code: "021", name: "Geel", hex: "#FAC400" },
    { code: "022", name: "Lichtgeel", hex: "#F5D100" },
    { code: "203", name: "Strogeel", hex: "#FEBC00" },
    { code: "025", name: "Zwavelgeel", hex: "#F3E514" },
    { code: "026", name: "Purperrood", hex: "#64101D" },
    { code: "030", name: "Donkerrood", hex: "#8B101A" },
    { code: "031", name: "Rood", hex: "#B11811" },
    { code: "027", name: "Tomatenrood", hex: "#BA020E" },
    { code: "028", name: "Kardinaalrood", hex: "#C1061A" },
    { code: "325", name: "Middenrood", hex: "#CA0C00" },
    { code: "324", name: "Bloedrood", hex: "#CF0000" },
    { code: "306", name: "Karmozijn", hex: "#AB0000" },
    { code: "032", name: "Lichtrood", hex: "#CB1703" },
    { code: "326", name: "Signaalrood", hex: "#D01D00" },
    { code: "047", name: "Oranjerood", hex: "#D43400" },
    { code: "033", name: "Roodoranje", hex: "#D83600" },
    { code: "034", name: "Oranje", hex: "#EF5600" },
    { code: "035", name: "Pasteloranje", hex: "#F56600" },
    { code: "048", name: "Bordeaux", hex: "#69002E" },
    { code: "040", name: "Violet", hex: "#5A2E68" },
    { code: "403", name: "Lichtviolet", hex: "#592C87" },
    { code: "043", name: "Lavendel", hex: "#7A61A5" },
    { code: "042", name: "Lila", hex: "#B490BC" },
    { code: "041", name: "Roze", hex: "#BB1661" },
    { code: "077", name: "Telemagenta", hex: "#C02C6E" },
    { code: "044", name: "Magenta", hex: "#CD5180" },
    { code: "045", name: "Zachtroze", hex: "#E97FB4" },
    { code: "532", name: "Zwartblauw", hex: "#111823" },
    { code: "518", name: "Staalblauw", hex: "#0D173D" },
    { code: "050", name: "Donkerblauw", hex: "#132E5B" },
    { code: "058", name: "Ultramarijnblauw", hex: "#002B6E" },
    { code: "537", name: "Diepblauw", hex: "#01155B" },
    { code: "065", name: "Kobaltblauw", hex: "#051F6D" },
    { code: "049", name: "Koningsblauw", hex: "#182F7D" },
    { code: "086", name: "Briljantblauw", hex: "#0731AD" },
    { code: "536", name: "Middenblauw", hex: "#002778" },
    { code: "067", name: "Blauw", hex: "#003E7D" },
    { code: "057", name: "Verkeersblauw", hex: "#004293" },
    { code: "051", name: "Gentiaanblauw", hex: "#0050A1" },
    { code: "052", name: "Azuurblauw", hex: "#0067BB" },
    { code: "517", name: "Euroblauw", hex: "#007FBD" },
    { code: "053", name: "Lichtblauw", hex: "#0088CF" },
    { code: "056", name: "IJsblauw", hex: "#37A1D4" },
    { code: "608", name: "Petrol", hex: "#005A6D" },
    { code: "054", name: "Turquoise", hex: "#009B97" },
    { code: "055", name: "Mint", hex: "#58CEB8" },
    { code: "060", name: "Donkergroen", hex: "#004627" },
    { code: "078", name: "Loofgroen", hex: "#005319" },
    { code: "617", name: "Smaragdgroen", hex: "#00602B" },
    { code: "607", name: "Turquoisegroen", hex: "#006650" },
    { code: "066", name: "Turquoiseblauw", hex: "#008694" },
    { code: "061", name: "Groen", hex: "#007447" },
    { code: "068", name: "Grasgroen", hex: "#007A42" },
    { code: "062", name: "Lichtgroen", hex: "#008E3A" },
    { code: "064", name: "Geelgroen", hex: "#00A31A" },
    { code: "063", name: "Lindegroen", hex: "#63C43C" },
    { code: "080", name: "Bruin", hex: "#44291E" },
    { code: "079", name: "Roodbruin", hex: "#622214" },
    { code: "083", name: "Notenbruin", hex: "#B3581D" },
    { code: "081", name: "Lichtbruin", hex: "#A9865E" },
    { code: "023", name: "Crème", hex: "#EFDB9B" },
    { code: "018", name: "Lichtivoor", hex: "#E3D3BA" },
    { code: "070", name: "Zwart", hex: "#0E0D0D" },
    { code: "720", name: "Komatsugrijs", hex: "#2D2F31" },
    { code: "073", name: "Donkergrijs", hex: "#4C4E4F" },
    { code: "713", name: "IJzergrijs", hex: "#585F62" },
    { code: "071", name: "Grijs", hex: "#666B67" },
    { code: "721", name: "Leigrijs", hex: "#758289" },
    { code: "076", name: "Telegrijs", hex: "#878A8D" },
    { code: "074", name: "Middengrijs", hex: "#8A8F8C" },
    { code: "072", name: "Lichtgrijs", hex: "#C5C8C8" },
    { code: "090", name: "Zilvergrijs", hex: "#818487" },
    { code: "930", name: "Goud metallic", hex: "#917042" },
    { code: "093", name: "Antraciet", hex: "#434542" },
    { code: "824", name: "Imitatiegoud", hex: "#D2972F" },
  ],
};

// ORACAL 651 (cast, mid-term) — kept as a fallback chart for designs that
// use it instead. Source: jeepdecalstore.com/pages/oracal-651-color-chart
export const ORACAL_651: VinylSeries = {
  id: "oracal-651",
  label: "Oracal 651",
  colors: [
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
  ],
};

// ORACAL 970 (wrap film) is not in here yet — no reliable colour chart with
// RGB values found. Stephan also uses this sometimes; add it once a real
// source turns up rather than guessing values.
export const VINYL_SERIES: VinylSeries[] = [ORACAL_751, ORACAL_651];

export interface ColorMatch extends VinylColor {
  series: string; // "Oracal 751"
  difference: number; // ΔE against the colour in the design
  close: boolean; // small enough to order without doubt
}

const CLOSE_ENOUGH = 10;

// Nearest vinyl from the chart. Pure code, no guessing: the difference is
// shown so you can see when a colour has to be ordered specially.
export function nearestVinylColor(hex: string, series: VinylSeries = ORACAL_751): ColorMatch {
  let best = series.colors[0];
  let bestDiff = Infinity;
  for (const color of series.colors) {
    const diff = deltaE(hex, color.hex);
    if (diff < bestDiff) {
      best = color;
      bestDiff = diff;
    }
  }
  return { ...best, series: series.label, difference: Math.round(bestDiff * 10) / 10, close: bestDiff <= CLOSE_ENOUGH };
}

export function vinylLabel(match: ColorMatch): string {
  return `${match.series}-${match.code} ${match.name}`;
}
