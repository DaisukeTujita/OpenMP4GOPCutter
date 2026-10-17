import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVideoThumbnail } from '../thumbnails';
import type { GopRange, Mp4Analysis } from '../media';
export const formatTime=(t:number)=>{const ms=Math.round(Math.max(0,t)*1000);return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
interface Props {previewURL:string;analysis:Mp4Analysis;range:GopRange;currentTime:number;disabled:boolean;onSeek:(t:number)=>void;onIn:(t:number)=>void;onOut:(t:number)=>void}
export function GopTimeline({previewURL,analysis,range,currentTime,disabled,onSeek,onIn,onOut}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null),scroll=useRef<HTMLDivElement>(null),drag=useRef<'in'|'out'|'seek'|null>(null);
  const [zoom,setZoom]=useState(1),[width,setWidth]=useState(800),[scrollLeft,setScrollLeft]=useState(0);
  const [hover,setHover]=useState<{time:number;left:number;top:number;above:boolean}|null>(null);
  const thumbnails=useVideoThumbnail(previewURL,!disabled);
  const hide=()=>{setHover(null);thumbnails.clear();};
  useEffect(()=>{setHover(null);thumbnails.clear();},[disabled,previewURL,thumbnails.clear]);
  useEffect(()=>{const dismiss=()=>{setHover(null);thumbnails.clear();};window.addEventListener('scroll',dismiss,true);window.addEventListener('resize',dismiss);return()=>{window.removeEventListener('scroll',dismiss,true);window.removeEventListener('resize',dismiss);};},[thumbnails.clear]);

  useEffect(()=>{const el=scroll.current;if(!el)return;const ro=new ResizeObserver(()=>setWidth(el.clientWidth));ro.observe(el);return()=>ro.disconnect();},[]);
  const total=Math.max(300,width)*zoom,x=(t:number)=>20+t/analysis.duration*(total-40);
  const getTime=(clientX:number)=>Math.min(analysis.duration,Math.max(0,(clientX-(canvas.current?.getBoundingClientRect().left??0)-20)/(total-40)*analysis.duration));
  useEffect(()=>{
    const el=canvas.current;if(!el)return;const ctx=el.getContext('2d');if(!ctx)return;
    const dpr=window.devicePixelRatio||1;el.width=Math.round(total*dpr);el.height=150*dpr;ctx.scale(dpr,dpr);ctx.font='11px ui-monospace, monospace';
    ctx.fillStyle='#153c64';ctx.fillRect(x(range.start),35,x(range.end)-x(range.start),80);
    ctx.strokeStyle='#2a3a51';for(const y of [65,115]){ctx.beginPath();ctx.moveTo(scrollLeft,y);ctx.lineTo(scrollLeft+width,y);ctx.stroke();}
    for(const g of analysis.gops){const px=x(g.start);if(px<scrollLeft-80||px>scrollLeft+width+80)continue;ctx.strokeStyle='#67adff';ctx.beginPath();ctx.moveTo(px,42);ctx.lineTo(px,103);ctx.stroke();ctx.fillStyle='#8ebeff';ctx.fillText(`G${g.index+1}`,px+4,61);ctx.fillStyle='#8c9eb8';ctx.fillText(formatTime(g.start),px+4,135);}
    ctx.fillStyle='#8c9eb8';ctx.fillText('EOF',x(analysis.duration)-25,135);
    for(const [time,label,color] of [[range.start,'IN','#75b4ff'],[range.end,'OUT','#65dfb4']] as const){const px=x(time);ctx.fillStyle=color;ctx.fillRect(px-19,6,38,24);ctx.fillStyle='#071320';ctx.fillText(label,px-12,22);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(px,30);ctx.lineTo(px,115);ctx.stroke();}
    ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(x(currentTime),34);ctx.lineTo(x(currentTime),115);ctx.stroke();
  },[analysis,range,currentTime,total,width,scrollLeft]);
  const show=(e:React.PointerEvent<HTMLCanvasElement>)=>{
    if(disabled||!previewURL)return;
    const t=getTime(e.clientX),rect=e.currentTarget.getBoundingClientRect(),above=rect.top>185;
    setHover({time:t,left:Math.min(Math.max(108,e.clientX),window.innerWidth-108),top:above?rect.top-10:e.clientY+20,above});
    thumbnails.request(t);
  };
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(disabled)return;show(e);if(!drag.current)return;const t=getTime(e.clientX);if(drag.current==='in')onIn(Math.min(t,analysis.duration-1e-9));else if(drag.current==='out')onOut(t);else onSeek(t);};
  return <section className="timeline"><div className="toolbar"><span><b className="dot gop"/>GOP境界（IDR）</span><label>表示倍率 <select aria-label="表示倍率" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[1,4,16].map(n=><option key={n} value={n}>{n===1?'全体':`${n}倍`}</option>)}</select></label></div>
    <div className="timeline-scroll" ref={scroll} onScroll={e=>setScrollLeft(e.currentTarget.scrollLeft)}><canvas ref={canvas} style={{width:total,height:150}} aria-label="GOPシークバー" onPointerDown={e=>{if(disabled)return;const px=e.clientX-e.currentTarget.getBoundingClientRect().left,py=e.clientY-e.currentTarget.getBoundingClientRect().top;const di=Math.abs(px-x(range.start)),doo=Math.abs(px-x(range.end));drag.current=py<32&&Math.min(di,doo)<25?(di<=doo?'in':'out'):'seek';e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={move} onPointerEnter={show} onPointerLeave={()=>{if(!drag.current)hide();}} onPointerUp={e=>{drag.current=null;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)hide();}} onPointerCancel={()=>{drag.current=null;hide();}}/></div>
    <p className="hint">マウスを重ねるとサムネイル表示。中央をドラッグしてシーク。IN / OUTラベルはGOP境界へスナップします。</p>
    {hover&&!disabled&&createPortal(<div className={`thumbnail-tooltip ${hover.above?'above':'below'}`} role="tooltip" aria-label="タイムラインのサムネイル" style={{left:hover.left,top:hover.top}}>
      <div className="thumbnail-image">{thumbnails.thumbnail?<img src={thumbnails.thumbnail.dataUrl} alt={`${formatTime(thumbnails.thumbnail.time)}付近の映像`}/>:<span>{thumbnails.error?'画像を取得できません':thumbnails.loading?'取得中…':'サムネイル'}</span>}</div>
      <strong>{formatTime(hover.time)}</strong>
      {thumbnails.thumbnail&&<small>画像：約 {formatTime(thumbnails.thumbnail.time)}</small>}
      {thumbnails.error&&<small>{thumbnails.error}</small>}
    </div>,document.body)}
  </section>;
}
