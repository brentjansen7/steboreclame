"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

// Store rect as 2 anchor points; other 2 are always derived
interface TwoPoint { tl: [number, number]; br: [number, number]; }
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

function toTwoPoint(c: CornerPoints): TwoPoint {
  const xs = [c.topLeft[0], c.topRight[0], c.bottomRight[0], c.bottomLeft[0]];
  const ys = [c.topLeft[1], c.topRight[1], c.bottomRight[1], c.bottomLeft[1]];
  return {
    tl: [Math.min(...xs), Math.min(...ys)],
    br: [Math.max(...xs), Math.max(...ys)],
  };
}

function toCorners(tp: TwoPoint): CornerPoints {
  const [x1, y1] = tp.tl;
  const [x2, y2] = tp.br;
  return {
    topLeft:     [x1, y1],
    topRight:    [x2, y1],
    bottomRight: [x2, y2],
    bottomLeft:  [x1, y2],
  };
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

  const [photo, setPhoto]           = useState<HTMLImageElement | null>(null);
  const [designImg, setDesignImg]   = useState<HTMLImageElement | null>(null);
  const [tp, setTp]                 = useState<TwoPoint | null>(null);
  const [dragging, setDragging]     = useState<HandleKey | null>(null);
  const [selStart, setSelStart]     = useState<[number, number] | null>(null);
  const [selEnd, setSelEnd]         = useState<[number, number] | null>(null);

  useEffect(() => {
    if (initialCorners) setTp(toTwoPoint(initialCorners));
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

    // Live drag preview
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

    if (!tp) return;

    const [x1, y1] = tp.tl;
    const [x2, y2] = tp.br;
    const w = x2 - x1, h = y2 - y1;
    if (w < 4 || h < 4) return;

    // Design — always fully visible in rectangle
    if (designImg) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(designImg, x1, y1, w, h);
      ctx.globalAlpha = 1;
    }

    // Dashed outline at exact rectangle edges
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth   = Math.max(2, canvas.width * 0.003);
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(x1, y1, w, h);
    ctx.setLineDash([]);

    // Dots — screen-size relative, at EXACT corners
    const cr = canvas.getBoundingClientRect();
    const scale = canvas.width / (cr.width || canvas.width);
    const r = Math.round(6 * scale);

    const corners: [HandleKey, number, number][] = [
      ["topLeft",     x1, y1],
      ["topRight",    x2, y1],
      ["bottomRight", x2, y2],
      ["bottomLeft",  x1, y2],
    ];

    for (const [key, px, py] of corners) {
      // White ring
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur  = r;
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      // Blue dot
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = dragging === key ? "#1e40af" : "#3b82f6";
      ctx.fill();
    }
  }, [photo, designImg, tp, dragging, selStart, selEnd]);

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
    if (!tp) return null;
    const c      = canvasRef.current!;
    const cr     = c.getBoundingClientRect();
    const scale  = c.width / cr.width;
    const thresh = 18 * scale;
    const [x1, y1] = tp.tl;
    const [x2, y2] = tp.br;
    const pts: [HandleKey, number, number][] = [
      ["topLeft",     x1, y1],
      ["topRight",    x2, y1],
      ["bottomRight", x2, y2],
      ["bottomLeft",  x1, y2],
    ];
    for (const [key, px, py] of pts) {
      if (Math.hypot(mx - px, my - py) < thresh) return key;
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    const handle = hitHandle(mx, my);
    if (handle) { setDragging(handle); return; }
    setTp(null);
    setSelStart([mx, my]);
    setSelEnd([mx, my]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    if (dragging && tp) {
      // Each corner only changes its own X and Y — opposite corner stays fixed
      let newTp = { ...tp };
      if (dragging === "topLeft")     newTp = { tl: [mx, my],        br: tp.br };
      if (dragging === "topRight")    newTp = { tl: [tp.tl[0], my],  br: [mx, tp.br[1]] };
      if (dragging === "bottomRight") newTp = { tl: tp.tl,            br: [mx, my] };
      if (dragging === "bottomLeft")  newTp = { tl: [mx, tp.tl[1]],  br: [tp.br[0], my] };
      setTp(newTp);
      onCornersChange(toCorners(newTp));
      return;
    }
    if (selStart) setSelEnd([mx, my]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (selStart) {
      const [mx, my] = toCanvas(e);
      const newTp: TwoPoint = {
        tl: [Math.min(selStart[0], mx), Math.min(selStart[1], my)],
        br: [Math.max(selStart[0], mx), Math.max(selStart[1], my)],
      };
      if ((newTp.br[0] - newTp.tl[0]) > 8 && (newTp.br[1] - newTp.tl[1]) > 8) {
        setTp(newTp);
        onCornersChange(toCorners(newTp));
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
