import React from 'react';
export function VolumeControl({muted,volume,onMute,onVolume}:{muted?:boolean;volume:number;onMute:()=>void;onVolume:(value:number)=>void}) {
 return <div style={{display:'inline-flex',alignItems:'center',gap:10,flexShrink:0}} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
 <button type="button" aria-label={muted?'Sesi aç':'Sesi kapat'} aria-pressed={!!muted} title={muted?'Sesi aç (M)':'Sesi kapat (M)'} onClick={onMute} style={{width:44,height:44,borderRadius:'50%',border:'1px solid #ffffff30',background:'#ffffff14',color:'#d1d5db',display:'grid',placeItems:'center',cursor:'pointer'}}>
 <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z"/>{muted?<path d="m16 8 5 8m0-8-5 8" fill="none" stroke="currentColor" strokeWidth="2"/>:<path d="M16 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" fill="none" stroke="currentColor" strokeWidth="2"/>}</svg></button>
 <input className="volume-range" aria-label="Ses seviyesi" type="range" min="0" max="100" value={muted?0:Math.min(100,volume)} onChange={e=>onVolume(Number(e.target.value))} style={{width:'clamp(58px,6vw,96px)',background:`linear-gradient(to right,#ffdf00 ${muted?0:Math.max(0,Math.min(100,volume))}%,#858585 ${muted?0:Math.max(0,Math.min(100,volume))}%)`,cursor:'pointer'}}/>
 </div>;
}

export function FullscreenControl({onClick}:{onClick:()=>void}) {return <button type="button" aria-label="Tam ekran" title="Tam ekran" onClick={e=>{e.stopPropagation();onClick();}} style={{width:42,height:42,borderRadius:'50%',border:'1px solid #ffffff30',background:'#ffffff14',color:'#d1d5db',display:'grid',placeItems:'center',cursor:'pointer',flexShrink:0}}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h7v3H6v4H3V3zm11 0h7v7h-3V6h-4V3zM3 14h3v4h4v3H3v-7zm15 0h3v7h-7v-3h4v-4z"/></svg></button>}
