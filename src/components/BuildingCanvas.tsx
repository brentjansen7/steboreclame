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
  // 4 independent points — the source of truth
  const [pts, setPts]             = useState<CornerPoints>(DEFAULT_PTS);
  const [hasSelection, setHasSelection] = useState(false);
  const [dragging, setDragging]   = useState<HandleKey | null>(null);
  // new-selection drag state
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

    // Live selection preview while dragging a new area
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

    // Bounding box for design overlay (from actual point positions)
    const xs = [pts.topLeft[0], pts.topRight[0], pts.bottomRight[0], pts.bottomLeft[0]];
    const ys = [pts.topLeft[1], pts.topRight[1], pts.bottomRight[1], pts.bottomLeft[1]];
    const bx = Math.min(...xs), by = Math.min(...ys);
    const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;

    if (designImg && bw > 4 && bh > 4) {
      // Draw design in bounding box — always fully visible, not clipped
      ctx.globalAlpha = 0.85;
      ctx.drawImage(designImg, bx, by, bw, bh);
      ctx.globalAlpha = 1;
    }

    // Outline connecting the 4 points in actual positions
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

    // Small handles — size in canvas pixels that = ~7px on screen
    const displayWidth = canvasRef.current?.getBoundingClientRect().width || canvas.width;
    const scale = canvas.width / displayWidth;
    const r = Math.round(7 * scale); // always 7 CSS pixels on screen
    const keys: HandleKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
    for (const key of keys) {
      const [px, py] = pts[key];
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur  = r;
      // white ring
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      // blue dot
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
    // cr.width = CSS display width, c.width = actual canvas pixel width
    const scaleX = c.width  / cr.width;
    const scaleY = c.height / cr.height;
    return [
      Math.round((e.clientX - cr.left) * scaleX),
      Math.round((e.clientY - cr.top)  * scaleY),
    ];
  };

  const hitHandle = (mx: number, my: number): HandleKey | null => {
    if (!hasSelection) return null;
    const c      = canvasRef.current!;
    const cr     = c.getBoundingClientRect();
    const scale  = c.width / cr.width;
    const thresh = 18 * scale; // 18 CSS px hit area around each dot
    for (const key of ["topLeft","topRight","bottomRight","bottomLeft"] as HandleKey[]) {
      const [px, py] = pts[key];
      if (Math.hypot(mx - px, my - py) < thresh) return key;
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    const handle   = hitHandle(mx, my);
    if (handle) { setDragging(handle); return; }
    // Start new selection
    setHasSelection(false);
    setSelStart([mx, my]);
    setSelEnd([mx, my]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    if (dragging) {
      // ONLY this dot moves — all others stay fixed
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
      const x = Math.min(selStart[0], mx), y = Math.min(selStart[1], my);
      const w = Math.abs(mx - selStart[0]), h = Math.abs(my - selStart[1]);
      if (w > 8 && h > 8) {
        const newPts: CornerPoints = {
          topLeft:     [x,     y    ],
          topRight:    [x + w, y    ],
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
          Sleep over het logo om te plaatsen · versleep hoekpunten om bij te stellen
        </p>
      </div>
    </div>
  );
}
