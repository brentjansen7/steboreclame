"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { CornerPoints } from "@/lib/perspectiveEngine";

type P2 = [number, number];
type CornerKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";
type MidKey    = "midTop"  | "midRight"  | "midBottom"  | "midLeft";
type HandleKey = CornerKey | MidKey;

interface MidPoints { midTop: P2; midRight: P2; midBottom: P2; midLeft: P2; }

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
const MAX_SRC    = 600;

// ─── Quadratic bezier helpers ─────────────────────────────────────────────────
function qbez(a: P2, m: P2, b: P2, t: number): P2 {
  const s = 1 - t;
  return [s*s*a[0]+2*s*t*m[0]+t*t*b[0], s*s*a[1]+2*s*t*m[1]+t*t*b[1]];
}
function dqbez(a: P2, m: P2, b: P2, t: number): P2 {
  const s = 1 - t;
  return [2*(s*(m[0]-a[0])+t*(b[0]-m[0])), 2*(s*(m[1]-a[1])+t*(b[1]-m[1]))];
}

// ─── Coons patch ──────────────────────────────────────────────────────────────
// Maps (u,v) ∈ [0,1]² → canvas pixel, supporting curved edges.
function coons(
  tl: P2, tr: P2, br: P2, bl: P2,
  mt: P2, mr: P2, mb: P2, ml: P2,
  u: number, v: number,
): P2 {
  const top = qbez(tl, mt, tr, u);
  const bot = qbez(bl, mb, br, u);
  const lft = qbez(tl, ml, bl, v);
  const rgt = qbez(tr, mr, br, v);
  const bx = (1-u)*(1-v)*tl[0]+u*(1-v)*tr[0]+u*v*br[0]+(1-u)*v*bl[0];
  const by = (1-u)*(1-v)*tl[1]+u*(1-v)*tr[1]+u*v*br[1]+(1-u)*v*bl[1];
  return [
    (1-v)*top[0]+v*bot[0]+(1-u)*lft[0]+u*rgt[0]-bx,
    (1-v)*top[1]+v*bot[1]+(1-u)*lft[1]+u*rgt[1]-by,
  ];
}

// Partial derivatives of coons patch w.r.t. u and v
function coonsDeriv(
  tl: P2, tr: P2, br: P2, bl: P2,
  mt: P2, mr: P2, mb: P2, ml: P2,
  u: number, v: number,
): { du: P2; dv: P2 } {
  const dtop = dqbez(tl, mt, tr, u);
  const dbot = dqbez(bl, mb, br, u);
  const dlft = dqbez(tl, ml, bl, v);
  const drgt = dqbez(tr, mr, br, v);
  const lft  = qbez(tl, ml, bl, v);
  const rgt  = qbez(tr, mr, br, v);
  const top  = qbez(tl, mt, tr, u);
  const bot  = qbez(bl, mb, br, u);
  return {
    du: [
      (1-v)*dtop[0]+v*dbot[0]+rgt[0]-lft[0]-(-(1-v)*tl[0]+(1-v)*tr[0]+v*br[0]-v*bl[0]),
      (1-v)*dtop[1]+v*dbot[1]+rgt[1]-lft[1]-(-(1-v)*tl[1]+(1-v)*tr[1]+v*br[1]-v*bl[1]),
    ],
    dv: [
      -top[0]+bot[0]+(1-u)*dlft[0]+u*drgt[0]-((1-u)*(-tl[0]+bl[0])+u*(-tr[0]+br[0])),
      -top[1]+bot[1]+(1-u)*dlft[1]+u*drgt[1]-((1-u)*(-tl[1]+bl[1])+u*(-tr[1]+br[1])),
    ],
  };
}

// Newton-Raphson: find (u,v) for canvas point (cx,cy). Returns null if outside.
function invertCoons(
  tl: P2, tr: P2, br: P2, bl: P2,
  mt: P2, mr: P2, mb: P2, ml: P2,
  cx: number, cy: number,
): P2 | null {
  // Linear initial guess (bilinear inversion ignoring curves)
  let u = 0.5, v = 0.5;
  for (let iter = 0; iter < 8; iter++) {
    const p   = coons(tl,tr,br,bl,mt,mr,mb,ml,u,v);
    const fx  = p[0] - cx, fy = p[1] - cy;
    if (fx*fx+fy*fy < 0.01) break;
    const { du, dv } = coonsDeriv(tl,tr,br,bl,mt,mr,mb,ml,u,v);
    const det = du[0]*dv[1]-dv[0]*du[1];
    if (Math.abs(det) < 1e-9) break;
    u -= (dv[1]*fx-dv[0]*fy)/det;
    v -= (du[0]*fy-du[1]*fx)/det;
  }
  if (u < -0.01 || u > 1.01 || v < -0.01 || v > 1.01) return null;
  return [Math.max(0,Math.min(1,u)), Math.max(0,Math.min(1,v))];
}

// ─── Pixel-perfect warp ───────────────────────────────────────────────────────
function drawCoons(
  ctx: CanvasRenderingContext2D,
  srcCanvas: HTMLCanvasElement,
  srcData: ImageData,
  tl: P2, tr: P2, br: P2, bl: P2,
  mt: P2, mr: P2, mb: P2, ml: P2,
) {
  const W = srcCanvas.width, H = srcCanvas.height;
  if (!W || !H) return;
  const cW = ctx.canvas.width, cH = ctx.canvas.height;

  // Bounding box of quad
  const allX = [tl[0],tr[0],br[0],bl[0],mt[0],mr[0],mb[0],ml[0]];
  const allY = [tl[1],tr[1],br[1],bl[1],mt[1],mr[1],mb[1],ml[1]];
  const x0 = Math.max(0, Math.floor(Math.min(...allX)));
  const x1 = Math.min(cW, Math.ceil (Math.max(...allX)));
  const y0 = Math.max(0, Math.floor(Math.min(...allY)));
  const y1 = Math.min(cH, Math.ceil (Math.max(...allY)));
  if (x1<=x0 || y1<=y0) return;

  const dW = x1-x0, dH = y1-y0;
  const dstImg = ctx.getImageData(x0, y0, dW, dH);
  const dst = dstImg.data, sdata = srcData.data;

  for (let py = 0; py < dH; py++) {
    for (let px = 0; px < dW; px++) {
      const uv = invertCoons(tl,tr,br,bl,mt,mr,mb,ml, x0+px+0.5, y0+py+0.5);
      if (!uv) continue;
      const sx = uv[0]*W, sy = uv[1]*H;
      const ix0=sx|0, iy0=sy|0;
      const ix1=ix0<W-1?ix0+1:ix0, iy1=iy0<H-1?iy0+1:iy0;
      const fx=sx-ix0, fy=sy-iy0;
      const w00=(1-fx)*(1-fy),w10=fx*(1-fy),w01=(1-fx)*fy,w11=fx*fy;
      const i00=(iy0*W+ix0)*4,i10=(iy0*W+ix1)*4,i01=(iy1*W+ix0)*4,i11=(iy1*W+ix1)*4;
      const di=(py*dW+px)*4;
      dst[di  ]=w00*sdata[i00  ]+w10*sdata[i10  ]+w01*sdata[i01  ]+w11*sdata[i11  ];
      dst[di+1]=w00*sdata[i00+1]+w10*sdata[i10+1]+w01*sdata[i01+1]+w11*sdata[i11+1];
      dst[di+2]=w00*sdata[i00+2]+w10*sdata[i10+2]+w01*sdata[i01+2]+w11*sdata[i11+2];
      dst[di+3]=255;
    }
  }
  ctx.putImageData(dstImg, x0, y0);
}

// ─── SVG loader ───────────────────────────────────────────────────────────────
function loadSvgToCanvas(svgStr: string, maxPx: number): Promise<HTMLCanvasElement> {
  const wm = svgStr.match(/\bwidth\s*=\s*["']\s*([0-9.]+)/);
  const hm = svgStr.match(/\bheight\s*=\s*["']\s*([0-9.]+)/);
  const vm = svgStr.match(/viewBox\s*=\s*["'][^"']*?([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)/);
  let svgW = wm ? parseFloat(wm[1]) : 0;
  let svgH = hm ? parseFloat(hm[1]) : 0;
  if ((!svgW||!svgH) && vm) { svgW=parseFloat(vm[3]); svgH=parseFloat(vm[4]); }
  if (!svgW||svgW<1) svgW=800;
  if (!svgH||svgH<1) svgH=600;
  let modified = svgStr.replace("<svg", `<svg width="${svgW}" height="${svgH}"`);
  const scale = Math.min(1, maxPx/Math.max(svgW, svgH));
  const cW = Math.max(1, Math.round(svgW*scale));
  const cH = Math.max(1, Math.round(svgH*scale));
  return new Promise((resolve) => {
    const blob = new Blob([modified], { type:"image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width=cW; c.height=cH;
      const cx = c.getContext("2d")!;
      cx.fillStyle="white"; cx.fillRect(0,0,cW,cH);
      cx.drawImage(img,0,0,cW,cH);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); const c=document.createElement("canvas"); c.width=200; c.height=100; resolve(c); };
    img.src = url;
  });
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_CORNERS: CornerPoints = {
  topLeft:[100,100], topRight:[300,100], bottomRight:[300,250], bottomLeft:[100,250],
};
function defaultMids(pts: CornerPoints): MidPoints {
  const mid = (a: P2, b: P2): P2 => [(a[0]+b[0])/2, (a[1]+b[1])/2];
  return {
    midTop:    mid(pts.topLeft,    pts.topRight),
    midRight:  mid(pts.topRight,   pts.bottomRight),
    midBottom: mid(pts.bottomLeft, pts.bottomRight),
    midLeft:   mid(pts.topLeft,    pts.bottomLeft),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuildingCanvas({
  buildingPhotoUrl, designSvg,
  onCornersChange, onExport, setCanvasRef, initialCorners,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement|null>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const srcDataRef   = useRef<ImageData|null>(null);

  const callbackRef = useCallback((node: HTMLCanvasElement|null) => {
    canvasRef.current = node;
    if (setCanvasRef) setCanvasRef(node);
  }, [setCanvasRef]);

  const [photo,        setPhoto]        = useState<HTMLImageElement|null>(null);
  const [pts,          setPts]          = useState<CornerPoints>(DEFAULT_CORNERS);
  const [mids,         setMids]         = useState<MidPoints>(defaultMids(DEFAULT_CORNERS));
  const [hasSelection, setHasSelection] = useState(false);
  const [dragging,     setDragging]     = useState<HandleKey|null>(null);
  const [selStart,     setSelStart]     = useState<P2|null>(null);
  const [selEnd,       setSelEnd]       = useState<P2|null>(null);

  useEffect(() => {
    if (initialCorners) {
      setPts(initialCorners);
      setMids(defaultMids(initialCorners));
      setHasSelection(true);
    }
  }, [initialCorners]);

  useEffect(() => {
    if (!buildingPhotoUrl) return;
    const img = new Image(); img.crossOrigin="anonymous";
    img.onload = () => setPhoto(img);
    img.src = buildingPhotoUrl;
  }, [buildingPhotoUrl]);

  useEffect(() => {
    if (!designSvg) return;
    loadSvgToCanvas(designSvg, MAX_SRC).then((c) => {
      srcCanvasRef.current = c;
      srcDataRef.current   = c.getContext("2d")!.getImageData(0,0,c.width,c.height);
    });
  }, [designSvg]);

  const doWarp = useCallback((
    ctx: CanvasRenderingContext2D,
    p: CornerPoints,
    m: MidPoints,
  ) => {
    if (!srcCanvasRef.current || !srcDataRef.current) return;
    drawCoons(ctx, srcCanvasRef.current, srcDataRef.current,
      p.topLeft, p.topRight, p.bottomRight, p.bottomLeft,
      m.midTop, m.midRight, m.midBottom, m.midLeft);
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d")!;
    const ratio = Math.min(1, MAX_CANVAS/photo.naturalWidth);
    canvas.width  = Math.round(photo.naturalWidth *ratio);
    canvas.height = Math.round(photo.naturalHeight*ratio);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    if (selStart && selEnd) {
      const x=Math.min(selStart[0],selEnd[0]), y=Math.min(selStart[1],selEnd[1]);
      const w=Math.abs(selEnd[0]-selStart[0]), h=Math.abs(selEnd[1]-selStart[1]);
      ctx.fillStyle="rgba(37,99,235,0.12)"; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle="#2563eb"; ctx.lineWidth=Math.max(2,canvas.width*0.003);
      ctx.setLineDash([12,6]); ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
      return;
    }

    if (!hasSelection) return;
    doWarp(ctx, pts, mids);

    // Border (curved bezier path)
    ctx.strokeStyle="#2563eb"; ctx.lineWidth=Math.max(2,canvas.width*0.003);
    ctx.setLineDash([10,5]);
    ctx.beginPath();
    ctx.moveTo(pts.topLeft[0], pts.topLeft[1]);
    ctx.quadraticCurveTo(mids.midTop[0], mids.midTop[1], pts.topRight[0], pts.topRight[1]);
    ctx.quadraticCurveTo(mids.midRight[0], mids.midRight[1], pts.bottomRight[0], pts.bottomRight[1]);
    ctx.quadraticCurveTo(mids.midBottom[0], mids.midBottom[1], pts.bottomLeft[0], pts.bottomLeft[1]);
    ctx.quadraticCurveTo(mids.midLeft[0], mids.midLeft[1], pts.topLeft[0], pts.topLeft[1]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner handles (blue)
    const cr=canvas.getBoundingClientRect(), scale=canvas.width/(cr.width||canvas.width);
    const r=Math.round(6*scale);
    const corners: [CornerKey,number,number][] = [
      ["topLeft",pts.topLeft[0],pts.topLeft[1]],
      ["topRight",pts.topRight[0],pts.topRight[1]],
      ["bottomRight",pts.bottomRight[0],pts.bottomRight[1]],
      ["bottomLeft",pts.bottomLeft[0],pts.bottomLeft[1]],
    ];
    for (const [key,px,py] of corners) {
      ctx.shadowColor="rgba(0,0,0,0.3)"; ctx.shadowBlur=r;
      ctx.beginPath(); ctx.arc(px,py,r+2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.shadowColor="transparent";
      ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
      ctx.fillStyle=dragging===key?"#1e40af":"#3b82f6"; ctx.fill();
    }

    // Mid handles (orange, smaller)
    const rm = Math.round(4*scale);
    const midHandles: [MidKey,number,number][] = [
      ["midTop",    mids.midTop[0],    mids.midTop[1]],
      ["midRight",  mids.midRight[0],  mids.midRight[1]],
      ["midBottom", mids.midBottom[0], mids.midBottom[1]],
      ["midLeft",   mids.midLeft[0],   mids.midLeft[1]],
    ];
    for (const [key,px,py] of midHandles) {
      // Dashed line from mid to edge midpoint
      const isStr = isStraight(key, pts, mids, scale);
      ctx.shadowColor="transparent";
      ctx.beginPath(); ctx.arc(px,py,rm+2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,rm,0,Math.PI*2);
      ctx.fillStyle=dragging===key?"#c2410c": isStr?"#f97316":"#ea580c"; ctx.fill();
    }
  }, [photo, pts, mids, hasSelection, dragging, selStart, selEnd, doWarp]);

  useEffect(() => { render(); }, [render]);

  // Re-render after SVG loads
  useEffect(() => {
    if (!designSvg) return;
    loadSvgToCanvas(designSvg, MAX_SRC).then((c) => {
      srcCanvasRef.current = c;
      srcDataRef.current   = c.getContext("2d")!.getImageData(0,0,c.width,c.height);
      render();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designSvg]);

  const toCanvas = (e: React.MouseEvent): P2 => {
    const c=canvasRef.current!, cr=c.getBoundingClientRect();
    return [Math.round((e.clientX-cr.left)*(c.width/cr.width)), Math.round((e.clientY-cr.top)*(c.height/cr.height))];
  };

  const hitHandle = (mx: number, my: number): HandleKey|null => {
    if (!hasSelection) return null;
    const c=canvasRef.current!, cr=c.getBoundingClientRect();
    const thresh=18*(c.width/cr.width);
    const all: [HandleKey,P2][] = [
      ["topLeft",pts.topLeft],["topRight",pts.topRight],
      ["bottomRight",pts.bottomRight],["bottomLeft",pts.bottomLeft],
      ["midTop",mids.midTop],["midRight",mids.midRight],
      ["midBottom",mids.midBottom],["midLeft",mids.midLeft],
    ];
    for (const [key,[px,py]] of all)
      if (Math.hypot(mx-px,my-py)<thresh) return key;
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const [mx,my]=toCanvas(e);
    const h=hitHandle(mx,my);
    if (h) { setDragging(h); return; }
    setHasSelection(false);
    setSelStart([mx,my]); setSelEnd([mx,my]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const [mx,my]=toCanvas(e);
    if (dragging) {
      if (dragging in {topLeft:1,topRight:1,bottomRight:1,bottomLeft:1}) {
        const newPts={...pts,[dragging]:[mx,my] as P2};
        setPts(newPts); onCornersChange(newPts);
        // Snap mid-point if it was on the straight default
        setMids(prev => snapMidIfStraight(dragging as CornerKey, newPts, prev));
      } else {
        setMids(prev=>({...prev,[dragging]:[mx,my] as P2}));
      }
      return;
    }
    if (selStart) setSelEnd([mx,my]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (selStart) {
      const [mx,my]=toCanvas(e);
      if (Math.abs(mx-selStart[0])>8&&Math.abs(my-selStart[1])>8) {
        const x=Math.min(selStart[0],mx), y=Math.min(selStart[1],my);
        const w=Math.abs(mx-selStart[0]), h=Math.abs(my-selStart[1]);
        const np: CornerPoints={topLeft:[x,y],topRight:[x+w,y],bottomRight:[x+w,y+h],bottomLeft:[x,y+h]};
        setPts(np); onCornersChange(np); setMids(defaultMids(np)); setHasSelection(true);
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
        Sleep een gebied op de foto om het ontwerp daar te plaatsen — of versleep de blauwe hoekpunten · <span className="text-orange-500">oranje</span> punten = rand buigen
      </p>
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
            const canvas=canvasRef.current;
            if (!canvas||!photo) return;
            const exp=document.createElement("canvas");
            exp.width=canvas.width; exp.height=canvas.height;
            const ctx=exp.getContext("2d")!;
            ctx.drawImage(photo,0,0,exp.width,exp.height);
            if (hasSelection) doWarp(ctx, pts, mids);
            onExport(exp);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <button
          onClick={() => { setMids(defaultMids(pts)); }}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
        >
          Reset buiging
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isStraight(key: MidKey, pts: CornerPoints, mids: MidPoints, _scale: number): boolean {
  const dm=defaultMids(pts), m=mids[key];
  return Math.hypot(m[0]-dm[key][0], m[1]-dm[key][1])<2;
}

// When a corner moves, keep mid-points that were on the straight default snapped
function snapMidIfStraight(moved: CornerKey, newPts: CornerPoints, mids: MidPoints): MidPoints {
  const dm=defaultMids(newPts);
  const updated={...mids};
  const edgesOf: Record<CornerKey,MidKey[]>={
    topLeft:["midTop","midLeft"],
    topRight:["midTop","midRight"],
    bottomRight:["midRight","midBottom"],
    bottomLeft:["midLeft","midBottom"],
  };
  for (const mk of edgesOf[moved]) {
    // Only snap if was previously straight (within 10px)
    const old=mids[mk];
    const oldDefault=dm[mk]; // approximate: close enough
    if (Math.hypot(old[0]-oldDefault[0],old[1]-oldDefault[1])<15)
      updated[mk]=dm[mk];
  }
  return updated;
}
