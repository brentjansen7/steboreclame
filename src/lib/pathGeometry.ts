import SvgPath from "svgpath";

export type Point = { x: number; y: number };
export type Polyline = Point[];

const CURVE_STEPS = 24;

// Flatten SVG path data into polylines (one per subpath). Curves and arcs are
// sampled, so the result is accurate enough for area, cutting and drawing.
export function flattenPath(d: string, curveSteps = CURVE_STEPS): Polyline[] {
  const subpaths: Polyline[] = [];
  let current: Polyline = [];
  let start: Point = { x: 0, y: 0 };

  const flush = () => {
    if (current.length > 1) subpaths.push(current);
    current = [];
  };

  SvgPath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate((seg, _i, x, y) => {
      const cmd = seg[0] as string;
      const n = seg as unknown as number[];
      switch (cmd) {
        case "M":
          flush();
          start = { x: n[1], y: n[2] };
          current.push(start);
          break;
        case "L":
          current.push({ x: n[1], y: n[2] });
          break;
        case "H":
          current.push({ x: n[1], y });
          break;
        case "V":
          current.push({ x, y: n[1] });
          break;
        case "C":
          for (let s = 1; s <= curveSteps; s++) {
            const t = s / curveSteps;
            const u = 1 - t;
            current.push({
              x: u * u * u * x + 3 * u * u * t * n[1] + 3 * u * t * t * n[3] + t * t * t * n[5],
              y: u * u * u * y + 3 * u * u * t * n[2] + 3 * u * t * t * n[4] + t * t * t * n[6],
            });
          }
          break;
        case "Q":
          for (let s = 1; s <= curveSteps; s++) {
            const t = s / curveSteps;
            const u = 1 - t;
            current.push({
              x: u * u * x + 2 * u * t * n[1] + t * t * n[3],
              y: u * u * y + 2 * u * t * n[2] + t * t * n[4],
            });
          }
          break;
        case "Z":
        case "z":
          if (current.length > 0) {
            const last = current[current.length - 1];
            if (last.x !== start.x || last.y !== start.y) current.push({ ...start });
          }
          flush();
          current.push({ ...start });
          break;
      }
    });

  flush();
  return subpaths;
}

// Shoelace formula; positive or negative depending on winding direction
export function signedArea(poly: Polyline): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += (poly[j].x - poly[i].x) * (poly[j].y + poly[i].y);
  }
  return sum / 2;
}

export function polylineLength(poly: Polyline): number {
  let len = 0;
  for (let i = 1; i < poly.length; i++) {
    len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  }
  return len;
}

// Uniform scale factor of an SVG transform string (1 when there is none)
export function transformScale(transform: string): number {
  if (!transform) return 1;
  const p = flattenPath(SvgPath("M0 0 L1 0 M0 0 L0 1").transform(transform).toString());
  if (p.length < 2) return 1;
  return Math.sqrt(polylineLength(p[0]) * polylineLength(p[1]));
}
