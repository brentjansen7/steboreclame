"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

interface BuildingCanvasProps {
  buildingPhotoUrl: string | null;
  designSvg: string | null;
  onCornersChange: (corners: CornerPoints) => void;
  onExport: (canvas: HTMLCanvasElement) => void;
  canvasRef?: HTMLCanvasElement | null;
  setCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
}

type HandleKey = keyof CornerPoints;

export default function BuildingCanvas({
  buildingPhotoUrl,
  designSvg,
  onCornersChange,
  onExport,
  canvasRef: externalCanvasRef,
  setCanvasRef,
}: BuildingCanvasProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalCanvasRef ? { current: externalCanvasRef } : internalCanvasRef;

  useEffect(() => {
    if (canvasRef.current && setCanvasRef) {
      setCanvasRef(canvasRef.current);
    }
  }, [setCanvasRef, canvasRef]);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<CornerPoints>({
    topLeft: [100, 100],
    topRight: [400, 100],
    bottomRight: [400, 300],
    bottomLeft: [100, 300],
  });
  const [dragging, setDragging] = useState<HandleKey | null>(null);
  const [designCanvas, setDesignCanvas] = useState<HTMLCanvasElement | null>(
    null
  );

  // Load building photo
  useEffect(() => {
    if (!buildingPhotoUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPhoto(img);
    img.src = buildingPhotoUrl;
  }, [buildingPhotoUrl]);

  // Rasterize SVG design
  useEffect(() => {
    if (!designSvg) return;
    async function rasterize() {
      const { rasterizeSvg } = await import("@/lib/perspectiveEngine");
      const canvas = await rasterizeSvg(designSvg!, 800, 400);
      setDesignCanvas(canvas);
    }
    rasterize();
  }, [designSvg]);

  // Render canvas
  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;

    const ctx = canvas.getContext("2d")!;
    canvas.width = photo.naturalWidth;
    canvas.height = photo.naturalHeight;

    // Draw photo
    ctx.drawImage(photo, 0, 0);

    // Draw design with perspective if available
    if (designCanvas) {
      try {
        const { drawPerspective } = await import("@/lib/perspectiveEngine");
        await drawPerspective(canvas, photo, designCanvas, corners);
      } catch {
        // Fallback: draw without perspective
        ctx.globalAlpha = 0.7;
        ctx.drawImage(
          designCanvas,
          corners.topLeft[0],
          corners.topLeft[1],
          corners.topRight[0] - corners.topLeft[0],
          corners.bottomLeft[1] - corners.topLeft[1]
        );
        ctx.globalAlpha = 1;
      }
    }

    // Draw corner handles
    const handleSize = 12;
    for (const [key, point] of Object.entries(corners)) {
      ctx.fillStyle =
        dragging === key ? "#2563eb" : "rgba(37, 99, 235, 0.8)";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point[0], point[1], handleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw outline between corners
    ctx.strokeStyle = "rgba(37, 99, 235, 0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(corners.topLeft[0], corners.topLeft[1]);
    ctx.lineTo(corners.topRight[0], corners.topRight[1]);
    ctx.lineTo(corners.bottomRight[0], corners.bottomRight[1]);
    ctx.lineTo(corners.bottomLeft[0], corners.bottomLeft[1]);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }, [photo, designCanvas, corners, dragging]);

  useEffect(() => {
    render();
  }, [render]);

  // Mouse interaction for dragging handles
  const getCanvasPoint = (
    e: React.MouseEvent
  ): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const [mx, my] = getCanvasPoint(e);
    const threshold = 20;

    for (const [key, point] of Object.entries(corners) as [
      HandleKey,
      [number, number],
    ][]) {
      const dist = Math.sqrt((mx - point[0]) ** 2 + (my - point[1]) ** 2);
      if (dist < threshold) {
        setDragging(key);
        return;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const [mx, my] = getCanvasPoint(e);
    setCorners((prev) => {
      const updated = { ...prev, [dragging]: [mx, my] as [number, number] };
      onCornersChange(updated);
      return updated;
    });
  };

  const handleMouseUp = () => {
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
        ref={canvasRef}
        className="w-full rounded-xl border border-gray-200 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => {
            if (canvasRef.current) onExport(canvasRef.current);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <p className="text-sm text-gray-500 self-center">
          Sleep de blauwe hoekpunten om het ontwerp te positioneren
        </p>
      </div>
    </div>
  );
}
