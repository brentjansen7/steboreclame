"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

interface BuildingCanvasProps {
  buildingPhotoUrl: string | null;
  designSvg: string | null;
  onCornersChange: (corners: CornerPoints) => void;
  onExport: (canvas: HTMLCanvasElement) => void;
  setCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
  initialCorners?: CornerPoints | null;
  clickToPlace?: boolean;
}

// Affine-map one triangle from src image onto dst canvas
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  sx0: number, sy0: number, dx0: number, dy0: number,
  sx1: number, sy1: number, dx1: number, dy1: number,
  sx2: number, sy2: number, dx2: number, dy2: number,
) {
  const det = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
  if (Math.abs(det) < 0.001) return;
  const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / det;
  const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / det;
  const c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / det;
  const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / det;
  const e = dx0 - a * sx0 - c * sy0;
  const f = dy0 - b * sx0 - d * sy0;

  // Expand clip region 0.5px outward from centroid to prevent sub-pixel gaps
  const cx = (dx0 + dx1 + dx2) / 3;
  const cy = (dy0 + dy1 + dy2) / 3;
  const EPS = 0.5;
  function expand(x: number, y: number): [number, number] {
    const vx = x - cx, vy = y - cy;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    return [x + (vx / len) * EPS, y + (vy / len) * EPS];
  }
  const [ex0, ey0] = expand(dx0, dy0);
  const [ex1, ey1] = expand(dx1, dy1);
  const [ex2, ey2] = expand(dx2, dy2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ex0, ey0);
  ctx.lineTo(ex1, ey1);
  ctx.lineTo(ex2, ey2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Warp img into an arbitrary quadrilateral using horizontal scanline strips.
 * Each strip is ~1px tall in source space → no horizontal seams.
 * The two triangles per strip are sub-pixel thin → diagonal seam invisible.
 */
function drawWarped(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  tl: [number, number],
  tr: [number, number],
  br: [number, number],
  bl: [number, number],
) {
  const iw = img.width;
  const ih = img.height;
  // Cap at 300 strips — more than enough for a crisp warp, fast enough
  const STRIPS = Math.min(ih, 300);

  for (let i = 0; i < STRIPS; i++) {
    const v0 = i / STRIPS;
    const v1 = (i + 1) / STRIPS;
    const sy0 = v0 * ih;
    const sy1 = v1 * ih;

    // Bilinear interpolation of the destination quad
    const lx0 = tl[0] + (bl[0] - tl[0]) * v0, ly0 = tl[1] + (bl[1] - tl[1]) * v0;
    const rx0 = tr[0] + (br[0] - tr[0]) * v0, ry0 = tr[1] + (br[1] - tr[1]) * v0;
    const lx1 = tl[0] + (bl[0] - tl[0]) * v1, ly1 = tl[1] + (bl[1] - tl[1]) * v1;
    const rx1 = tr[0] + (br[0] - tr[0]) * v1, ry1 = tr[1] + (br[1] - tr[1]) * v1;

    // Top-left, top-right, bottom-left, bottom-right of this strip
    drawTriangle(ctx, img,
      0,  sy0, lx0, ly0,
      iw, sy0, rx0, ry0,
      0,  sy1, lx1, ly1,
    );
    drawTriangle(ctx, img,
      iw, sy0, rx0, ry0,
      iw, sy1, rx1, ry1,
      0,  sy1, lx1, ly1,
    );
  }
}

const DEFAULT_PTS: CornerPoints = {
  topLeft:     [100, 100],
  topRight:    [300, 100],
  bottomRight: [300, 250],
  bottomLeft:  [100, 250],
};

/** Load SVG string as HTMLImageElement with correct intrinsic size injected */
function loadSvgImage(svgStr: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    // Parse the SVG to read/inject explicit width+height from viewBox
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, "image/svg+xml");
    const root = doc.documentElement as unknown as SVGSVGElement;

    let w = parseFloat(root.getAttribute("width") || "0");
    let h = parseFloat(root.getAttribute("height") || "0");

    if (!w || !h) {
      const vb = root.getAttribute("viewBox");
      if (vb) {
        const parts = vb.split(/[\s,]+/).map(Number);
        if (parts.length === 4) { w = parts[2]; h = parts[3]; }
      }
    }
    if (!w) w = 800;
    if (!h) h = 600;

    // Force explicit dimensions so the browser renders at full size
    root.setAttribute("width",  String(w));
    root.setAttribute("height", String(h));

    const serialized = new XMLSerializer().serializeToString(doc);
    const blob = new Blob([serialized], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);

    const img = new Image(w, h);
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(img); }; // resolve anyway
    img.src = url;
  });
}

export default function BuildingCanvas({
  buildingPhotoUrl,
  designSvg,
  onCornersChange,
  onExport,
  setCanvasRef,
  initialCorners,
}: BuildingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const callbackRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (setCanvasRef) setCanvasRef(node);
  }, [setCanvasRef]);

  const [photo, setPhoto]         = useState<HTMLImageElement | null>(null);
  const [designImg, setDesignImg] = useState<HTMLImageElement | null>(null);
  const [pts, setPts]             = useState<CornerPoints>(DEFAULT_PTS);
  const [hasSelection, setHasSelection] = useState(false);
  const [dragging, setDragging]   = useState<HandleKey | null>(null);
  const [selStart, setSelStart]   = useState<[number, number] | null>(null);
  const [selEnd, setSelEnd]       = useState<[number, number] | null>(null);

  useEffect(() => {
    if (initialCorners) { setPts(initialCorners); setHasSelection(true); }
  }, [initialCorners]);

  useEffect(() => {
    if (!buildingPhotoUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPhoto(img);
    img.src = buildingPhotoUrl;
  }, [buildingPhotoUrl]);

  useEffect(() => {
    if (!designSvg) return;
    loadSvgImage(designSvg).then(setDesignImg);
  }, [designSvg]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    ctx.drawImage(photo, 0, 0);

    // Live selection box preview
    if (selStart && selEnd) {
      const x = Math.min(selStart[0], selEnd[0]);
      const y = Math.min(selStart[1], selEnd[1]);
      const w = Math.abs(selEnd[0] - selStart[0]);
      const h = Math.abs(selEnd[1] - selStart[1]);
      ctx.fillStyle   = "rgba(37,99,235,0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth   = Math.max(2, canvas.width * 0.003);
      ctx.setLineDash([12, 6]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      return;
    }

    if (!hasSelection) return;

    // Warp the design into the selected quad
    if (designImg) {
      // Render design onto opaque white offscreen canvas first
      const srcW = designImg.naturalWidth  || designImg.width  || 800;
      const srcH = designImg.naturalHeight || designImg.height || 600;
      const off = document.createElement("canvas");
      off.width  = srcW;
      off.height = srcH;
      const offCtx = off.getContext("2d")!;
      offCtx.fillStyle = "white";
      offCtx.fillRect(0, 0, srcW, srcH);
      offCtx.drawImage(designImg, 0, 0, srcW, srcH);

      drawWarped(ctx, off,
        pts.topLeft, pts.topRight, pts.bottomRight, pts.bottomLeft);
    }

    // Border around the quad
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth   = Math.max(2, canvas.width * 0.003);
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(pts.topLeft[0],     pts.topLeft[1]);
    ctx.lineTo(pts.topRight[0],    pts.topRight[1]);
    ctx.lineTo(pts.bottomRight[0], pts.bottomRight[1]);
    ctx.lineTo(pts.bottomLeft[0],  pts.bottomLeft[1]);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner handles
    const cr    = canvas.getBoundingClientRect();
    const scale = canvas.width / (cr.width || canvas.width);
    const r     = Math.round(6 * scale);

    const handles: [HandleKey, number, number][] = [
      ["topLeft",     pts.topLeft[0],     pts.topLeft[1]],
      ["topRight",    pts.topRight[0],    pts.topRight[1]],
      ["bottomRight", pts.bottomRight[0], pts.bottomRight[1]],
      ["bottomLeft",  pts.bottomLeft[0],  pts.bottomLeft[1]],
    ];
    for (const [key, px, py] of handles) {
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur  = r;
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = dragging === key ? "#1e40af" : "#3b82f6";
      ctx.fill();
    }
  }, [photo, designImg, pts, hasSelection, dragging, selStart, selEnd]);

  useEffect(() => { render(); }, [render]);

  const toCanvas = (e: React.MouseEvent): [number, number] => {
    const c  = canvasRef.current!;
    const cr = c.getBoundingClientRect();
    return [
      Math.round((e.clientX - cr.left) * (c.width  / cr.width)),
      Math.round((e.clientY - cr.top)  * (c.height / cr.height)),
    ];
  };

  const hitHandle = (mx: number, my: number): HandleKey | null => {
    if (!hasSelection) return null;
    const c      = canvasRef.current!;
    const cr     = c.getBoundingClientRect();
    const scale  = c.width / cr.width;
    const thresh = 18 * scale;
    for (const key of ["topLeft","topRight","bottomRight","bottomLeft"] as HandleKey[]) {
      const [px, py] = pts[key];
      if (Math.hypot(mx - px, my - py) < thresh) return key;
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    const handle = hitHandle(mx, my);
    if (handle) { setDragging(handle); return; }
    setHasSelection(false);
    setSelStart([mx, my]);
    setSelEnd([mx, my]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    if (dragging) {
      const updated = { ...pts, [dragging]: [mx, my] as [number, number] };
      setPts(updated);
      onCornersChange(updated);
      return;
    }
    if (selStart) setSelEnd([mx, my]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (selStart) {
      const [mx, my] = toCanvas(e);
      if (Math.abs(mx - selStart[0]) > 8 && Math.abs(my - selStart[1]) > 8) {
        const x = Math.min(selStart[0], mx), y = Math.min(selStart[1], my);
        const w = Math.abs(mx - selStart[0]), h = Math.abs(my - selStart[1]);
        const newPts: CornerPoints = {
          topLeft:     [x,     y],
          topRight:    [x + w, y],
          bottomRight: [x + w, y + h],
          bottomLeft:  [x,     y + h],
        };
        setPts(newPts);
        onCornersChange(newPts);
        setHasSelection(true);
      }
    }
    setSelStart(null);
    setSelEnd(null);
    setDragging(null);
  };

  if (!buildingPhotoUrl) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
        Upload eerst een foto van het pand
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={callbackRef}
        className="w-full rounded-xl border border-gray-200"
        style={{ cursor: dragging ? "grab" : "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => { if (canvasRef.current) onExport(canvasRef.current); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <p className="text-sm text-gray-500 self-center">
          Sleep over het logo · versleep hoekpunten om bij te stellen
        </p>
      </div>
    </div>
  );
}
