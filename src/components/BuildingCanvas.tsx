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
const SRC_SIZE   = 512; // texture size — power-of-2 for best GL compat

// ─── Math ─────────────────────────────────────────────────────────────────────
const lerp = (a:P2, b:P2, t:number):P2 =>
  [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];

// Quadratic bezier given control point CP (NOT on-curve mid)
const qbez = (a:P2, cp:P2, b:P2, t:number):P2 =>
  lerp(lerp(a,cp,t), lerp(cp,b,t), t);

// Convert on-curve midpoint to bezier control point.
// The quadratic bezier passes through `mid` at t=0.5 when CP = 2*mid - 0.5*(A+B).
function ctrl(a:P2, mid:P2, b:P2): P2 {
  return [2*mid[0]-0.5*(a[0]+b[0]), 2*mid[1]-0.5*(a[1]+b[1])];
}

// Coons patch — maps (u,v)∈[0,1]² to canvas pixel position.
// mt/mr/mb/ml are ON-CURVE midpoints at the centre of each edge.
function coons(
  tl:P2,tr:P2,br:P2,bl:P2,
  mt:P2,mr:P2,mb:P2,ml:P2,
  u:number, v:number,
): P2 {
  const cpT=ctrl(tl,mt,tr), cpR=ctrl(tr,mr,br);
  const cpB=ctrl(bl,mb,br), cpL=ctrl(tl,ml,bl);
  const top=qbez(tl,cpT,tr,u), bot=qbez(bl,cpB,br,u);
  const lft=qbez(tl,cpL,bl,v), rgt=qbez(tr,cpR,br,v);
  const bx=(1-u)*(1-v)*tl[0]+u*(1-v)*tr[0]+u*v*br[0]+(1-u)*v*bl[0];
  const by=(1-u)*(1-v)*tl[1]+u*(1-v)*tr[1]+u*v*br[1]+(1-u)*v*bl[1];
  return [(1-v)*top[0]+v*bot[0]+(1-u)*lft[0]+u*rgt[0]-bx,
          (1-v)*top[1]+v*bot[1]+(1-u)*lft[1]+u*rgt[1]-by];
}

// ─── WebGL warp ───────────────────────────────────────────────────────────────
// Renders the design to a NEW canvas using GPU texture-mapping.
// No getImageData → zero CORS issues. Adjacent triangles share EXACT vertices
// → zero seams, zero stripes, permanent fix.
const VS = `
  attribute vec2 aPos;
  attribute vec2 aUV;
  varying vec2 vUV;
  uniform vec2 uRes;
  void main(){
    // canvas coords → WebGL clip space (flip y)
    vec2 c=(aPos/uRes)*2.0-1.0;
    gl_Position=vec4(c.x,-c.y,0,1);
    vUV=aUV;
  }
`;
const FS = `
  precision mediump float;
  uniform sampler2D uTex;
  varying vec2 vUV;
  void main(){ gl_FragColor=texture2D(uTex,vUV); }
`;

function mkShader(gl:WebGLRenderingContext, type:number, src:string){
  const s=gl.createShader(type)!;
  gl.shaderSource(s,src); gl.compileShader(s); return s;
}

function buildGLCanvas(
  src: HTMLCanvasElement,
  tl:P2,tr:P2,br:P2,bl:P2,
  mt:P2,mr:P2,mb:P2,ml:P2,
  dstW:number, dstH:number,
): HTMLCanvasElement {
  const out=document.createElement('canvas');
  out.width=dstW; out.height=dstH;
  const gl=out.getContext('webgl',{alpha:true,premultipliedAlpha:false}) as WebGLRenderingContext|null;
  if (!gl) return out; // WebGL not available — return blank (shouldn't happen)

  const prog=gl.createProgram()!;
  gl.attachShader(prog,mkShader(gl,gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,mkShader(gl,gl.FRAGMENT_SHADER,FS));
  gl.linkProgram(prog); gl.useProgram(prog);

  // Upload design as texture
  const tex=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);

  // Tessellate Coons patch into N×N grid
  // Adjacent triangles share exact vertex positions → zero seams
  const N=60;
  const pos:number[]=[], uvs:number[]=[], idx:number[]=[];
  for(let j=0;j<=N;j++){
    for(let i=0;i<=N;i++){
      const u=i/N, v=j/N;
      const p=coons(tl,tr,br,bl,mt,mr,mb,ml,u,v);
      pos.push(p[0],p[1]);
      uvs.push(u,v);
    }
  }
  for(let j=0;j<N;j++){
    for(let i=0;i<N;i++){
      const b=j*(N+1)+i;
      idx.push(b,b+1,b+N+2, b,b+N+2,b+N+1);
    }
  }

  function attrib(data:number[], name:string, sz:number){
    const buf=gl!.createBuffer();
    gl!.bindBuffer(gl!.ARRAY_BUFFER,buf);
    gl!.bufferData(gl!.ARRAY_BUFFER,new Float32Array(data),gl!.STATIC_DRAW);
    const loc=gl!.getAttribLocation(prog,name);
    gl!.enableVertexAttribArray(loc);
    gl!.vertexAttribPointer(loc,sz,gl!.FLOAT,false,0,0);
  }
  attrib(pos,'aPos',2);
  attrib(uvs,'aUV',2);

  const ibuf=gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);

  gl.uniform2f(gl.getUniformLocation(prog,'uRes'),dstW,dstH);
  gl.viewport(0,0,dstW,dstH);
  gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawElements(gl.TRIANGLES,idx.length,gl.UNSIGNED_SHORT,0);

  return out;
}

// ─── SVG → opaque canvas ──────────────────────────────────────────────────────
function svgToCanvas(svgStr:string, maxPx:number):Promise<HTMLCanvasElement|null>{
  return new Promise(resolve=>{
    const wm=svgStr.match(/\bwidth\s*=\s*["']?\s*([0-9.]+)/);
    const hm=svgStr.match(/\bheight\s*=\s*["']?\s*([0-9.]+)/);
    const vm=svgStr.match(/viewBox\s*=\s*["']([^"']*)["']/);
    let W=wm?parseFloat(wm[1]):0, H=hm?parseFloat(hm[1]):0;
    if((!W||!H)&&vm){const p=vm[1].trim().split(/[\s,]+/).map(Number);if(p.length===4){W=p[2];H=p[3];}}
    if(!W||W<1)W=800; if(!H||H<1)H=600;
    const fixed=svgStr
      .replace(/(<svg\b[^>]*?)\s+width\s*=\s*["'][^"']*["']/g,'$1')
      .replace(/(<svg\b[^>]*?)\s+height\s*=\s*["'][^"']*["']/g,'$1')
      .replace('<svg',`<svg width="${W}" height="${H}"`);
    const scale=Math.min(1,maxPx/Math.max(W,H));
    const cW=Math.max(1,Math.round(W*scale)), cH=Math.max(1,Math.round(H*scale));
    const blob=new Blob([fixed],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const c=document.createElement('canvas'); c.width=cW; c.height=cH;
      const cx=c.getContext('2d')!;
      cx.fillStyle='white'; cx.fillRect(0,0,cW,cH);
      cx.drawImage(img,0,0,cW,cH); resolve(c);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};
    img.src=url;
  });
}

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DFLT:CornerPoints={topLeft:[100,100],topRight:[300,100],bottomRight:[300,250],bottomLeft:[100,250]};
function midOf(pts:CornerPoints):MidPoints{
  const m=(a:P2,b:P2):P2=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return{midTop:m(pts.topLeft,pts.topRight),midRight:m(pts.topRight,pts.bottomRight),
         midBottom:m(pts.bottomLeft,pts.bottomRight),midLeft:m(pts.topLeft,pts.bottomLeft)};
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuildingCanvas({
  buildingPhotoUrl,designSvg,onCornersChange,onExport,setCanvasRef,initialCorners,
}:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const photoRef =useRef<HTMLImageElement|null>(null);
  const callbackRef=useCallback((node:HTMLCanvasElement|null)=>{
    canvasRef.current=node; if(setCanvasRef)setCanvasRef(node);
  },[setCanvasRef]);

  const [photo,     setPhoto]     =useState<HTMLImageElement|null>(null);
  const [designSrc, setDesignSrc] =useState<HTMLCanvasElement|null>(null);
  const [pts,       setPts]       =useState<CornerPoints>(DFLT);
  const [mids,      setMids]      =useState<MidPoints>(midOf(DFLT));
  const [hasSel,    setHasSel]    =useState(false);
  const [dragging,  setDragging]  =useState<HandleKey|null>(null);
  const [selStart,  setSelStart]  =useState<P2|null>(null);
  const [selEnd,    setSelEnd]    =useState<P2|null>(null);

  useEffect(()=>{
    if(initialCorners){setPts(initialCorners);setMids(midOf(initialCorners));setHasSel(true);}
  },[initialCorners]);

  useEffect(()=>{
    if(!buildingPhotoUrl)return;
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{photoRef.current=img;setPhoto(img);};
    img.src=buildingPhotoUrl;
  },[buildingPhotoUrl]);

  useEffect(()=>{
    if(!designSvg)return;
    svgToCanvas(designSvg,SRC_SIZE).then(c=>setDesignSrc(c));
  },[designSvg]);

  const drawDesign=useCallback((ctx:CanvasRenderingContext2D,p:CornerPoints,m:MidPoints,w:number,h:number)=>{
    if(!designSrc)return;
    const gl=buildGLCanvas(designSrc,
      p.topLeft,p.topRight,p.bottomRight,p.bottomLeft,
      m.midTop,m.midRight,m.midBottom,m.midLeft, w,h);
    ctx.globalCompositeOperation='multiply';
    ctx.globalAlpha=0.92;
    ctx.drawImage(gl,0,0);
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1.0;
  },[designSrc]);

  const render=useCallback(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!photo)return;
    const ctx=canvas.getContext('2d')!;
    const ratio=Math.min(1,MAX_CANVAS/photo.naturalWidth);
    canvas.width =Math.round(photo.naturalWidth *ratio);
    canvas.height=Math.round(photo.naturalHeight*ratio);
    ctx.drawImage(photo,0,0,canvas.width,canvas.height);

    // Selection box preview
    if(selStart&&selEnd){
      const x=Math.min(selStart[0],selEnd[0]),y=Math.min(selStart[1],selEnd[1]);
      const w=Math.abs(selEnd[0]-selStart[0]),h=Math.abs(selEnd[1]-selStart[1]);
      ctx.fillStyle='rgba(37,99,235,0.12)';ctx.fillRect(x,y,w,h);
      ctx.strokeStyle='#2563eb';ctx.lineWidth=Math.max(2,canvas.width*0.003);
      ctx.setLineDash([12,6]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);
      return;
    }
    if(!hasSel)return;

    // Render design via WebGL (stripe-free, CORS-safe)
    if(designSrc) drawDesign(ctx,pts,mids,canvas.width,canvas.height);

    // Curved border through on-curve midpoints
    const cpT=ctrl(pts.topLeft,mids.midTop,pts.topRight);
    const cpR=ctrl(pts.topRight,mids.midRight,pts.bottomRight);
    const cpB=ctrl(pts.bottomLeft,mids.midBottom,pts.bottomRight);
    const cpL=ctrl(pts.topLeft,mids.midLeft,pts.bottomLeft);
    ctx.strokeStyle='#2563eb';ctx.lineWidth=Math.max(2,canvas.width*0.003);
    ctx.setLineDash([10,5]);
    ctx.beginPath();
    ctx.moveTo(pts.topLeft[0],pts.topLeft[1]);
    ctx.quadraticCurveTo(cpT[0],cpT[1],pts.topRight[0],pts.topRight[1]);
    ctx.quadraticCurveTo(cpR[0],cpR[1],pts.bottomRight[0],pts.bottomRight[1]);
    ctx.quadraticCurveTo(cpB[0],cpB[1],pts.bottomLeft[0],pts.bottomLeft[1]);
    ctx.quadraticCurveTo(cpL[0],cpL[1],pts.topLeft[0],pts.topLeft[1]);
    ctx.stroke();ctx.setLineDash([]);

    // Corner handles (blue)
    const cr=canvas.getBoundingClientRect(),sc=canvas.width/(cr.width||canvas.width);
    const r=Math.round(6*sc);
    for(const [k,px,py] of [
      ['topLeft',pts.topLeft[0],pts.topLeft[1]],
      ['topRight',pts.topRight[0],pts.topRight[1]],
      ['bottomRight',pts.bottomRight[0],pts.bottomRight[1]],
      ['bottomLeft',pts.bottomLeft[0],pts.bottomLeft[1]],
    ] as [CornerKey,number,number][]){
      ctx.shadowColor='rgba(0,0,0,0.3)';ctx.shadowBlur=r;
      ctx.beginPath();ctx.arc(px,py,r+2,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();
      ctx.shadowColor='transparent';
      ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);
      ctx.fillStyle=dragging===k?'#1e40af':'#3b82f6';ctx.fill();
    }

    // Mid handles (orange) — drawn at on-curve positions (they ARE on the border)
    const rm=Math.round(5*sc);
    for(const [k,px,py] of [
      ['midTop',mids.midTop[0],mids.midTop[1]],
      ['midRight',mids.midRight[0],mids.midRight[1]],
      ['midBottom',mids.midBottom[0],mids.midBottom[1]],
      ['midLeft',mids.midLeft[0],mids.midLeft[1]],
    ] as [MidKey,number,number][]){
      ctx.shadowColor='rgba(0,0,0,0.2)';ctx.shadowBlur=rm;
      ctx.beginPath();ctx.arc(px,py,rm+2,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();
      ctx.shadowColor='transparent';
      ctx.beginPath();ctx.arc(px,py,rm,0,Math.PI*2);
      ctx.fillStyle=dragging===k?'#c2410c':'#f97316';ctx.fill();
    }
  },[photo,designSrc,pts,mids,hasSel,dragging,selStart,selEnd,drawDesign]);

  useEffect(()=>{render();},[render]);

  const toCanvas=(e:React.MouseEvent):P2=>{
    const c=canvasRef.current!,cr=c.getBoundingClientRect();
    return [Math.round((e.clientX-cr.left)*(c.width/cr.width)),Math.round((e.clientY-cr.top)*(c.height/cr.height))];
  };
  const hitHandle=(mx:number,my:number):HandleKey|null=>{
    if(!hasSel)return null;
    const c=canvasRef.current!,cr=c.getBoundingClientRect();
    const t=20*(c.width/cr.width);
    const all:[HandleKey,P2][]=[
      ['topLeft',pts.topLeft],['topRight',pts.topRight],
      ['bottomRight',pts.bottomRight],['bottomLeft',pts.bottomLeft],
      ['midTop',mids.midTop],['midRight',mids.midRight],
      ['midBottom',mids.midBottom],['midLeft',mids.midLeft],
    ];
    for(const [k,[px,py]] of all) if(Math.hypot(mx-px,my-py)<t)return k;
    return null;
  };

  const onMouseDown=(e:React.MouseEvent)=>{
    const [mx,my]=toCanvas(e);const h=hitHandle(mx,my);
    if(h){setDragging(h);return;}
    setHasSel(false);setSelStart([mx,my]);setSelEnd([mx,my]);
  };
  const onMouseMove=(e:React.MouseEvent)=>{
    const [mx,my]=toCanvas(e);
    if(dragging){
      if(['topLeft','topRight','bottomRight','bottomLeft'].includes(dragging)){
        const np={...pts,[dragging]:[mx,my] as P2};
        setPts(np);onCornersChange(np);
        setMids(prev=>snapMids(dragging as CornerKey,np,prev));
      } else {
        setMids(prev=>({...prev,[dragging]:[mx,my] as P2}));
      }
      return;
    }
    if(selStart)setSelEnd([mx,my]);
  };
  const onMouseUp=(e:React.MouseEvent)=>{
    if(selStart){
      const [mx,my]=toCanvas(e);
      if(Math.abs(mx-selStart[0])>8&&Math.abs(my-selStart[1])>8){
        const x=Math.min(selStart[0],mx),y=Math.min(selStart[1],my);
        const w=Math.abs(mx-selStart[0]),h=Math.abs(my-selStart[1]);
        const np:CornerPoints={topLeft:[x,y],topRight:[x+w,y],bottomRight:[x+w,y+h],bottomLeft:[x,y+h]};
        setPts(np);onCornersChange(np);setMids(midOf(np));setHasSel(true);
      }
    }
    setSelStart(null);setSelEnd(null);setDragging(null);
  };

  if(!buildingPhotoUrl)return(
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
      Upload eerst een foto van het pand
    </div>
  );

  return(
    <div>
      <p className="text-sm text-blue-600 mb-2">
        Sleep een gebied op de foto — versleep blauwe hoekpunten ·{' '}
        <span className="text-orange-500">oranje</span> = rand buigen
      </p>
      <canvas
        ref={callbackRef}
        className="w-full rounded-xl border border-gray-200"
        style={{cursor:dragging?'grab':'crosshair'}}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}    onMouseLeave={onMouseUp}
      />
      <div className="flex gap-3 mt-4">
        <button
          onClick={()=>{
            const ph=photoRef.current;if(!ph)return;
            const exp=document.createElement('canvas');
            const ratio=Math.min(1,MAX_CANVAS/ph.naturalWidth);
            exp.width=Math.round(ph.naturalWidth*ratio);
            exp.height=Math.round(ph.naturalHeight*ratio);
            const ctx=exp.getContext('2d')!;
            ctx.drawImage(ph,0,0,exp.width,exp.height);
            if(hasSel&&designSrc){drawDesign(ctx,pts,mids,exp.width,exp.height);}
            onExport(exp);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Exporteer preview als PNG
        </button>
        <button
          onClick={()=>setMids(midOf(pts))}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
        >
          Reset buiging
        </button>
      </div>
    </div>
  );
}

function snapMids(moved:CornerKey,np:CornerPoints,mids:MidPoints):MidPoints{
  const dm=midOf(np),u={...mids};
  const adj:Record<CornerKey,MidKey[]>={
    topLeft:['midTop','midLeft'],topRight:['midTop','midRight'],
    bottomRight:['midRight','midBottom'],bottomLeft:['midLeft','midBottom'],
  };
  for(const mk of adj[moved])
    if(Math.hypot(mids[mk][0]-dm[mk][0],mids[mk][1]-dm[mk][1])<20)u[mk]=dm[mk];
  return u;
}
