"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

interface BuildingCanvasProps {
  buildingPhotoUrl: string | null;
  designSvg: string | null;
  onCornersChange: (corners: CornerPoints) => void;
  onExport: (canvas: HTMLCanvasElement) => void;
  setCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
  initialCorners?: CornerPoints | null;
  clickToPlace?: boolean;
}

type HandleKey = keyof CornerPoints;

export default function BuildingCanvas({
  buildingPhotoUrl,
  designSvg,
  onCornersChange,
  onExport,
  setCanvasRef,
  initialCorners,
  clickToPlace,
}: BuildingCanvasProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const callbackRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      internalCanvasRef.current = node;
      if (setCanvasRef) setCanvasRef(node);
    },
    [setCanvasRef]
  );

  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [designImg, setDesignImg] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<CornerPoints>(
    initialCorners || {
      topLeft: [100, 100],
      topRight: [400, 100],
      bottomRight: [400, 300],
      bottomLeft: [100, 300],
    }
  );
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  const [selectStart, setSelectStart] = useState<[number, number] | null>(null);
  const [selectCurrent, setSelectCurrent] = useState<[number, number] | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  // Update corners from parent (e.g. Claude AI)
  useEffect(() => {
    if (initialCorners) {
      setCorners(initialCorners);
      setHasSelection(true);
    }
  }, [initialCorners]);

  // Load building photo
  useEffect(() => {
    if (!buildingPhotoUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPhoto(img);
    img.onerror = () => console.error("Failed to load photo");
    img.src = buildingPhotoUrl;
  }, [buildingPhotoUrl]);

  // Convert SVG to Image
  useEffect(() => {
    if (!designSvg) return;
    const blob = new Blob([designSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => setDesignImg(img);
    img.onerror = () => {
      const encoded = btoa(unescape(encodeURIComponent(designSvg)));
      const dataUrl = `data:image/svg+xml;base64,${encoded}`;
      const img2 = new Image();
      img2.onload = () => setDesignImg(img2);
      img2.src = dataUrl;
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [designSvg]);

  // Render canvas
  const render = useCallback(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas || !photo) return;

    const ctx = canvas.getContext("2d")!;
    canvas.width = photo.naturalWidth;
    canvas.height = photo.naturalHeight;

    // Draw building photo
    ctx.drawImage(photo, 0, 0);

    // Draw design overlay if we have a selection
    if (designImg && hasSelection) {
      const minX = Math.min(corners.topLeft[0], corners.bottomLeft[0]);
      const maxX = Math.max(corners.topRight[0], corners.bottomRight[0]);
      const minY = Math.min(corners.topLeft[1], corners.topRight[1]);
      const maxY = Math.max(corners.bottomLeft[1], corners.bottomRight[1]);
      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 5 && h > 5) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(designImg, minX, minY, w, h);
        ctx.globalAlpha = 1.0;
      }
    }

    // Draw live selection rectangle while dragging
    if (selectStart && selectCurrent) {
      const [sx, sy] = selectStart;
      const [cx, cy] = selectCurrent;
      const rx = Math.min(sx, cx);
      const ry = Math.min(sy, cy);
      const rw = Math.abs(cx - sx);
      const rh = Math.abs(cy - sy);

      ctx.fillStyle = "rgba(37, 99, 235, 0.15)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = Math.max(2, canvas.width * 0.003);
      ctx.setLineDash([12, 6]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      return; // Don't draw handles while selecting
    }

    if (!hasSelection) return;

    // Draw rectangle outline between corners
    ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
    ctx.lineWidth = Math.max(2, canvas.width * 0.003);
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(corners.topLeft[0], corners.topLeft[1]);
    ctx.lineTo(corners.topRight[0], corners.topRight[1]);
    ctx.lineTo(corners.bottomRight[0], corners.bottomRight[1]);
    ctx.lineTo(corners.bottomLeft[0], corners.bottomLeft[1]);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw corner handles
    const r = Math.max(16, Math.min(canvas.width, canvas.height) * 0.025);
    const handleOrder: [HandleKey, string][] = [
      ["topLeft", "↖"],
      ["topRight", "↗"],
      ["bottomRight", "↘"],
      ["bottomLeft", "↙"],
    ];

    for (const [key] of handleOrder) {
      const [px, py] = corners[key];
      const isActive = dragging === key;

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = r * 0.6;

      // White outer ring
      ctx.beginPath();
      ctx.arc(px, py, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();

      // Blue fill
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#1d4ed8" : "#3b82f6";
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      // Cross marker inside
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(2, r * 0.15);
      const c = r * 0.45;
      ctx.beginPath();
      ctx.moveTo(px - c, py); ctx.lineTo(px + c, py);
      ctx.moveTo(px, py - c); ctx.lineTo(px, py + c);
      ctx.stroke();
    }
  }, [photo, designImg, corners, dragging, selectStart, selectCurrent, hasSelection]);

  useEffect(() => {
    render();
  }, [render]);

  const getCanvasPoint = (e: React.MouseEvent): [number, number] => {
    const canvas = internalCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ];
  };

  const findHandle = (mx: number, my: number): HandleKey | null => {
    if (!hasSelection) return null;
    const canvas = internalCanvasRef.current!;
    const threshold = Math.max(30, Math.min(canvas.width, canvas.height) * 0.05);
    for (const [key, point] of Object.entries(corners) as [HandleKey, [number, number]][]) {
      const dist = Math.sqrt((mx - point[0]) ** 2 + (my - point[1]) ** 2);
      if (dist < threshold) return key;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const [mx, my] = getCanvasPoint(e);
    const handle = findHandle(mx, my);
    if (handle) {
      setDragging(handle);
      return;
    }
    // Start new selection
    setSelectStart([mx, my]);
    setSelectCurrent([mx, my]);
    setHasSelection(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const [mx, my] = getCanvasPoint(e);

    if (dragging) {
      const updated = { ...corners, [dragging]: [mx, my] as [number, number] };
      setCorners(updated);
      onCornersChange(updated);
      return;
    }

    if (selectStart) {
      setSelectCurrent([mx, my]);
    }
  };

  const finishInteraction = (e: React.MouseEvent) => {
    if (selectStart) {
      const [mx, my] = getCanvasPoint(e);
      const [sx, sy] = selectStart;
      if (Math.abs(mx - sx) > 8 && Math.abs(my - sy) > 8) {
        const newCorners: CornerPoints = {
          topLeft: [Math.min(sx, mx), Math.min(sy, my)],
          topRight: [Math.max(sx, mx), Math.min(sy, my)],
          bottomRight: [Math.max(sx, mx), Math.max(sy, my)],
          bottomLeft: [Math.min(sx, mx), Math.max(sy, my)],
        };
        setCorners(newCorners);
        onCornersChange(newCorners);
        setHasSelection(true);
      }
    }
    setSelectStart(null);
    setSelectCurrent(null);
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
        style={{ cursor: dragging ? "grabbing" : selectStart ? "crosshair" : "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishInteraction}
        onMouseLeave={finishInteraction}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => {
            if (internalCanvasRef.current) onExport(internalCanvasRef.current);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <p className="text-sm text-gray-500 self-center">
          Sleep over het logo om het ontwerp te plaatsen
        </p>
      </div>
    </div>
  );
}
