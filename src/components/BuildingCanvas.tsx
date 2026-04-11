"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

type P2 = [number, number];
type CornerKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
type MidKey    = "midTop"  | "midRight"  | "midBottom"  | "midLeft";
type HandleKey = CornerKey | MidKey;
interface MidPoints { midTop:P2; midRight:P2; midBottom:P2; midLeft:P2; }

interface Props {
  buildingPhotoUrl: string | null;
  designSvg: string | null;
  onCornersChange: (corners: CornerPoints) => void;
  onExport: (canvas: HTMLCanvasElement) => void;
  setCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
  initialCorners?: CornerPoints | null;
  clickToPlace?: boolean;
}

const MAX_CANVAS = 1200;
const SRC_SIZE   = 400; // offscreen canvas resolution

// ─── Bezier helpers ──────────────────────────────────────────────────────────
const lerp = (a:P2, b:P2, t:number):P2 => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
const qbez = (a:P2, m:P2, b:P2, t:number):P2 => lerp(lerp(a,m,t), lerp(m,b,t), t);

// ─── Affine triangle (clip+transform, no getImageData) ───────────────────────
function blitTriangle(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  sx0:number, sy0:number, dx0:number, dy0:number,
  sx1:number, sy1:number, dx1:number, dy1:number,
  sx2:number, sy2:number, dx2:number, dy2:number,
) {
  const det = (sx1-sx0)*(sy2-sy0) - (sx2-sx0)*(sy1-sy0);
  if (Math.abs(det) < 1e-6) return;

  // Affine from src→dst
  const a = ((dx1-dx0)*(sy2-sy0) - (dx2-dx0)*(sy1-sy0)) / det;
  const b = ((dy1-dy0)*(sy2-sy0) - (dy2-dy0)*(sy1-sy0)) / det;
  const c = ((dx2-dx0)*(sx1-sx0) - (dx1-dx0)*(sx2-sx0)) / det;
  const d = ((dy2-dy0)*(sx1-sx0) - (dy1-dy0)*(sx2-sx0)) / det;
  const e = dx0 - a*sx0 - c*sy0;
  const f = dy0 - b*sx0 - d*sy0;

  // Expand clip 1.5px from centroid to seal sub-pixel seams
  const cx = (dx0+dx1+dx2)/3, cy = (dy0+dy1+dy2)/3;
  const exp = (x:number, y:number):P2 => {
    const vx=x-cx, vy=y-cy, l=Math.hypot(vx,vy)||1;
    return [x + vx/l*1.5, y + vy/l*1.5];
  };

  ctx.save();
  ctx.beginPath();
  const [ax,ay]=exp(dx0,dy0), [bx,by]=exp(dx1,dy1), [ccx,ccy]=exp(dx2,dy2);
  ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(ccx,ccy);
  ctx.closePath(); ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

// ─── Warp src quad onto ctx using DESTINATION-SPACE scanlines ────────────────
// Iterating destination rows guarantees every dst pixel is covered.
function warpOnto(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  tl:P2, tr:P2, br:P2, bl:P2,
  mt:P2, mr:P2, mb:P2, ml:P2,
) {
  const sW = src.width, sH = src.height;
  if (!sW || !sH) return;

  // Number of strips = length of the longest vertical edge in destination space
  const leftLen  = Math.hypot(tl[0]-bl[0], tl[1]-bl[1]);
  const rightLen = Math.hypot(tr[0]-br[0], tr[1]-br[1]);
  const N = Math.max(Math.ceil(Math.max(leftLen, rightLen)), 100);

  for (let i = 0; i < N; i++) {
    const v0 = i / N, v1 = (i+1) / N;
    // Source y for this strip (in src pixel space)
    const sy0 = v0 * sH, sy1 = v1 * sH;
    // Destination corners via bezier edges
    const L0 = qbez(tl, ml, bl, v0);
    const R0 = qbez(tr, mr, br, v0);
    const L1 = qbez(tl, ml, bl, v1);
    const R1 = qbez(tr, mr, br, v1);

    blitTriangle(ctx, src,
      0,  sy0, L0[0],L0[1],
      sW, sy0, R0[0],R0[1],
      0,  sy1, L1[0],L1[1]);
    blitTriangle(ctx, src,
      sW, sy0, R0[0],R0[1],
      sW, sy1, R1[0],R1[1],
      0,  sy1, L1[0],L1[1]);
  }
}

// ─── Build opaque src canvas from SVG (blob URL → same-origin, no CORS) ──────
function svgToCanvas(svgStr: string, maxPx: number): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    // Extract dimensions
    const wm = svgStr.match(/\bwidth\s*=\s*["']?\s*([0-9.]+)/);
    const hm = svgStr.match(/\bheight\s*=\s*["']?\s*([0-9.]+)/);
    const vm = svgStr.match(/viewBox\s*=\s*["']([^"']*)["']/);
    let W = wm ? parseFloat(wm[1]) : 0;
    let H = hm ? parseFloat(hm[1]) : 0;
    if ((!W || !H) && vm) {
      const parts = vm[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4) { W = parts[2]; H = parts[3]; }
    }
    if (!W || W < 1) W = 800;
    if (!H || H < 1) H = 600;

    // Inject explicit size so browser renders at correct dimensions
    // Remove any existing width/height from <svg> tag, then re-add
    const fixed = svgStr.replace(
      /(<svg\b[^>]*?)\s*width\s*=\s*["'][^"']*["']/g, '$1'
    ).replace(
      /(<svg\b[^>]*?)\s*height\s*=\s*["'][^"']*["']/g, '$1'
    ).replace(
      '<svg', `<svg width="${W}" height="${H}"`
    );

    const scale = Math.min(1, maxPx / Math.max(W, H));
    const cW = Math.max(1, Math.round(W * scale));
    const cH = Math.max(1, Math.round(H * scale));

    const blob = new Blob([fixed], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = cW; c.height = cH;
      const cx = c.getContext('2d')!;
      cx.fillStyle = 'white';
      cx.fillRect(0, 0, cW, cH);
      cx.drawImage(img, 0, 0, cW, cH);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DFLT: CornerPoints = {
  topLeft:[100,100], topRight:[300,100], bottomRight:[300,250], bottomLeft:[100,250],
};
function midOf(pts: CornerPoints): MidPoints {
  const m = (a:P2, b:P2):P2 => [(a[0]+b[0])/2, (a[1]+b[1])/2];
  return {
    midTop:   m(pts.topLeft,   pts.topRight),
    midRight: m(pts.topRight,  pts.bottomRight),
    midBottom:m(pts.bottomLeft,pts.bottomRight),
    midLeft:  m(pts.topLeft,   pts.bottomLeft),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuildingCanvas({
  buildingPhotoUrl, designSvg, onCornersChange, onExport, setCanvasRef, initialCorners,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement|null>(null);

  const callbackRef = useCallback((node: HTMLCanvasElement|null) => {
    canvasRef.current = node; if (setCanvasRef) setCanvasRef(node);
  }, [setCanvasRef]);

  // Keep photo in a ref so export can use it without re-creating canvas
  const photoRef   = useRef<HTMLImageElement|null>(null);
  const [photo,      setPhoto]      = useState<HTMLImageElement|null>(null);
  // Design stored in React state — ensures render is re-called when it changes
  const [designSrc,  setDesignSrc]  = useState<HTMLCanvasElement|null>(null);
  const [pts,        setPts]        = useState<CornerPoints>(DFLT);
  const [mids,       setMids]       = useState<MidPoints>(midOf(DFLT));
  const [hasSel,     setHasSel]     = useState(false);
  const [dragging,   setDragging]   = useState<HandleKey|null>(null);
  const [selStart,   setSelStart]   = useState<P2|null>(null);
  const [selEnd,     setSelEnd]     = useState<P2|null>(null);

  useEffect(() => {
    if (initialCorners) { setPts(initialCorners); setMids(midOf(initialCorners)); setHasSel(true); }
  }, [initialCorners]);

  useEffect(() => {
    if (!buildingPhotoUrl) return;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { photoRef.current = img; setPhoto(img); };
    img.src = buildingPhotoUrl;
  }, [buildingPhotoUrl]);

  useEffect(() => {
    if (!designSvg) return;
    svgToCanvas(designSvg, SRC_SIZE).then(c => setDesignSrc(c));
  }, [designSvg]);

  // Render function — depends on designSrc so it re-runs when SVG loads
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext('2d')!;

    const ratio = Math.min(1, MAX_CANVAS / photo.naturalWidth);
    canvas.width  = Math.round(photo.naturalWidth  * ratio);
    canvas.height = Math.round(photo.naturalHeight * ratio);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    // Selection preview
    if (selStart && selEnd) {
      const x=Math.min(selStart[0],selEnd[0]), y=Math.min(selStart[1],selEnd[1]);
      const w=Math.abs(selEnd[0]-selStart[0]), h=Math.abs(selEnd[1]-selStart[1]);
      ctx.fillStyle = 'rgba(37,99,235,0.12)'; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle = '#2563eb'; ctx.lineWidth = Math.max(2, canvas.width*0.003);
      ctx.setLineDash([12,6]); ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
      return;
    }
    if (!hasSel) return;

    // Draw warped design (designSrc is same-origin blob canvas — no CORS)
    if (designSrc) {
      warpOnto(ctx, designSrc,
        pts.topLeft, pts.topRight, pts.bottomRight, pts.bottomLeft,
        mids.midTop, mids.midRight, mids.midBottom, mids.midLeft);
    }

    // Curved border
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = Math.max(2, canvas.width*0.003);
    ctx.setLineDash([10,5]);
    ctx.beginPath();
    ctx.moveTo(pts.topLeft[0],    pts.topLeft[1]);
    ctx.quadraticCurveTo(mids.midTop[0],    mids.midTop[1],    pts.topRight[0],    pts.topRight[1]);
    ctx.quadraticCurveTo(mids.midRight[0],  mids.midRight[1],  pts.bottomRight[0], pts.bottomRight[1]);
    ctx.quadraticCurveTo(mids.midBottom[0], mids.midBottom[1], pts.bottomLeft[0],  pts.bottomLeft[1]);
    ctx.quadraticCurveTo(mids.midLeft[0],   mids.midLeft[1],   pts.topLeft[0],     pts.topLeft[1]);
    ctx.stroke(); ctx.setLineDash([]);

    // Corner handles (blue)
    const cr = canvas.getBoundingClientRect(), sc = canvas.width / (cr.width || canvas.width);
    const r = Math.round(6 * sc);
    for (const [k,px,py] of [
      ['topLeft',pts.topLeft[0],pts.topLeft[1]],
      ['topRight',pts.topRight[0],pts.topRight[1]],
      ['bottomRight',pts.bottomRight[0],pts.bottomRight[1]],
      ['bottomLeft',pts.bottomLeft[0],pts.bottomLeft[1]],
    ] as [CornerKey,number,number][]) {
      ctx.shadowColor='rgba(0,0,0,0.3)'; ctx.shadowBlur=r;
      ctx.beginPath(); ctx.arc(px,py,r+2,0,Math.PI*2); ctx.fillStyle='white'; ctx.fill();
      ctx.shadowColor='transparent';
      ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
      ctx.fillStyle = dragging===k ? '#1e40af' : '#3b82f6'; ctx.fill();
    }

    // Mid handles (orange)
    const rm = Math.round(4 * sc);
    for (const [k,px,py] of [
      ['midTop',mids.midTop[0],mids.midTop[1]],
      ['midRight',mids.midRight[0],mids.midRight[1]],
      ['midBottom',mids.midBottom[0],mids.midBottom[1]],
      ['midLeft',mids.midLeft[0],mids.midLeft[1]],
    ] as [MidKey,number,number][]) {
      ctx.shadowColor='transparent';
      ctx.beginPath(); ctx.arc(px,py,rm+2,0,Math.PI*2); ctx.fillStyle='white'; ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,rm,0,Math.PI*2);
      ctx.fillStyle = dragging===k ? '#c2410c' : '#f97316'; ctx.fill();
    }
  }, [photo, designSrc, pts, mids, hasSel, dragging, selStart, selEnd]);

  useEffect(() => { render(); }, [render]);

  const toCanvas = (e: React.MouseEvent): P2 => {
    const c = canvasRef.current!, cr = c.getBoundingClientRect();
    return [
      Math.round((e.clientX-cr.left)*(c.width/cr.width)),
      Math.round((e.clientY-cr.top) *(c.height/cr.height)),
    ];
  };

  const hitHandle = (mx:number, my:number): HandleKey|null => {
    if (!hasSel) return null;
    const c = canvasRef.current!, cr = c.getBoundingClientRect();
    const t = 18*(c.width/cr.width);
    const all: [HandleKey,P2][] = [
      ['topLeft',pts.topLeft],['topRight',pts.topRight],
      ['bottomRight',pts.bottomRight],['bottomLeft',pts.bottomLeft],
      ['midTop',mids.midTop],['midRight',mids.midRight],
      ['midBottom',mids.midBottom],['midLeft',mids.midLeft],
    ];
    for (const [k,[px,py]] of all) if (Math.hypot(mx-px,my-py)<t) return k;
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const [mx,my]=toCanvas(e); const h=hitHandle(mx,my);
    if (h) { setDragging(h); return; }
    setHasSel(false); setSelStart([mx,my]); setSelEnd([mx,my]);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const [mx,my]=toCanvas(e);
    if (dragging) {
      const isCorner = ['topLeft','topRight','bottomRight','bottomLeft'].includes(dragging);
      if (isCorner) {
        const np = {...pts, [dragging]: [mx,my] as P2};
        setPts(np); onCornersChange(np);
        setMids(prev => snapMids(dragging as CornerKey, np, prev));
      } else {
        setMids(prev => ({...prev, [dragging]: [mx,my] as P2}));
      }
      return;
    }
    if (selStart) setSelEnd([mx,my]);
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (selStart) {
      const [mx,my]=toCanvas(e);
      if (Math.abs(mx-selStart[0])>8 && Math.abs(my-selStart[1])>8) {
        const x=Math.min(selStart[0],mx), y=Math.min(selStart[1],my);
        const w=Math.abs(mx-selStart[0]), h=Math.abs(my-selStart[1]);
        const np: CornerPoints = {topLeft:[x,y],topRight:[x+w,y],bottomRight:[x+w,y+h],bottomLeft:[x,y+h]};
        setPts(np); onCornersChange(np); setMids(midOf(np)); setHasSel(true);
      }
    }
    setSelStart(null); setSelEnd(null); setDragging(null);
  };

  if (!buildingPhotoUrl) return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
      Upload eerst een foto van het pand
    </div>
  );

  return (
    <div>
      <p className="text-sm text-blue-600 mb-2">
        Sleep een gebied op de foto — versleep blauwe hoekpunten ·{' '}
        <span className="text-orange-500">oranje</span> = rand buigen
      </p>
      <canvas
        ref={callbackRef}
        className="w-full rounded-xl border border-gray-200"
        style={{ cursor: dragging ? 'grab' : 'crosshair' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}    onMouseLeave={onMouseUp}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => {
            const ph = photoRef.current;
            if (!ph) return;
            const exp = document.createElement('canvas');
            const ratio = Math.min(1, MAX_CANVAS / ph.naturalWidth);
            exp.width  = Math.round(ph.naturalWidth  * ratio);
            exp.height = Math.round(ph.naturalHeight * ratio);
            const ctx = exp.getContext('2d')!;
            ctx.drawImage(ph, 0, 0, exp.width, exp.height);
            if (hasSel && designSrc) {
              warpOnto(ctx, designSrc,
                pts.topLeft, pts.topRight, pts.bottomRight, pts.bottomLeft,
                mids.midTop, mids.midRight, mids.midBottom, mids.midLeft);
            }
            onExport(exp);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <button
          onClick={() => setMids(midOf(pts))}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
        >
          Reset buiging
        </button>
      </div>
    </div>
  );
}

function snapMids(moved: CornerKey, np: CornerPoints, mids: MidPoints): MidPoints {
  const dm = midOf(np), u = {...mids};
  const adj: Record<CornerKey,MidKey[]> = {
    topLeft:['midTop','midLeft'], topRight:['midTop','midRight'],
    bottomRight:['midRight','midBottom'], bottomLeft:['midLeft','midBottom'],
  };
  for (const mk of adj[moved])
    if (Math.hypot(mids[mk][0]-dm[mk][0], mids[mk][1]-dm[mk][1]) < 20) u[mk] = dm[mk];
  return u;
}
