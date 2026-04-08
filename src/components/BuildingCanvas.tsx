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
}

type HandleKey = keyof CornerPoints;

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

  // Update corners from parent (e.g. Claude AI)
  useEffect(() => {
    if (initialCorners) setCorners(initialCorners);
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

  // Convert SVG to Image (much more reliable than canvg)
  useEffect(() => {
    if (!designSvg) return;
    const blob = new Blob([designSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      setDesignImg(img);
    };
    img.onerror = () => {
      console.error("Failed to load SVG as image");
      // Try with data URL as fallback
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

    // Draw design overlay within corner bounds
    if (designImg) {
      ctx.save();

      // Calculate bounding box from corners
      const minX = Math.min(corners.topLeft[0], corners.bottomLeft[0]);
      const maxX = Math.max(corners.topRight[0], corners.bottomRight[0]);
      const minY = Math.min(corners.topLeft[1], corners.topRight[1]);
      const maxY = Math.max(corners.bottomLeft[1], corners.bottomRight[1]);
      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 0 && h > 0) {
        // Draw the SVG design stretched to fit the corner area with transparency
        ctx.globalAlpha = 0.85;
        ctx.drawImage(designImg, minX, minY, w, h);
        ctx.globalAlpha = 1.0;
      }

      ctx.restore();
    }

    // Draw corner handles
    const handleRadius = Math.max(8, Math.min(canvas.width, canvas.height) * 0.012);
    for (const [key, point] of Object.entries(corners)) {
      ctx.fillStyle = dragging === key ? "#2563eb" : "rgba(37, 99, 235, 0.8)";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(point[0], point[1], handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Draw dashed outline between corners
    ctx.strokeStyle = "rgba(37, 99, 235, 0.6)";
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
  }, [photo, designImg, corners, dragging]);

  useEffect(() => {
    render();
  }, [render]);

  // Mouse interaction for dragging handles
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

  const handleMouseDown = (e: React.MouseEvent) => {
    const [mx, my] = getCanvasPoint(e);
    const threshold = Math.max(20, Math.min(internalCanvasRef.current?.width || 800, internalCanvasRef.current?.height || 600) * 0.025);

    for (const [key, point] of Object.entries(corners) as [HandleKey, [number, number]][]) {
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

  const handleMouseUp = () => setDragging(null);

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
        className="w-full rounded-xl border border-gray-200 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
          Sleep de blauwe hoekpunten om het ontwerp te positioneren
        </p>
      </div>
    </div>
  );
}
