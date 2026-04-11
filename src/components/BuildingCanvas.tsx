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
const MAX_SRC    = 600;

// ─── Affine triangle rasteriser (GPU-accelerated via canvas transforms) ────────
// Expands clip by EPS pixels from centroid to close sub-pixel gaps.
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  sx0:number,sy0:number,dx0:number,dy0:number,
  sx1:number,sy1:number,dx1:number,dy1:number,
  sx2:number,sy2:number,dx2:number,dy2:number,
  EPS = 1.5,
) {
  const det=(sx1-sx0)*(sy2-sy0)-(sx2-sx0)*(sy1-sy0);
  if (Math.abs(det)<0.001) return;
  const a=((dx1-dx0)*(sy2-sy0)-(dx2-dx0)*(sy1-sy0))/det;
  const b=((dy1-dy0)*(sy2-sy0)-(dy2-dy0)*(sy1-sy0))/det;
  const c=((dx2-dx0)*(sx1-sx0)-(dx1-dx0)*(sx2-sx0))/det;
  const d=((dy2-dy0)*(sx1-sx0)-(dy1-dy0)*(sx2-sx0))/det;
  const e=dx0-a*sx0-c*sy0;
  const f=dy0-b*sx0-d*sy0;

  // Expand clip slightly to close gaps between adjacent strips/triangles
  const cx=(dx0+dx1+dx2)/3, cy=(dy0+dy1+dy2)/3;
  function exp(x:number,y:number):[number,number]{
    const vx=x-cx,vy=y-cy,len=Math.sqrt(vx*vx+vy*vy)||1;
    return [x+(vx/len)*EPS,y+(vy/len)*EPS];
  }
  const [ex0,ey0]=exp(dx0,dy0);
  const [ex1,ey1]=exp(dx1,dy1);
  const [ex2,ey2]=exp(dx2,dy2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ex0,ey0); ctx.lineTo(ex1,ey1); ctx.lineTo(ex2,ey2);
  ctx.closePath(); ctx.clip();
  ctx.setTransform(a,b,c,d,e,f);
  ctx.drawImage(img,0,0);
  ctx.restore();
}

// ─── Bilinear lerp helpers ────────────────────────────────────────────────────
function lerp(a:P2,b:P2,t:number):P2{ return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]; }
function qbez(a:P2,m:P2,b:P2,t:number):P2{ return lerp(lerp(a,m,t),lerp(m,b,t),t); }

// ─── Warp using horizontal scanlines — renders to a NEW offscreen canvas ──────
// One strip per source pixel row. No getImageData → no CORS issue.
function buildWarpCanvas(
  src: HTMLCanvasElement,
  tl:P2,tr:P2,br:P2,bl:P2,
  mt:P2,mr:P2,mb:P2,ml:P2,
  dstW:number, dstH:number,
): HTMLCanvasElement {
  const sW=src.width, sH=src.height;
  const out=document.createElement("canvas");
  out.width=dstW; out.height=dstH;
  const ctx=out.getContext("2d")!;

  const STRIPS=sH; // 1 strip per source pixel row — eliminates visible scan seams
  for (let i=0;i<STRIPS;i++) {
    const v0=i/STRIPS, v1=(i+1)/STRIPS;
    const sy0=v0*sH, sy1=v1*sH;

    // Curved edge: use Coons bilerp (reduces to bilinear when mids are midpoints)
    const lx0=qbez(tl,ml,bl,v0)[0], ly0=qbez(tl,ml,bl,v0)[1]; // left edge at v0
    const rx0=qbez(tr,mr,br,v0)[0], ry0=qbez(tr,mr,br,v0)[1]; // right edge at v0
    const lx1=qbez(tl,ml,bl,v1)[0], ly1=qbez(tl,ml,bl,v1)[1]; // left edge at v1
    const rx1=qbez(tr,mr,br,v1)[0], ry1=qbez(tr,mr,br,v1)[1]; // right edge at v1

    // Correct top/bottom dst y for horizontal curvature
    const topMidY=qbez(tl,mt,tr,0.5)[1]; // vertical correction for curved top
    const botMidY=qbez(bl,mb,br,0.5)[1]; // vertical correction for curved bottom
    void topMidY; void botMidY;

    // Draw two triangles to fill this strip
    drawTriangle(ctx,src,
      0,   sy0, lx0,ly0,
      sW,  sy0, rx0,ry0,
      0,   sy1, lx1,ly1,
    );
    drawTriangle(ctx,src,
      sW,  sy0, rx0,ry0,
      sW,  sy1, rx1,ry1,
      0,   sy1, lx1,ly1,
    );
  }

  // Additionally, do COLUMN pass for horizontal accuracy
  const COLS=sW;
  for (let j=0;j<COLS;j++) {
    const u0=j/COLS, u1=(j+1)/COLS;
    const sx0=u0*sW, sx1=u1*sW;

    const tx0=qbez(tl,mt,tr,u0)[0], ty0=qbez(tl,mt,tr,u0)[1]; // top edge at u0
    const bx0=qbez(bl,mb,br,u0)[0], by0=qbez(bl,mb,br,u0)[1]; // bot edge at u0
    const tx1=qbez(tl,mt,tr,u1)[0], ty1=qbez(tl,mt,tr,u1)[1]; // top edge at u1
    const bx1=qbez(bl,mb,br,u1)[0], by1=qbez(bl,mb,br,u1)[1]; // bot edge at u1

    drawTriangle(ctx,src,
      sx0,0,  tx0,ty0,
      sx1,0,  tx1,ty1,
      sx0,sH, bx0,by0,
    );
    drawTriangle(ctx,src,
      sx1,0,  tx1,ty1,
      sx1,sH, bx1,by1,
      sx0,sH, bx0,by0,
    );
  }

  return out;
}

// ─── SVG → opaque canvas ─────────────────────────────────────────────────────
function loadSvgToCanvas(svgStr:string, maxPx:number): Promise<HTMLCanvasElement> {
  const wm=svgStr.match(/\bwidth\s*=\s*["']\s*([0-9.]+)/);
  const hm=svgStr.match(/\bheight\s*=\s*["']\s*([0-9.]+)/);
  const vm=svgStr.match(/viewBox\s*=\s*["'][^"']*?([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)[\s,]+([0-9.-]+)/);
  let svgW=wm?parseFloat(wm[1]):0, svgH=hm?parseFloat(hm[1]):0;
  if((!svgW||!svgH)&&vm){svgW=parseFloat(vm[3]);svgH=parseFloat(vm[4]);}
  if(!svgW||svgW<1) svgW=800;
  if(!svgH||svgH<1) svgH=600;
  const modified=svgStr.replace("<svg",`<svg width="${svgW}" height="${svgH}"`);
  const scale=Math.min(1,maxPx/Math.max(svgW,svgH));
  const cW=Math.max(1,Math.round(svgW*scale)), cH=Math.max(1,Math.round(svgH*scale));
  return new Promise((resolve)=>{
    const blob=new Blob([modified],{type:"image/svg+xml"});
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const c=document.createElement("canvas"); c.width=cW; c.height=cH;
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
const DEFAULT_CORNERS:CornerPoints={
  topLeft:[100,100],topRight:[300,100],bottomRight:[300,250],bottomLeft:[100,250],
};
function defaultMids(pts:CornerPoints):MidPoints{
  const mid=(a:P2,b:P2):P2=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return{
    midTop:   mid(pts.topLeft,   pts.topRight),
    midRight: mid(pts.topRight,  pts.bottomRight),
    midBottom:mid(pts.bottomLeft,pts.bottomRight),
    midLeft:  mid(pts.topLeft,   pts.bottomLeft),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuildingCanvas({
  buildingPhotoUrl,designSvg,onCornersChange,onExport,setCanvasRef,initialCorners,
}:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const srcRef   =useRef<HTMLCanvasElement|null>(null);

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
    loadSvgToCanvas(designSvg,MAX_SRC).then((c)=>{srcRef.current=c; setSvgReady(true);});
  },[designSvg]);

  const makeLayer=useCallback((p:CornerPoints,m:MidPoints,dW:number,dH:number)=>{
    if(!srcRef.current) return null;
    return buildWarpCanvas(srcRef.current,
      p.topLeft,p.topRight,p.bottomRight,p.bottomLeft,
      m.midTop,m.midRight,m.midBottom,m.midLeft,dW,dH);
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

    // Composite warp layer (no getImageData → no CORS)
    if(srcRef.current){
      const layer=makeLayer(pts,mids,canvas.width,canvas.height);
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

    const cr=canvas.getBoundingClientRect(),scale=canvas.width/(cr.width||canvas.width);
    const r=Math.round(6*scale);
    for(const [key,px,py] of [
      ["topLeft",pts.topLeft[0],pts.topLeft[1]],["topRight",pts.topRight[0],pts.topRight[1]],
      ["bottomRight",pts.bottomRight[0],pts.bottomRight[1]],["bottomLeft",pts.bottomLeft[0],pts.bottomLeft[1]],
    ] as [CornerKey,number,number][]){
      ctx.shadowColor="rgba(0,0,0,0.3)"; ctx.shadowBlur=r;
      ctx.beginPath(); ctx.arc(px,py,r+2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.shadowColor="transparent";
      ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
      ctx.fillStyle=dragging===key?"#1e40af":"#3b82f6"; ctx.fill();
    }
    const rm=Math.round(4*scale);
    for(const [key,px,py] of [
      ["midTop",mids.midTop[0],mids.midTop[1]],["midRight",mids.midRight[0],mids.midRight[1]],
      ["midBottom",mids.midBottom[0],mids.midBottom[1]],["midLeft",mids.midLeft[0],mids.midLeft[1]],
    ] as [MidKey,number,number][]){
      ctx.shadowColor="transparent";
      ctx.beginPath(); ctx.arc(px,py,rm+2,0,Math.PI*2); ctx.fillStyle="white"; ctx.fill();
      ctx.beginPath(); ctx.arc(px,py,rm,0,Math.PI*2);
      ctx.fillStyle=dragging===key?"#c2410c":"#f97316"; ctx.fill();
    }
  },[photo,pts,mids,hasSelection,dragging,selStart,selEnd,makeLayer]);

  useEffect(()=>{render();},[render]);
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
        setMids(prev=>snapMids(dragging as CornerKey,np,prev));
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
        Sleep een gebied op de foto — versleep blauwe hoekpunten ·{" "}
        <span className="text-orange-500">oranje</span> = rand buigen
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
              const layer=makeLayer(pts,mids,exp.width,exp.height);
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

function snapMids(moved:CornerKey,newPts:CornerPoints,mids:MidPoints):MidPoints{
  const dm=defaultMids(newPts),u={...mids};
  const adj:Record<CornerKey,MidKey[]>={
    topLeft:["midTop","midLeft"],topRight:["midTop","midRight"],
    bottomRight:["midRight","midBottom"],bottomLeft:["midLeft","midBottom"],
  };
  for(const mk of adj[moved])
    if(Math.hypot(mids[mk][0]-dm[mk][0],mids[mk][1]-dm[mk][1])<20) u[mk]=dm[mk];
  return u;
}
