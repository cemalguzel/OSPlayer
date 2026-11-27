// Gerçek Electron/Cocoa/libmpv testi; ağ ve kullanıcı verisi kullanmaz.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if(process.platform!=='darwin') { console.error('Bu test macOS ve Cocoa gerektirir.'); process.exit(1); }
if(!process.versions.electron) {
 const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
 const result=require('node:child_process').spawnSync(require('electron'),[__filename],{env,stdio:'inherit',timeout:45000});
 if(result.error) console.error(result.error.message);
 console.error('Electron test sonucu:', {
  status: result.status,
  signal: result.signal,
  error: result.error?.message ?? null
});
 process.exit(result.error?1:(result.status??1));
} else {
 const {app,BrowserWindow}=require('electron');
 app.setAppPath(path.resolve(__dirname, '..'));
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'osplayer-mpv-')),video=path.join(directory,'ornek.y4m');
 const chunks=[Buffer.from('YUV4MPEG2 W64 H64 F30:1 Ip A1:1 C420jpeg\n')];
 for(let i=0;i<150;i++) chunks.push(Buffer.from('FRAME\n'),Buffer.alloc(4096,40+i),Buffer.alloc(1024,90),Buffer.alloc(1024,180));
 fs.writeFileSync(video,Buffer.concat(chunks));
 let player,window,interval,finished=false;
 const finish=(code,message)=>{
  if(finished)return; finished=true; clearInterval(interval);
  try{player?.quit();}catch(error){console.error(error);code=1;}
  fs.rmSync(directory,{recursive:true,force:true});console.log(message);
  setTimeout(()=>app.exit(code),700);
 };
 app.whenReady().then(async()=>{
  window=new BrowserWindow({width:640,height:480,show:true});
  await window.loadURL('data:text/html,<body style="background:black"></body>');
  const {MpvNative}=require('../dist-electron/mpv-native.js');let loaded=false;
  player=new MpvNative(event=>{
   if(event.event==='file-loaded')loaded=true;
   if(event.event==='end-file'&&event.data?.error<0)finish(1,'FAIL: MPV video açılışı.');
  },'OSPlayer-macOS-test');
  const handle=window.getNativeWindowHandle().readBigUInt64LE();
  await player.start({x:0,y:0,width:640,height:400,wid:Number(handle)});
  await player.load(video);const started=Date.now();
  interval=setInterval(async()=>{try{
   const position=player.addon.getPropertyDouble(player.handle,'time-pos');
   const width=player.addon.getPropertyDouble(player.handle,'video-params/w');
   if(loaded&&position>0.5&&width===64){
    await player.command(['set_property','volume',37]);
    if(player.addon.getPropertyDouble(player.handle,'volume')!==37)throw Error('Ses seviyesi uygulanamadı.');
    await player.stop();
    finish(0,'PASS: Cocoa MPV video açılışı, zaman ilerlemesi, video boyutu, ses kontrolü ve durdurma.');
   }else if(Date.now()-started>15000)finish(1,'FAIL: MPV zaman aşımı.');
  }catch(error){finish(1,'FAIL: '+error.message);}},100);
 }).catch(error=>finish(1,'FAIL: '+error.stack));
}
