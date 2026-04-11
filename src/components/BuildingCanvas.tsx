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

// ─── Coons patch ──────────────────────────────────────────────────────────────
function lerp(a: P2, b: P2, t: number): P2 {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
}
function qbez(a: P2, m: P2, b: P2, t: number): P2 {
  return lerp(lerp(a,m,t), lerp(m,b,t), t);
}

function coons(
  tl:P2,tr:P2,br:P2,bl:P2, mt:P2,mr:P2,mb:P2,ml:P2,
  u:number, v:number
): P2 {
  const top = qbez(tl,mt,tr,u);
  const bot = qbez(bl,mb,br,u);
  const lft = qbez(tl,ml,bl,v);
  const rgt = qbez(tr,mr,br,v);
  const bx=(1-u)*(1-v)*tl[0]+u*(1-v)*tr[0]+u*v*br[0]+(1-u)*v*bl[0];
  const by=(1-u)*(1-v)*tl[1]+u*(1-v)*tr[1]+u*v*br[1]+(1-u)*v*bl[1];
  return [(1-v)*top[0]+v*bot[0]+(1-u)*lft[0]+u*rgt[0]-bx,
          (1-v)*top[1]+v*bot[1]+(1-u)*lft[1]+u*rgt[1]-by];
}

// ─── Pixel warp (offscreen canvas — no CORS issue) ───────────────────────────
/**
 * Renders the design quad onto a NEW offscreen canvas (same size as dst canvas).
 * Uses a N×N forward-map grid: for each (u,v) cell, rasterise the source pixels
 * into the correct destination location using a fine bilinear splat.
 * Returns an ImageData with transparent (alpha=0) outside the quad.
 */
function buildWarpLayer(
  srcCanvas: HTMLCanvasElement,
  tl:P2,tr:P2,br:P2,bl:P2,
  mt:P2,mr:P2,mb:P2,ml:P2,
  dstW: number, dstH: number,
): HTMLCanvasElement {
  const sW = srcCanvas.width, sH = srcCanvas.height;
  if (!sW || !sH) return srcCanvas; // fallback

  // Create output canvas (transparent)
  const out = document.createElement("canvas");
  out.width = dstW; out.height = dstH;
  const ctx = out.getContext("2d")!;
  const outImg = ctx.createImageData(dstW, dstH);
  const dst = outImg.data;

  // Get source pixels (safe — this is our own canvas, no CORS)
  const srcCtx = srcCanvas.getContext("2d")!;
  const srcImg = srcCtx.getImageData(0, 0, sW, sH);
  const src = srcImg.data;

  // Bounding box of the quad in dst space
  const allX=[tl[0],tr[0],br[0],bl[0],mt[0],mr[0],mb[0],ml[0]];
  const allY=[tl[1],tr[1],br[1],bl[1],mt[1],mr[1],mb[1],ml[1]];
  const x0=Math.max(0,Math.floor(Math.min(...allX)));
  const x1=Math.min(dstW,Math.ceil(Math.max(...allX)));
  const y0=Math.max(0,Math.floor(Math.min(...allY)));
  const y1=Math.min(dstH,Math.ceil(Math.max(...allY)));

  // For each dst pixel, invert the Coons map using bilinear initial guess + NR
  for (let py=y0; py<y1; py++) {
    for (let px=x0; px<x1; px++) {
      const cx=px+0.5, cy=py+0.5;

      // --- Bilinear inverse as initial guess ---
      // solve analytically for straight quad, good approx for curved
      let u=0.5, v=0.5;
      {
        const ax=tr[0]-tl[0], ay=tr[1]-tl[1]; // A = tr-tl
        const bx=bl[0]-tl[0], by=bl[1]-tl[1]; // B = bl-tl
        const cx2=tl[0]-tr[0]-bl[0]+br[0];      // C = twist
        const cy2=tl[1]-tr[1]-bl[1]+br[1];
        const dx=cx-tl[0], dy=cy-tl[1];          // D = target-tl
        const qa=cx2*by-cy2*bx;                   // quad coeff of v²
        const qb=ax*by-ay*bx+cx2*dy-cy2*dx;      // linear coeff of v
        const qc=-(ax*dy-ay*dx);                  // constant
        if (Math.abs(qa)<1e-6) {
          v = Math.abs(qb)<1e-6 ? 0.5 : -qc/qb;
        } else {
          const disc=qb*qb-4*qa*qc;
          const sq=disc>0?Math.sqrt(disc):0;
          const v1=(-qb+sq)/(2*qa), v2=(-qb-sq)/(2*qa);
          v = (v1>=0&&v1<=1)?v1:v2;
        }
        v=Math.max(0,Math.min(1,isFinite(v)?v:0.5));
        const denom=(ax+cx2*v);
        u = Math.abs(denom)>1e-6 ? (dx-bx*v)/denom : 0.5;
        u=Math.max(0,Math.min(1,isFinite(u)?u:0.5));
      }

      // --- Newton-Raphson refinement (8 iters) ---
      for (let iter=0; iter<8; iter++) {
        const p=coons(tl,tr,br,bl,mt,mr,mb,ml,u,v);
        const fx=p[0]-cx, fy=p[1]-cy;
        if (fx*fx+fy*fy<0.01) break;
        // Numeric Jacobian (fast enough, avoids analytical mess)
        const EPS=1e-4;
        const pu=coons(tl,tr,br,bl,mt,mr,mb,ml,Math.min(1,u+EPS),v);
        const pv=coons(tl,tr,br,bl,mt,mr,mb,ml,u,Math.min(1,v+EPS));
        const dux=(pu[0]-p[0])/EPS, duy=(pu[1]-p[1])/EPS;
        const dvx=(pv[0]-p[0])/EPS, dvy=(pv[1]-p[1])/EPS;
        const det=dux*dvy-dvx*duy;
        if (Math.abs(det)<1e-9) break;
        u-=(dvy*fx-dvx*fy)/det;
        v-=(dux*fy-duy*fx)/det;
        if (u<-0.05||u>1.05||v<-0.05||v>1.05) break;
      }

      if (u<-0.005||u>1.005||v<-0.005||v>1.005) continue;
      u=Math.max(0,Math.min(1,u)); v=Math.max(0,Math.min(1,v));

      // Bilinear sample from source
      const sx=u*sW, sy=v*sH;
      const ix0=sx|0, iy0=sy|0;
      const ix1=Math.min(ix0+1,sW-1), iy1=Math.min(iy0+1,sH-1);
      const fx2=sx-ix0, fy2=sy-iy0;
      const w00=(1-fx2)*(1-fy2), w10=fx2*(1-fy2), w01=(1-fx2)*fy2, w11=fx2*fy2;
      const i00=(iy0*sW+ix0)*4, i10=(iy0*sW+ix1)*4;
      const i01=(iy1*sW+ix0)*4, i11=(iy1*sW+ix1)*4;
      const di=(py*dstW+px)*4;
      dst[di  ]=w00*src[i00  ]+w10*src[i10  ]+w01*src[i01  ]+w11*src[i11  ];
      dst[di+1]=w00*src[i00+1]+w10*src[i10+1]+w01*src[i01+1]+w11*src[i11+1];
      dst[di+2]=w00*src[i00+2]+w10*src[i10+2]+w01*src[i01+2]+w11*src[i11+2];
      dst[di+3]=255;
    }
  }

  ctx.putImageData(outImg, 0, 0);
  return out;
}

// ─── SVG loader ───────────────────────────────────────────────────────────────
function loadSvgToCanvas(svgStr: string, maxPx: number): Promise<HTMLCanvasElement> {
  const wm = svgStr.match(/\bwidth\s*=\s*["']\s*([0-9.]+)/);
  const hm = svgStr.match(/\bheight\s*=\s*["']\s*([0-9.]+)/);
  const vm = svgStr.match(/viewBox\s*=\s*["'][^"']*?([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)/);
  let svgW=wm?parseFloat(wm[1]):0, svgH=hm?parseFloat(hm[1]):0;
  if ((!svgW||!svgH)&&vm){svgW=parseFloat(vm[3]);svgH=parseFloat(vm[4]);}
  if (!svgW||svgW<1) svgW=800;
  if (!svgH||svgH<1) svgH=600;
  const modified=svgStr.replace("<svg",`<svg width="${svgW}" height="${svgH}"`);
  const scale=Math.min(1,maxPx/Math.max(svgW,svgH));
  const cW=Math.max(1,Math.round(svgW*scale)), cH=Math.max(1,Math.round(svgH*scale));
  return new Promise((resolve)=>{
    const blob=new Blob([modified],{type:"image/svg+xml"});
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const c=document.createElement("canvas");
      c.width=cW; c.height=cH;
      const cx=c.getContext("2d")!;
      cx.fillStyle="white"; cx.fillRect(0,0,cW,cH);
      cx.drawImage(img,0,0,cW,cH);
      resolve(c);
    };
    img.onerror=()=>{URL.revokeObjectURL(url); const c=document.createElement("canvas"); c.width=200; c.height=100; resolve(c);};
    img.src=url;
  });
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_CORNERS: CornerPoints={
  topLeft:[100,100],topRight:[300,100],bottomRight:[300,250],bottomLeft:[100,250],
};
function defaultMids(pts: CornerPoints): MidPoints {
  const mid=(a:P2,b:P2):P2=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return {
    midTop:   mid(pts.topLeft,   pts.topRight),
    midRight: mid(pts.topRight,  pts.bottomRight),
    midBottom:mid(pts.bottomLeft,pts.bottomRight),
    midLeft:  mid(pts.topLeft,   pts.bottomLeft),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuildingCanvas({
  buildingPhotoUrl,designSvg,onCornersChange,onExport,setCanvasRef,initialCorners,
}: Props) {
  const canvasRef   =useRef<HTMLCanvasElement|null>(null);
  const srcRef      =useRef<HTMLCanvasElement|null>(null); // opaque design

  const callbackRef=useCallback((node:HTMLCanvasElement|null)=>{
    canvasRef.current=node; if(setCanvasRef) setCanvasRef(node);
  },[setCanvasRef]);

  const [photo,       setPhoto]       =useState<HTMLImageElement|null>(null);
  const [pts,         setPts]         =useState<CornerPoints>(DEFAULT_CORNERS);
  const [mids,        setMids]        =useState<MidPoints>(defaultMids(DEFAULT_CORNERS));
  const [hasSelection,setHasSelection]=useState(false);
  const [dragging,    setDragging]    =useState<HandleKey|null>(null);
  const [selStart,    setSelStart]    =useState<P2|null>(null);
  const [selEnd,      setSelEnd]      =useState<P2|null>(null);
  const [svgReady,    setSvgReady]    =useState(false);

  useEffect(()=>{
    if(initialCorners){setPts(initialCorners);setMids(defaultMids(initialCorners));setHasSelection(true);}
  },[initialCorners]);

  useEffect(()=>{
    if(!buildingPhotoUrl) return;
    const img=new Image(); img.crossOrigin="anonymous";
    img.onload=()=>setPhoto(img); img.src=buildingPhotoUrl;
  },[buildingPhotoUrl]);

  useEffect(()=>{
    if(!designSvg) return;
    setSvgReady(false);
    loadSvgToCanvas(designSvg,MAX_SRC).then((c)=>{
      srcRef.current=c; setSvgReady(true);
    });
  },[designSvg]);

  // Compute the warp layer and return a canvas with it
  const makeWarpLayer=useCallback((p:CornerPoints,m:MidPoints,dstW:number,dstH:number)=>{
    const src=srcRef.current;
    if(!src) return null;
    return buildWarpLayer(src,
      p.topLeft,p.topRight,p.bottomRight,p.bottomLeft,
      m.midTop,m.midRight,m.midBottom,m.midLeft,
      dstW,dstH);
  },[]);

  const render=useCallback(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!photo) return;
    const ctx=canvas.getContext("2d")!;
    const ratio=Math.min(1,MAX_CANVAS/photo.naturalWidth);
    canvas.width =Math.round(photo.naturalWidth *ratio);
    canvas.height=Math.round(photo.naturalHeight*ratio);
    ctx.drawImage(photo,0,0,canvas.width,canvas.height);

    if(selStart&&selEnd){
      const x=Math.min(selStart[0],selEnd[0]),y=Math.min(selStart[1],selEnd[1]);
      const w=Math.abs(selEnd[0]-selStart[0]),h=Math.abs(selEnd[1]-selStart[1]);
      ctx.fillStyle="rgba(37,99,235,0.12)"; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle="#2563eb"; ctx.lineWidth=Math.max(2,canvas.width*0.003);
      ctx.setLineDash([12,6]); ctx.strokeRect(x,y,w,h); ctx.setLineDash([]);
      return;
    }
    if(!hasSelection) return;

    // Draw warp layer over photo (drawImage — no CORS getImageData)
    if(srcRef.current){
      const layer=makeWarpLayer(pts,mids,canvas.width,canvas.height);
      if(layer) ctx.drawImage(layer,0,0);
    }

    // Curved border
    ctx.strokeStyle="#2563eb"; ctx.lineWidth=Math.max(2,canvas.width*0.003);
    ctx.setLineDash([10,5]);
    ctx.beginPath();
    ctx.moveTo(pts.topLeft[0],pts.topLeft[1]);
    ctx.quadraticCurveTo(mids.midTop[0],mids.midTop[1],pts.topRight[0],pts.topRight[1]);
    ctx.quadraticCurveTo(mids.midRight[0],mids.midRight[1],pts.bottomRight[0],pts.bottomRight[1]);
    ctx.quadraticCurveTo(mids.midBottom[0],mids.midBottom[1],pts.bottomLeft[0],pts.bottomLeft[1]);
    ctx.quadraticCurveTo(mids.midLeft[0],mids.midLeft[1],pts.topLeft[0],pts.topLeft[1]);
    ctx.stroke(); ctx.setLineDash([]);

    // Handles
    const cr=canvas.getBoundingClientRect(),scale=canvas.width/(cr.width||canvas.width);
    const r=Math.round(6*scale);
    const corners:Array<[CornerKey,number,number]>=[
      ["topLeft",pts.topLeft[0],pts.topLeft[1]],["topRight",pts.topRight[0],pts.topRight[1]],
      ["bottomRight",pts.bottomRight[0],pts.bottomRight[1]],["bottomLeft",pts.bottomLeft[0],pts.bottomLeft[1]],
    ];
    for(const [key,px,py] of corners){
      ctx.shadowColor="rgba(0,0,0,0.3)"; ctx.shadowBlur=r;
      ctx.beginPath(); ctx.arc(px,py,r+2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.shadowColor="transparent";
      ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
      ctx.fillStyle=dragging===key?"#1e40af":"#3b82f6"; ctx.fill();
    }
    const rm=Math.round(4*scale);
    const midHandles:Array<[MidKey,number,number]>=[
      ["midTop",mids.midTop[0],mids.midTop[1]],["midRight",mids.midRight[0],mids.midRight[1]],
      ["midBottom",mids.midBottom[0],mids.midBottom[1]],["midLeft",mids.midLeft[0],mids.midLeft[1]],
    ];
    for(const [key,px,py] of midHandles){
      ctx.shadowColor="transparent";
      ctx.beginPath(); ctx.arc(px,py,rm+2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,rm,0,Math.PI*2);
      ctx.fillStyle=dragging===key?"#c2410c":"#f97316"; ctx.fill();
    }
  },[photo,pts,mids,hasSelection,dragging,selStart,selEnd,makeWarpLayer]);

  useEffect(()=>{render();},[render]);
  // Re-render when SVG finishes loading
  useEffect(()=>{if(svgReady) render();},[svgReady,render]);

  const toCanvas=(e:React.MouseEvent):P2=>{
    const c=canvasRef.current!,cr=c.getBoundingClientRect();
    return [Math.round((e.clientX-cr.left)*(c.width/cr.width)),Math.round((e.clientY-cr.top)*(c.height/cr.height))];
  };
  const hitHandle=(mx:number,my:number):HandleKey|null=>{
    if(!hasSelection) return null;
    const c=canvasRef.current!,cr=c.getBoundingClientRect();
    const thresh=18*(c.width/cr.width);
    const all:Array<[HandleKey,P2]>=[
      ["topLeft",pts.topLeft],["topRight",pts.topRight],
      ["bottomRight",pts.bottomRight],["bottomLeft",pts.bottomLeft],
      ["midTop",mids.midTop],["midRight",mids.midRight],
      ["midBottom",mids.midBottom],["midLeft",mids.midLeft],
    ];
    for(const [key,[px,py]] of all) if(Math.hypot(mx-px,my-py)<thresh) return key;
    return null;
  };

  const onMouseDown=(e:React.MouseEvent)=>{
    const [mx,my]=toCanvas(e); const h=hitHandle(mx,my);
    if(h){setDragging(h);return;}
    setHasSelection(false); setSelStart([mx,my]); setSelEnd([mx,my]);
  };
  const onMouseMove=(e:React.MouseEvent)=>{
    const [mx,my]=toCanvas(e);
    if(dragging){
      if(["topLeft","topRight","bottomRight","bottomLeft"].includes(dragging)){
        const np={...pts,[dragging]:[mx,my] as P2};
        setPts(np); onCornersChange(np);
        setMids(prev=>snapMidIfStraight(dragging as CornerKey,np,prev));
      } else {
        setMids(prev=>({...prev,[dragging]:[mx,my] as P2}));
      }
      return;
    }
    if(selStart) setSelEnd([mx,my]);
  };
  const onMouseUp=(e:React.MouseEvent)=>{
    if(selStart){
      const [mx,my]=toCanvas(e);
      if(Math.abs(mx-selStart[0])>8&&Math.abs(my-selStart[1])>8){
        const x=Math.min(selStart[0],mx),y=Math.min(selStart[1],my);
        const w=Math.abs(mx-selStart[0]),h=Math.abs(my-selStart[1]);
        const np:CornerPoints={topLeft:[x,y],topRight:[x+w,y],bottomRight:[x+w,y+h],bottomLeft:[x,y+h]};
        setPts(np); onCornersChange(np); setMids(defaultMids(np)); setHasSelection(true);
      }
    }
    setSelStart(null); setSelEnd(null); setDragging(null);
  };

  if(!buildingPhotoUrl) return(
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
      Upload eerst een foto van het pand
    </div>
  );

  return(
    <div>
      <p className="text-sm text-blue-600 mb-2">
        Sleep een gebied op de foto om het ontwerp daar te plaatsen — of versleep de blauwe hoekpunten ·{" "}
        <span className="text-orange-500">oranje</span> punten = rand buigen
      </p>
      <canvas
        ref={callbackRef}
        className="w-full rounded-xl border border-gray-200"
        style={{cursor:dragging?"grab":"crosshair"}}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}   onMouseLeave={onMouseUp}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={()=>{
            const canvas=canvasRef.current;
            if(!canvas||!photo) return;
            const exp=document.createElement("canvas");
            exp.width=canvas.width; exp.height=canvas.height;
            const ctx=exp.getContext("2d")!;
            ctx.drawImage(photo,0,0,exp.width,exp.height);
            if(hasSelection&&srcRef.current){
              const layer=makeWarpLayer(pts,mids,exp.width,exp.height);
              if(layer) ctx.drawImage(layer,0,0);
            }
            onExport(exp);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <button
          onClick={()=>setMids(defaultMids(pts))}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
        >
          Reset buiging
        </button>
      </div>
    </div>
  );
}

function snapMidIfStraight(moved:CornerKey,newPts:CornerPoints,mids:MidPoints):MidPoints{
  const dm=defaultMids(newPts),updated={...mids};
  const edgesOf:Record<CornerKey,MidKey[]>={
    topLeft:["midTop","midLeft"],topRight:["midTop","midRight"],
    bottomRight:["midRight","midBottom"],bottomLeft:["midLeft","midBottom"],
  };
  for(const mk of edgesOf[moved]){
    if(Math.hypot(mids[mk][0]-dm[mk][0],mids[mk][1]-dm[mk][1])<20)
      updated[mk]=dm[mk];
  }
  return updated;
}
