"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

interface Rect { x: number; y: number; w: number; h: number; }
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

function rectToCorners(r: Rect): CornerPoints {
  return {
    topLeft:     [r.x,       r.y      ],
    topRight:    [r.x + r.w, r.y      ],
    bottomRight: [r.x + r.w, r.y + r.h],
    bottomLeft:  [r.x,       r.y + r.h],
  };
}

function cornersToRect(c: CornerPoints): Rect {
  const xs = [c.topLeft[0], c.topRight[0], c.bottomRight[0], c.bottomLeft[0]];
  const ys = [c.topLeft[1], c.topRight[1], c.bottomRight[1], c.bottomLeft[1]];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  return { x, y, w, h };
}

export default function BuildingCanvas({
  buildingPhotoUrl,
  designSvg,
  onCornersChange,
  onExport,
  setCanvasRef,
  initialCorners,
}: BuildingCanvasProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const callbackRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      internalCanvasRef.current = node;
      if (setCanvasRef) setCanvasRef(node);
    },
    [setCanvasRef]
  );

  const [photo, setPhoto]       = useState<HTMLImageElement | null>(null);
  const [designImg, setDesignImg] = useState<HTMLImageElement | null>(null);
  const [rect, setRect]         = useState<Rect | null>(null);
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [liveEnd, setLiveEnd]   = useState<[number, number] | null>(null); // for new selection preview

  // Sync from parent (AI placement) → always normalize to rect
  useEffect(() => {
    if (initialCorners) setRect(cornersToRect(initialCorners));
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
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => setDesignImg(img);
    img.onerror = () => {
      const enc = btoa(unescape(encodeURIComponent(designSvg)));
      const img2 = new Image();
      img2.onload = () => setDesignImg(img2);
      img2.src = `data:image/svg+xml;base64,${enc}`;
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [designSvg]);

  const render = useCallback(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    ctx.drawImage(photo, 0, 0);

    // Compute display rect (either confirmed rect or live drag preview)
    let displayRect: Rect | null = rect;
    if (dragStart && liveEnd) {
      displayRect = {
        x: Math.min(dragStart[0], liveEnd[0]),
        y: Math.min(dragStart[1], liveEnd[1]),
        w: Math.abs(liveEnd[0] - dragStart[0]),
        h: Math.abs(liveEnd[1] - dragStart[1]),
      };
    }

    if (!displayRect || displayRect.w < 4 || displayRect.h < 4) return;
    const { x, y, w, h } = displayRect;

    // Design overlay
    if (designImg && !liveEnd) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(designImg, x, y, w, h);
      ctx.globalAlpha = 1;
    }

    // Selection rectangle
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth   = Math.max(2, canvas.width * 0.003);
    if (liveEnd) {
      // Drawing new selection — fill + dashed
      ctx.fillStyle = "rgba(37,99,235,0.12)";
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([12, 6]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    if (liveEnd) return; // no handles while drawing

    // Handles — small filled circles at exact corners
    const r = Math.max(8, Math.min(canvas.width, canvas.height) * 0.014);
    const pts: [number, number][] = [
      [x,     y    ],
      [x + w, y    ],
      [x + w, y + h],
      [x,     y + h],
    ];
    const keys: HandleKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

    for (let i = 0; i < 4; i++) {
      const [px, py] = pts[i];
      const active = dragging === keys[i];

      // drop shadow
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur  = r;

      // white border
      ctx.beginPath();
      ctx.arc(px, py, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();

      // blue fill
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = active ? "#1e40af" : "#3b82f6";
      ctx.fill();
    }
  }, [photo, designImg, rect, dragging, dragStart, liveEnd]);

  useEffect(() => { render(); }, [render]);

  const toCanvas = (e: React.MouseEvent): [number, number] => {
    const canvas = internalCanvasRef.current!;
    const cr = canvas.getBoundingClientRect();
    const sx = canvas.width  / cr.width;
    const sy = canvas.height / cr.height;
    return [(e.clientX - cr.left) * sx, (e.clientY - cr.top) * sy];
  };

  const hitHandle = (mx: number, my: number): HandleKey | null => {
    if (!rect) return null;
    const canvas = internalCanvasRef.current!;
    const thresh = Math.max(24, Math.min(canvas.width, canvas.height) * 0.04);
    const { x, y, w, h } = rect;
    const pts: [HandleKey, number, number][] = [
      ["topLeft",     x,     y    ],
      ["topRight",    x + w, y    ],
      ["bottomRight", x + w, y + h],
      ["bottomLeft",  x,     y + h],
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
    // Start new selection
    setRect(null);
    setDragStart([mx, my]);
    setLiveEnd([mx, my]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const [mx, my] = toCanvas(e);
    if (dragging && rect) {
      // Move that specific corner → update rect
      const { x, y, w, h } = rect;
      let nx = x, ny = y, nw = w, nh = h;
      if (dragging === "topLeft")     { nw = (x + w) - mx; nh = (y + h) - my; nx = mx; ny = my; }
      if (dragging === "topRight")    { nw = mx - x;       nh = (y + h) - my;           ny = my; }
      if (dragging === "bottomRight") { nw = mx - x;       nh = my - y; }
      if (dragging === "bottomLeft")  { nw = (x + w) - mx; nh = my - y; nx = mx; }
      if (nw > 4 && nh > 4) {
        const nr = { x: nx, y: ny, w: nw, h: nh };
        setRect(nr);
        onCornersChange(rectToCorners(nr));
      }
      return;
    }
    if (dragStart) setLiveEnd([mx, my]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (dragStart && liveEnd) {
      const [mx, my] = toCanvas(e);
      const nr: Rect = {
        x: Math.min(dragStart[0], mx),
        y: Math.min(dragStart[1], my),
        w: Math.abs(mx - dragStart[0]),
        h: Math.abs(my - dragStart[1]),
      };
      if (nr.w > 8 && nr.h > 8) {
        setRect(nr);
        onCornersChange(rectToCorners(nr));
      }
    }
    setDragStart(null);
    setLiveEnd(null);
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
        style={{ cursor: dragging ? "nwse-resize" : "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => { if (internalCanvasRef.current) onExport(internalCanvasRef.current); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <p className="text-sm text-gray-500 self-center">
          Sleep over het logo → sleep hoekpunten om bij te stellen
        </p>
      </div>
    </div>
  );
}
