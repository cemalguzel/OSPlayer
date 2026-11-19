import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID, createHash } from 'crypto';
import { eligible, mediaBounds, validAd, Ad, AdContext, PANEL_BASE } from './ad-policy';

// Aynı panel sözleşmesi; medya başlıkları yalnız bu kökene gönderilir.
export const AD_PANEL=PANEL_BASE;
export function installAdvertising(main: BrowserWindow, preload: string, load: (win:BrowserWindow,hash:string)=>void,
 device:()=>{mac:string;deviceKey:string}, userAgent:string) {
 let context:AdContext={screen:'none',fullscreen:false,controls:true};
 let active:{ad:Ad;impression:string;window:BrowserWindow;started:boolean;data?:string;accepting?:boolean}|null=null;
 let busy=false, disposed=false; const last=new Map<string,number>();
 let abort:AbortController|null=null, timer:ReturnType<typeof setTimeout>|undefined;
 const foreground=()=>!disposed&&!main.isDestroyed()&&main.isVisible()&&!main.isMinimized()&&main.isFocused();
 const key=(a:Ad)=>`${a.id}:${a.version}`;
 const headers=()=>{const d=device();return {'x-device-mac':d.mac,'x-device-key':d.deviceKey,'User-Agent':userAgent};};
 async function request(url:string,body?:unknown,binary=false): Promise<any> {
 const u=new URL(url);if(u.origin!==AD_PANEL||!u.pathname.startsWith('/api/device/advertisements'))throw Error('Geçersiz reklam adresi');
 const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),15000);abort=ctl;
 try {const res=await fetch(url,{method:body?'POST':'GET',headers:{...headers(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:ctl.signal,redirect:'error'});
 if(!res.ok)throw Error('Reklam isteği reddedildi');
 if(binary){const chunks:Uint8Array[]=[];let size=0;if(!res.body)throw Error('Medya yok');for await(const c of res.body as any){size+=c.length;if(size>21*1024*1024){ctl.abort();throw Error('Medya çok büyük');}chunks.push(c);}return {bytes:Buffer.concat(chunks),mime:res.headers.get('content-type')?.split(';')[0]};}
 return await res.json();}finally{clearTimeout(timeout);if(abort===ctl)abort=null;}
 }
 async function event(a:NonNullable<typeof active>,state:string) {
 return request(`${AD_PANEL}/api/device/advertisements/events`,{delivery_id:a.ad.delivery_id,impression_id:a.impression,state});
 }
 function finish(state='closed') {
 const a=active;active=null;clearTimeout(timer);if(a){last.set(key(a.ad),Date.now());if(last.size>300)last.delete(last.keys().next().value!);if(!a.window.isDestroyed())a.window.destroy();void event(a,state).catch(()=>{});}
 }
 function position(){if(active&&!main.isDestroyed())active.window.setBounds(mediaBounds(active.ad,main.getContentBounds()));}
 async function poll(){
 if(busy||!foreground()||context.screen==='none')return;busy=true;
 try {
 const res=await request(`${AD_PANEL}/api/device/advertisements`);
 const ads:Array<Ad>=Array.isArray(res.advertisements)?res.advertisements.filter(validAd):[];
 // Bir gösterimin kendi sayacı liste sınırına ulaşsa da, süresi bitene kadar devam eder.
 if(active){
 const current=active;
 const updated=ads.find(a=>key(a)===key(current.ad));
 if(updated && updated.speed!==current.ad.speed){current.ad={...current.ad,speed:updated.speed};current.window.webContents.send('advertising:payload',{ad:current.ad,data:current.data});}

 if(!eligible(current.ad,context)||ads.some(a=>a.id===current.ad.id&&a.version!==current.ad.version)){finish();return;}
 if(!ads.some(a=>key(a)===key(current.ad))){
  // Liste sayaç limitinden dolayı boş olabilir; hazırlık doğrulaması yayın durdurmayı ayırır.
  try{await event(current,'preparing');}catch{if(active===current)finish();}
 }
 return;
 }
 const ad=ads.find(a=>eligible(a,context)&&Date.now()-(last.get(key(a))??0)>=Math.max(5,Number(a.repeat_interval)||0)*1000);
 if(!ad)return;
 const a={ad,impression:randomUUID(),started:false,window:null as unknown as BrowserWindow,data:undefined as string|undefined};
 await event(a,'preparing');
 if(ad.type!=='ticker'){
 const media=await request(ad.media_url??'',undefined,true);
 if(!['image/webp','image/png','image/jpeg','image/gif','video/mp4'].includes(media.mime??'')||media.mime!==ad.media_mime)throw Error('Medya türü geçersiz');
 if(ad.media_sha256&&createHash('sha256').update(media.bytes).digest('hex')!==ad.media_sha256)throw Error('Medya doğrulanamadı');
 a.data=`data:${media.mime};base64,${media.bytes.toString('base64')}`;
 }
 if(!foreground()||!eligible(ad,context))return;
 a.window=new BrowserWindow({parent:main,...mediaBounds(ad,main.getContentBounds()),frame:false,transparent:true,show:false,focusable:false,skipTaskbar:true,resizable:false,hasShadow:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 active=a;a.window.setMenu(null);a.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 a.window.webContents.on('will-navigate',e=>e.preventDefault());
 a.window.webContents.once('did-finish-load',()=>a.window.webContents.send('advertising:payload',{ad,data:a.data}));
 load(a.window,'/advertisement');
 timer=setTimeout(()=>{if(active===a)finish('error');},20000);
 }catch{if(active)finish('error');}finally{busy=false;}
 }
 const onContext=(e:Electron.IpcMainEvent,c:AdContext)=>{if(e.sender!==main.webContents||!c||typeof c.screen!=='string')return;context={screen:c.screen,fullscreen:!!c.fullscreen,controls:!!c.controls};if(active&&!eligible(active.ad,context))finish();void poll();};
 const onReady=async(e:Electron.IpcMainEvent)=>{
 const a=active;if(!a||e.sender!==a.window.webContents||a.started||a.accepting)return;a.accepting=true;
 try{const reply=await event(a,'started');if(active!==a)return;
 if(reply.accepted!==true||!foreground()||!eligible(a.ad,context)){finish();return;}
 a.started=true;clearTimeout(timer);position();a.window.showInactive();a.window.moveTop();a.window.webContents.send('advertising:show');
 const closeable=a.ad.type==='video'||(a.ad.type==='center'&&a.ad.media_mime!=='image/gif');if(!closeable)a.window.setIgnoreMouseEvents(true,{forward:true});
 timer=setTimeout(()=>finish('completed'),Math.min(86400,Number(a.ad.duration))*1000);
 }catch{if(active===a)finish('error');}
 };
 const onAction=(e:Electron.IpcMainEvent,state:string)=>{if(active&&e.sender===active.window.webContents&&['closed','completed','error'].includes(state))finish(state);};
 ipcMain.on('advertising:context',onContext);ipcMain.on('advertising:ready',onReady);ipcMain.on('advertising:action',onAction);
 const blur=()=>{abort?.abort();finish();};main.on('blur',blur);main.on('minimize',blur);main.on('focus',()=>void poll());main.on('move',position);main.on('resize',position);
 const interval=setInterval(()=>{if(active&&(!foreground()||!eligible(active.ad,context)))finish();else if(active?.started)active.window.moveTop();void poll();},5000);
 main.once('closed',()=>{disposed=true;abort?.abort();finish();clearInterval(interval);ipcMain.removeListener('advertising:context',onContext);ipcMain.removeListener('advertising:ready',onReady);ipcMain.removeListener('advertising:action',onAction);});
}