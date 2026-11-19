/** Panelin schema_version=1 reklam sözleşmesi. */
export const PANEL_BASE = 'https://osplayer.com.tr';
export interface Ad {
 title?: string; id: number; version: number; delivery_id: string; type: 'ticker'|'bottom'|'center'|'video';
 text?: string; text_color?: string; background_color?: string; background_end?: string;
 speed?: number; duration: number; repeat_interval: number; position?: string; effect?: string;
 media_url?: string; media_mime?: string; media_sha256?: string; media_width?: number; media_height?: number;
 width_percent?: number; height_percent?: number; sizing_mode?: string;
 display_screens?: string[]; display_screen?: string; starts_at?: string; ends_at?: string;
}
export interface AdContext { screen: string; fullscreen: boolean; controls: boolean; }
export function eligible(ad: Ad, context: AdContext, now=Date.now()) {
 const screens=ad.display_screens ?? (ad.display_screen==='home'?['home']:ad.display_screen==='player'?['live','movies','series']:['home','live','movies','series']);
 return ['ticker','bottom','center','video'].includes(ad.type) && ['home','live','movies','series'].includes(context.screen) && screens.includes(context.screen)
 && (context.screen==='home'||context.fullscreen&&!context.controls)
 && (!ad.starts_at || Date.parse(ad.starts_at)<=now) && (!ad.ends_at || Date.parse(ad.ends_at)>now);
}
export function mediaBounds(ad: Ad, area: {x:number;y:number;width:number;height:number}) {
 const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
 const full=ad.position==='bottom_full'||ad.type==='bottom'&&!ad.position;
 let width=area.width, height=Math.min(64,area.height);
 if(ad.type!=='ticker') {
 const iw=Math.max(1,Number(ad.media_width)||640),ih=Math.max(1,Number(ad.media_height)||360);
 let scale=full?area.width/iw:Math.min(area.width*clamp(Number(ad.width_percent)||40,1,100)/100/iw,area.height*clamp(Number(ad.height_percent)||60,1,100)/100/ih);
 if(!full&&ad.sizing_mode==='natural')scale=Math.min(1,scale);
 scale=Math.min(scale,area.height/ih);width=Math.round(iw*scale);height=Math.round(ih*scale);
 }
 const pos=ad.type==='ticker'?'bottom_full':ad.position??'center';
 const x=pos.includes('left')?area.x:pos.includes('right')?area.x+area.width-width:area.x+(area.width-width)/2;
 const y=pos.includes('top')?area.y:pos.includes('bottom')?area.y+area.height-height:area.y+(area.height-height)/2;
 return {x:Math.round(x),y:Math.round(y),width:Math.max(1,width),height:Math.max(1,height)};
}
export function validAd(value: unknown): value is Ad {
 const a=value as Ad;
 return !!a && Number.isSafeInteger(a.id) && Number.isSafeInteger(a.version) && typeof a.delivery_id==='string'
 && ['ticker','bottom','center','video'].includes(a.type) && Number(a.duration)>0 && Number(a.duration)<=86400;
}
