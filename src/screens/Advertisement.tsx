import { useEffect, useRef, useState } from 'react';
import type { Ad } from '../../electron/ad-policy';
function Ticker({ad, visible}: {ad: Ad; visible: boolean}) {
 const text = useRef<HTMLSpanElement>(null);
 const speed = useRef(60);
 speed.current = Number.isFinite(Number(ad.speed)) && Number(ad.speed) > 0 ? Number(ad.speed) : 60;
 useEffect(() => {
  const element = text.current;
  if (!element || !visible) return;
  let frame = 0, previous = 0, x = element.parentElement!.clientWidth;
  const tick = (now: number) => {
   if (previous) x -= speed.current * element.parentElement!.clientWidth / 1920 * ((now - previous) / 1000);
   previous = now;
   if (x < -element.getBoundingClientRect().width) x = element.parentElement!.clientWidth;
   element.style.transform = `translateX(${x}px)`;
   frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
 }, [visible, ad.id, ad.text]);
 return <span ref={text} style={{display:'inline-block',whiteSpace:'nowrap',fontSize:'clamp(16px,3vh,32px)',willChange:'transform'}}>{ad.text}</span>;
}
export default function AdvertisementScreen(){
 const [payload,setPayload]=useState<{ad:Ad;data?:string}|null>(null);const [visible,setVisible]=useState(false);const video=useRef<HTMLVideoElement>(null);
 useEffect(()=>{
 document.body.style.background='transparent';document.documentElement.style.background='transparent';
 const off=window.osplayer.onEvent('advertising:payload',p=>setPayload(p as typeof payload));
 const show=window.osplayer.onEvent('advertising:show',()=>{setVisible(true);void video.current?.play().catch(()=>window.osplayer.advertising.action('error'));});
 return ()=>{off();show();video.current?.pause();};},[]);
 useEffect(()=>{if(payload?.ad.type==='ticker')window.osplayer.advertising.ready();},[payload]);
 if(!payload)return null;const {ad,data}=payload;const closeable=ad.type==='video'||(ad.type==='center'&&ad.media_mime!=='image/gif');
 const color=(v:string|undefined,fallback:string)=>/^#[0-9a-f]{6,8}$/i.test(v??'')?v:fallback;
 return <div style={{width:'100vw',height:'100vh',position:'relative',overflow:'hidden',opacity:visible?1:0,filter:!visible&&ad.effect==='blur'?'blur(12px)':'none',transition:ad.effect==='none'?'none':'opacity .4s, filter .4s'}}>
 {ad.type==='ticker'?<div style={{height:'100%',display:'flex',alignItems:'center',background:`linear-gradient(90deg,${color(ad.background_color,'#000000')},${color(ad.background_end,ad.background_color??'#000000')})`,color:color(ad.text_color,'#ffffff')}}><Ticker ad={ad} visible={visible}/></div>:
 ad.type==='video'?<video ref={video} src={data} muted playsInline preload="auto" onLoadedData={()=>window.osplayer.advertising.ready()} onEnded={()=>window.osplayer.advertising.action('completed')} onError={()=>window.osplayer.advertising.action('error')} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:
 <img src={data} alt={ad.title??'Reklam'} onLoad={()=>window.osplayer.advertising.ready()} onError={()=>window.osplayer.advertising.action('error')} style={{width:'100%',height:'100%',objectFit:'contain'}}/>}
 {closeable&&<button aria-label="Reklamı kapat" onClick={()=>window.osplayer.advertising.action('closed')} style={{position:'absolute',top:0,right:0,width:44,height:44,border:'1px solid white',background:'var(--color-bg-surface)',color:'white',fontSize:24,cursor:'pointer'}}>×</button>}
 </div>;
}
