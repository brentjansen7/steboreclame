"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

type HandleKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

interface Props {
  buildingPhotoUrl: string | null;
  designSvg: string | null;
  onCornersChange: (corners: CornerPoints) => void;
  onExport: (canvas: HTMLCanvasElement) => void;
  setCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
  initialCorners?: CornerPoints | null;
  clickToPlace?: boolean;
}

const MAX_CANVAS = 1200; // render resolution — big enough to look good
const MAX_SRC    = 600;  // source canvas max — limits pixel loop work

// ─── Homography solver ────────────────────────────────────────────────────────
// Returns h[0..7] where for a dst point (dx,dy):
//   srcX = (h0*dx + h1*dy + h2) / (h6*dx + h7*dy + 1)
//   srcY = (h3*dx + h4*dy + h5) / (h6*dx + h7*dy + 1)
function solveHomography(
  dst: [[number,number],[number,number],[number,number],[number,number]],
  src: [[number,number],[number,number],[number,number],[number,number]],
): Float64Array {
  const A: Float64Array[] = Array.from({length: 8}, () => new Float64Array(8));
  const b = new Float64Array(8);
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = dst[i]; const [sx, sy] = src[i];
    A[2*i  ].set([dx, dy, 1, 0, 0, 0, -sx*dx, -sx*dy]); b[2*i]   = sx;
    A[2*i+1].set([0, 0, 0, dx, dy, 1, -sy*dx, -sy*dy]); b[2*i+1] = sy;
  }
  // Gauss-Jordan elimination
  for (let col = 0; col < 8; col++) {
    let maxRow = col;
    for (let row = col+1; row < 8; row++)
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    [A[col], A[maxRow]] = [A[maxRow], A[col]];
    [b[col], b[maxRow]] = [b[maxRow], b[col]];
    const p = A[col][col];
    if (Math.abs(p) < 1e-12) continue;
    for (let k = 0; k < 8; k++) A[col][k] /= p;
    b[col] /= p;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const f = A[row][col]; if (!f) continue;
      for (let k = 0; k < 8; k++) A[row][k] -= f * A[col][k];
      b[row] -= f * b[col];
    }
  }
  return b;
}

// ─── Perspective-correct pixel warp ──────────────────────────────────────────
function drawPerspective(
  ctx: CanvasRenderingContext2D,
  srcCanvas: HTMLCanvasElement,
  srcData: ImageData,
  tl: [number,number], tr: [number,number],
  br: [number,number], bl: [number,number],
) {
  const W = srcCanvas.width, H = srcCanvas.height;
  if (!W || !H) return;
  const cW = ctx.canvas.width, cH = ctx.canvas.height;

  // Destination bounding box (clamp to canvas)
  const x0 = Math.max(0, Math.floor(Math.min(tl[0],tr[0],br[0],bl[0])));
  const x1 = Math.min(cW, Math.ceil (Math.max(tl[0],tr[0],br[0],bl[0])));
  const y0 = Math.max(0, Math.floor(Math.min(tl[1],tr[1],br[1],bl[1])));
  const y1 = Math.min(cH, Math.ceil (Math.max(tl[1],tr[1],br[1],bl[1])));
  if (x1 <= x0 || y1 <= y0) return;

  // Inverse homography: for each canvas pixel → source pixel
  const h = solveHomography(
    [tl, tr, br, bl],
    [[0,0],[W,0],[W,H],[0,H]],
  );

  const dW = x1 - x0, dH = y1 - y0;
  const dstImg = ctx.getImageData(x0, y0, dW, dH);
  const dst = dstImg.data;
  const sdata = srcData.data;

  for (let py = 0; py < dH; py++) {
    const cy = y0 + py + 0.5;
    for (let px = 0; px < dW; px++) {
      const cx = x0 + px + 0.5;
      const hw  = h[6]*cx + h[7]*cy + 1;
      if (Math.abs(hw) < 1e-9) continue;
      const sx = (h[0]*cx + h[1]*cy + h[2]) / hw;
      const sy = (h[3]*cx + h[4]*cy + h[5]) / hw;
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;

      // Bilinear sample
      const ix0 = sx | 0, iy0 = sy | 0;
      const ix1 = ix0 < W-1 ? ix0+1 : ix0;
      const iy1 = iy0 < H-1 ? iy0+1 : iy0;
      const fx = sx-ix0, fy = sy-iy0;
      const w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy;
      const i00=(iy0*W+ix0)*4, i10=(iy0*W+ix1)*4;
      const i01=(iy1*W+ix0)*4, i11=(iy1*W+ix1)*4;
      const di=(py*dW+px)*4;
      dst[di  ] = w00*sdata[i00  ]+w10*sdata[i10  ]+w01*sdata[i01  ]+w11*sdata[i11  ];
      dst[di+1] = w00*sdata[i00+1]+w10*sdata[i10+1]+w01*sdata[i01+1]+w11*sdata[i11+1];
      dst[di+2] = w00*sdata[i00+2]+w10*sdata[i10+2]+w01*sdata[i01+2]+w11*sdata[i11+2];
      dst[di+3] = 255; // fully opaque — no building bleed-through
    }
  }

  ctx.putImageData(dstImg, x0, y0);
}

// ─── SVG → opaque canvas ─────────────────────────────────────────────────────
function loadSvgToCanvas(svgStr: string, maxPx: number): Promise<HTMLCanvasElement> {
  // Extract intrinsic size via regex (DOMParser unreliable for blob URLs)
  const wm = svgStr.match(/\bwidth\s*=\s*["']\s*([0-9.]+)/);
  const hm = svgStr.match(/\bheight\s*=\s*["']\s*([0-9.]+)/);
  const vm = svgStr.match(/\bviewBox\s*=\s*["'][^"']*?([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)/);
  let svgW = wm ? parseFloat(wm[1]) : 0;
  let svgH = hm ? parseFloat(hm[1]) : 0;
  if ((!svgW || !svgH) && vm) { svgW = parseFloat(vm[3]); svgH = parseFloat(vm[4]); }
  if (!svgW || svgW < 1) svgW = 800;
  if (!svgH || svgH < 1) svgH = 600;

  // Force explicit width+height on the <svg> tag
  let modified = svgStr.replace(
    /(<svg\b)((?:[^>](?!width\s*=))*?)>/,
    (_m, tag, rest) => `${tag}${rest} width="${svgW}" height="${svgH}">`,
  );
  // Simpler fallback: if the regex didn't match, just prepend attributes
  if (!modified.includes(`width="${svgW}"`)) {
    modified = svgStr.replace("<svg", `<svg width="${svgW}" height="${svgH}"`);
  }

  const scale = Math.min(1, maxPx / Math.max(svgW, svgH));
  const cW = Math.max(1, Math.round(svgW * scale));
  const cH = Math.max(1, Math.round(svgH * scale));

  return new Promise((resolve) => {
    const blob = new Blob([modified], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = cW; c.height = cH;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "white";
      cx.fillRect(0, 0, cW, cH);
      cx.drawImage(img, 0, 0, cW, cH);
      resolve(c);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fallback: plain white canvas (still shows no building)
      const c = document.createElement("canvas");
      c.width = 200; c.height = 100;
      const cx = c.getContext("2d")!;
      cx.fillStyle = "#ddd";
      cx.fillRect(0, 0, 200, 100);
      cx.fillStyle = "#999";
      cx.font = "14px sans-serif";
      cx.fillText("SVG laad fout", 20, 55);
      resolve(c);
    };
    img.src = url;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
const DEFAULT_PTS: CornerPoints = {
  topLeft: [100,100], topRight: [300,100],
  bottomRight: [300,250], bottomLeft: [100,250],
};

export default function BuildingCanvas({
  buildingPhotoUrl, designSvg,
  onCornersChange, onExport, setCanvasRef, initialCorners,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null); // opaque design
  const srcDataRef   = useRef<ImageData | null>(null);         // cached pixels

  const callbackRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    if (setCanvasRef) setCanvasRef(node);
  }, [setCanvasRef]);

  const [photo,        setPhoto]        = useState<HTMLImageElement | null>(null);
  const [pts,          setPts]          = useState<CornerPoints>(DEFAULT_PTS);
  const [hasSelection, setHasSelection] = useState(false);
  const [dragging,     setDragging]     = useState<HandleKey | null>(null);
  const [selStart,     setSelStart]     = useState<[number,number] | null>(null);
  const [selEnd,       setSelEnd]       = useState<[number,number] | null>(null);

  useEffect(() => {
    if (initialCorners) { setPts(initialCorners); setHasSelection(true); }
  }, [initialCorners]);

  // Load building photo
  useEffect(() => {
    if (!buildingPhotoUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPhoto(img);
    img.src = buildingPhotoUrl;
  }, [buildingPhotoUrl]);

  // Load & rasterise design SVG → opaque canvas
  useEffect(() => {
    if (!designSvg) return;
    loadSvgToCanvas(designSvg, MAX_SRC).then((c) => {
      srcCanvasRef.current = c;
      srcDataRef.current   = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    });
  }, [designSvg]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d")!;

    // Scale canvas to max MAX_CANVAS px wide
    const ratio = Math.min(1, MAX_CANVAS / photo.naturalWidth);
    canvas.width  = Math.round(photo.naturalWidth  * ratio);
    canvas.height = Math.round(photo.naturalHeight * ratio);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    // Selection preview
    if (selStart && selEnd) {
      const x = Math.min(selStart[0],selEnd[0]), y = Math.min(selStart[1],selEnd[1]);
      const w = Math.abs(selEnd[0]-selStart[0]), h = Math.abs(selEnd[1]-selStart[1]);
      ctx.fillStyle   = "rgba(37,99,235,0.12)";
      ctx.fillRect(x,y,w,h);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth   = Math.max(2, canvas.width*0.003);
      ctx.setLineDash([12,6]);
      ctx.strokeRect(x,y,w,h);
      ctx.setLineDash([]);
      return;
    }

    if (!hasSelection) return;

    // Pixel-correct warp
    if (srcCanvasRef.current && srcDataRef.current) {
      drawPerspective(ctx, srcCanvasRef.current, srcDataRef.current,
        pts.topLeft, pts.topRight, pts.bottomRight, pts.bottomLeft);
    }

    // Border
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth   = Math.max(2, canvas.width*0.003);
    ctx.setLineDash([10,5]);
    ctx.beginPath();
    ctx.moveTo(pts.topLeft[0],    pts.topLeft[1]);
    ctx.lineTo(pts.topRight[0],   pts.topRight[1]);
    ctx.lineTo(pts.bottomRight[0],pts.bottomRight[1]);
    ctx.lineTo(pts.bottomLeft[0], pts.bottomLeft[1]);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner handles
    const cr    = canvas.getBoundingClientRect();
    const scale = canvas.width / (cr.width || canvas.width);
    const r     = Math.round(6 * scale);
    const handles: [HandleKey,number,number][] = [
      ["topLeft",    pts.topLeft[0],    pts.topLeft[1]],
      ["topRight",   pts.topRight[0],   pts.topRight[1]],
      ["bottomRight",pts.bottomRight[0],pts.bottomRight[1]],
      ["bottomLeft", pts.bottomLeft[0], pts.bottomLeft[1]],
    ];
    for (const [key,px,py] of handles) {
      ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = r;
      ctx.beginPath(); ctx.arc(px,py,r+2,0,Math.PI*2);
      ctx.fillStyle = "white"; ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
      ctx.fillStyle = dragging === key ? "#1e40af" : "#3b82f6"; ctx.fill();
    }
  }, [photo, pts, hasSelection, dragging, selStart, selEnd]);

  useEffect(() => { render(); }, [render]);

  // Also re-render when srcData is ready
  useEffect(() => {
    if (!designSvg) return;
    loadSvgToCanvas(designSvg, MAX_SRC).then((c) => {
      srcCanvasRef.current = c;
      srcDataRef.current   = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      render();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designSvg]);

  const toCanvas = (e: React.MouseEvent): [number,number] => {
    const c = canvasRef.current!;
    const cr = c.getBoundingClientRect();
    return [
      Math.round((e.clientX-cr.left)*(c.width /cr.width)),
      Math.round((e.clientY-cr.top) *(c.height/cr.height)),
    ];
  };

  const hitHandle = (mx: number, my: number): HandleKey | null => {
    if (!hasSelection) return null;
    const c = canvasRef.current!;
    const cr = c.getBoundingClientRect();
    const thresh = 18 * (c.width / cr.width);
    for (const key of ["topLeft","topRight","bottomRight","bottomLeft"] as HandleKey[]) {
      const [px,py] = pts[key];
      if (Math.hypot(mx-px, my-py) < thresh) return key;
    }
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const [mx,my] = toCanvas(e);
    const handle = hitHandle(mx,my);
    if (handle) { setDragging(handle); return; }
    setHasSelection(false);
    setSelStart([mx,my]); setSelEnd([mx,my]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const [mx,my] = toCanvas(e);
    if (dragging) {
      const up = { ...pts, [dragging]: [mx,my] as [number,number] };
      setPts(up); onCornersChange(up); return;
    }
    if (selStart) setSelEnd([mx,my]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (selStart) {
      const [mx,my] = toCanvas(e);
      if (Math.abs(mx-selStart[0])>8 && Math.abs(my-selStart[1])>8) {
        const x=Math.min(selStart[0],mx), y=Math.min(selStart[1],my);
        const w=Math.abs(mx-selStart[0]),  h=Math.abs(my-selStart[1]);
        const np: CornerPoints = {
          topLeft:[x,y], topRight:[x+w,y],
          bottomRight:[x+w,y+h], bottomLeft:[x,y+h],
        };
        setPts(np); onCornersChange(np); setHasSelection(true);
      }
    }
    setSelStart(null); setSelEnd(null); setDragging(null);
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
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || !photo) return;
            // Render clean copy without handles/border
            const exp = document.createElement("canvas");
            exp.width = canvas.width; exp.height = canvas.height;
            const ctx = exp.getContext("2d")!;
            ctx.drawImage(photo, 0, 0, exp.width, exp.height);
            if (srcCanvasRef.current && srcDataRef.current && hasSelection) {
              drawPerspective(ctx, srcCanvasRef.current, srcDataRef.current,
                pts.topLeft, pts.topRight, pts.bottomRight, pts.bottomLeft);
            }
            onExport(exp);
          }}
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
