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

// Warp designImg into arbitrary quad (tl, tr, br, bl) using horizontal strip method
function drawWarped(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  tl: [number, number],
  tr: [number, number],
  br: [number, number],
  bl: [number, number],
  alpha: number
) {
  const steps = 60;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  ctx.save();
  ctx.globalAlpha = alpha;

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;

    // Destination strip corners
    const d0lx = lerp(tl[0], bl[0], t0), d0ly = lerp(tl[1], bl[1], t0);
    const d0rx = lerp(tr[0], br[0], t0), d0ry = lerp(tr[1], br[1], t0);
    const d1lx = lerp(tl[0], bl[0], t1), d1ly = lerp(tl[1], bl[1], t1);
    const d1rx = lerp(tr[0], br[0], t1), d1ry = lerp(tr[1], br[1], t1);

    // Source strip y range
    const sy0 = t0 * ih;
    const sy1 = t1 * ih;

    // Affine transform: map source rect (0,sy0)→(iw,sy0)→(0,sy1) to dest strip
    const sx0 = 0, sy0v = sy0, sx1 = iw, sx2 = 0, sy2v = sy1;
    const dx0 = d0lx, dy0 = d0ly, dx1 = d0rx, dy1 = d0ry, dx2 = d1lx, dy2 = d1ly;

    const det = (sx1 - sx0) * (sy2v - sy0v) - (sx2 - sx0) * (sy1v - sy0v);
    if (Math.abs(det) < 0.001) continue;

    const a = ((dx1 - dx0) * (sy2v - sy0v) - (dx2 - dx0) * (sy1v - sy0v)) / det;
    const b = ((dy1 - dy0) * (sy2v - sy0v) - (dy2 - dy0) * (sy1v - sy0v)) / det;
    const c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / det;
    const d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / det;
    const e = dx0 - a * sx0 - c * sy0v;
    const f = dy0 - b * sx0 - d * sy0v;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0lx, d0ly);
    ctx.lineTo(d0rx, d0ry);
    ctx.lineTo(d1rx, d1ry);
    ctx.lineTo(d1lx, d1ly);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

const DEFAULT_PTS: CornerPoints = {
  topLeft:     [100, 100],
  topRight:    [300, 100],
  bottomRight: [300, 250],
  bottomLeft:  [100, 250],
};

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
    const blob = new Blob([designSvg], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload  = () => setDesignImg(img);
    img.onerror = () => {
      const enc = btoa(unescape(encodeURIComponent(designSvg)));
      const i2  = new Image();
      i2.onload = () => setDesignImg(i2);
      i2.src = `data:image/svg+xml;base64,${enc}`;
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [designSvg]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    ctx.drawImage(photo, 0, 0);

    // Live selection preview
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

    // Draw design warped into the 4 points
    if (designImg) {
      drawWarped(ctx, designImg,
        pts.topLeft, pts.topRight, pts.bottomRight, pts.bottomLeft, 0.85);
    }

    // Outline connecting the 4 dots
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

    // Dots at exact corner positions
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
      // Only this dot moves — others stay exactly where they are
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
