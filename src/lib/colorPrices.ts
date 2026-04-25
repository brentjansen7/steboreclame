// Per-color vinyl pricing stored in localStorage so Brent can keep his own price list.

export interface ColorPrice {
  hex: string;          // canonical #RRGGBB uppercase
  pricePerM: number;    // € per meter on the roll
  name?: string;        // optional label, e.g. "RAL 9005 Zwart"
}

const KEY = "stebo:color-prices";

export function loadColorPrices(): ColorPrice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is ColorPrice =>
        typeof p?.hex === "string" && typeof p?.pricePerM === "number"
    );
  } catch {
    return [];
  }
}

export function saveColorPrices(prices: ColorPrice[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(prices));
}

// Find the cheapest matching price within RGB distance threshold
export function findPriceForColor(
  hex: string,
  prices: ColorPrice[],
  threshold = 60
): number | null {
  if (prices.length === 0) return null;
  const target = hexToRgb(hex);
  if (!target) return null;
  let best: { price: number; dist: number } | null = null;
  for (const p of prices) {
    const rgb = hexToRgb(p.hex);
    if (!rgb) continue;
    const d = colorDist(target, rgb);
    if (d <= threshold && (!best || d < best.dist)) {
      best = { price: p.pricePerM, dist: d };
    }
  }
  return best ? best.price : null;
}

export function normalizeHex(input: string): string | null {
  const m = input.trim().replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const norm = normalizeHex(hex);
  if (!norm) return null;
  const n = parseInt(norm.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDist(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
