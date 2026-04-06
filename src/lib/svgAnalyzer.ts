import { svgPathBbox } from "svg-path-bbox";
import SvgPath from "svgpath";
import type { SvgElement, ColorGroup } from "@/types";

// Parse an SVG string and extract all elements with their colors and dimensions
export function analyzeSvg(svgString: string): {
  elements: SvgElement[];
  colorGroups: Map<string, SvgElement[]>;
  viewBox: { width: number; height: number };
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgRoot = doc.documentElement;

  // Get SVG dimensions from viewBox or width/height
  const viewBox = parseViewBox(svgRoot);

  // Collect all shape elements recursively
  const elements: SvgElement[] = [];
  collectElements(svgRoot, elements, "");

  // Group by color
  const colorGroups = new Map<string, SvgElement[]>();
  for (const el of elements) {
    const color = normalizeColor(el.fill);
    if (!colorGroups.has(color)) {
      colorGroups.set(color, []);
    }
    colorGroups.get(color)!.push(el);
  }

  return { elements, colorGroups, viewBox };
}

function parseViewBox(svgRoot: Element): { width: number; height: number } {
  const vb = svgRoot.getAttribute("viewBox");
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const w = parseFloat(svgRoot.getAttribute("width") || "0");
  const h = parseFloat(svgRoot.getAttribute("height") || "0");
  return { width: w || 1000, height: h || 1000 };
}

function collectElements(
  node: Element,
  elements: SvgElement[],
  parentTransform: string
): void {
  const transform = combineTransforms(
    parentTransform,
    node.getAttribute("transform") || ""
  );

  // Inherit fill from parent if not set on element
  const parentFill = node.getAttribute("fill") || "";

  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();

    if (tag === "g") {
      // Recurse into groups, pass parent fill as default
      const groupFill = child.getAttribute("fill") || parentFill;
      if (groupFill && !child.getAttribute("fill")) {
        child.setAttribute("fill", groupFill);
      }
      collectElements(child, elements, transform);
      continue;
    }

    const fill = extractFill(child, parentFill);
    if (!fill || fill === "none" || fill === "transparent") continue;

    const pathData = elementToPath(child, tag);
    if (!pathData) continue;

    // Apply transforms to path data
    const transformedPath = transform
      ? SvgPath(pathData).transform(transform).toString()
      : pathData;

    // Calculate bounding box
    const [minX, minY, maxX, maxY] = svgPathBbox(transformedPath);
    const bbox = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    elements.push({
      id: child.getAttribute("id") || `el-${elements.length}`,
      tagName: tag,
      fill: normalizeColor(fill),
      pathData: transformedPath,
      bbox,
    });
  }
}

function extractFill(el: Element, parentFill: string): string {
  // Check inline style first
  const style = el.getAttribute("style") || "";
  const styleMatch = style.match(/fill\s*:\s*([^;]+)/);
  if (styleMatch) return styleMatch[1].trim();

  // Check fill attribute
  const fill = el.getAttribute("fill");
  if (fill) return fill;

  // Inherit from parent
  return parentFill || "#000000";
}

function elementToPath(el: Element, tag: string): string | null {
  switch (tag) {
    case "path":
      return el.getAttribute("d");
    case "rect": {
      const x = parseFloat(el.getAttribute("x") || "0");
      const y = parseFloat(el.getAttribute("y") || "0");
      const w = parseFloat(el.getAttribute("width") || "0");
      const h = parseFloat(el.getAttribute("height") || "0");
      if (!w || !h) return null;
      return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
    }
    case "circle": {
      const cx = parseFloat(el.getAttribute("cx") || "0");
      const cy = parseFloat(el.getAttribute("cy") || "0");
      const r = parseFloat(el.getAttribute("r") || "0");
      if (!r) return null;
      return `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`;
    }
    case "ellipse": {
      const ecx = parseFloat(el.getAttribute("cx") || "0");
      const ecy = parseFloat(el.getAttribute("cy") || "0");
      const rx = parseFloat(el.getAttribute("rx") || "0");
      const ry = parseFloat(el.getAttribute("ry") || "0");
      if (!rx || !ry) return null;
      return `M${ecx - rx},${ecy} A${rx},${ry} 0 1,0 ${ecx + rx},${ecy} A${rx},${ry} 0 1,0 ${ecx - rx},${ecy} Z`;
    }
    case "polygon": {
      const points = el.getAttribute("points");
      if (!points) return null;
      const coords = points.trim().split(/[\s,]+/);
      if (coords.length < 4) return null;
      let d = `M${coords[0]},${coords[1]}`;
      for (let i = 2; i < coords.length; i += 2) {
        d += ` L${coords[i]},${coords[i + 1]}`;
      }
      return d + " Z";
    }
    case "polyline": {
      const pts = el.getAttribute("points");
      if (!pts) return null;
      const c = pts.trim().split(/[\s,]+/);
      if (c.length < 4) return null;
      let d = `M${c[0]},${c[1]}`;
      for (let i = 2; i < c.length; i += 2) {
        d += ` L${c[i]},${c[i + 1]}`;
      }
      return d;
    }
    case "line": {
      const x1 = el.getAttribute("x1") || "0";
      const y1 = el.getAttribute("y1") || "0";
      const x2 = el.getAttribute("x2") || "0";
      const y2 = el.getAttribute("y2") || "0";
      return `M${x1},${y1} L${x2},${y2}`;
    }
    default:
      return null;
  }
}

function combineTransforms(parent: string, child: string): string {
  if (!parent && !child) return "";
  if (!parent) return child;
  if (!child) return parent;
  return `${parent} ${child}`;
}

// Normalize color to uppercase hex
function normalizeColor(color: string): string {
  color = color.trim().toLowerCase();

  // Already hex
  if (color.startsWith("#")) {
    // Expand shorthand #RGB to #RRGGBB
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toUpperCase();
    }
    return color.toUpperCase();
  }

  // rgb(r, g, b)
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`.toUpperCase();
  }

  // Named colors (common ones)
  const namedColors: Record<string, string> = {
    black: "#000000",
    white: "#FFFFFF",
    red: "#FF0000",
    green: "#008000",
    blue: "#0000FF",
    yellow: "#FFFF00",
    orange: "#FFA500",
    gold: "#FFD700",
  };
  return namedColors[color] || color.toUpperCase();
}

// Convert SVG units to mm (assuming 96 DPI default for SVG)
export function svgUnitsToMm(
  value: number,
  svgWidth: number,
  realWidthMm?: number
): number {
  if (realWidthMm) {
    return (value / svgWidth) * realWidthMm;
  }
  // Default: 1 SVG unit = 1 user unit, assume 96 DPI → 1px = 0.2646mm
  return value * 0.2646;
}

// Get the SVG string for elements of a specific color only
export function filterSvgByColor(
  svgString: string,
  targetColor: string
): string {
  const { elements, viewBox } = analyzeSvg(svgString);
  const filtered = elements.filter((el) => el.fill === targetColor);

  const paths = filtered
    .map((el) => `  <path d="${el.pathData}" fill="${el.fill}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">
${paths}
</svg>`;
}
