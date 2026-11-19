// Hedef Mac üzerinde kurulu MPV ve geçişli dylib bağımlılıklarını .app içine alır.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=async context=>{
 if(process.platform!=='darwin') throw Error('macOS paketleme macOS üzerinde çalıştırılmalı.');
 const root=path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app','Contents','Frameworks');
 fs.mkdirSync(root,{recursive:true});
 const expectedArch=process.arch;
 const source=process.env.OSPLAYER_LIBMPV||['/opt/homebrew/lib/libmpv.2.dylib','/usr/local/lib/libmpv.2.dylib'].find(fs.existsSync);
 if(!source) throw Error('MPV dylib bulunamadı: OSPLAYER_LIBMPV belirtin.');
 const seen=new Map();
 function bundle(file){
  file=fs.realpathSync(file);if(seen.has(file))return seen.get(file);
  execFileSync('lipo',['-verify_arch',expectedArch==='x64'?'x86_64':expectedArch,file]);
  const name=path.basename(file),dest=path.join(root,name);
  if([...seen.values()].includes(name)) throw Error('Dylib dosya adı çakışması: '+name);
  seen.set(file,name);fs.copyFileSync(file,dest);fs.chmodSync(dest,0o755);
  const deps=execFileSync('otool',['-L',file],{encoding:'utf8'}).split('\n').slice(1).map(l=>l.trim().split(' (')[0]).filter(Boolean);
  for(const dep of deps){
   if(dep.startsWith('/System/')||dep.startsWith('/usr/lib/'))continue;
   let resolved=dep.startsWith('@loader_path/')?path.join(path.dirname(file),dep.slice(13)):dep;
   if(dep.startsWith('@rpath/')) resolved=[path.join(path.dirname(file),dep.slice(7)),'/opt/homebrew/lib/'+dep.slice(7),'/usr/local/lib/'+dep.slice(7)].find(fs.existsSync);
   if(!resolved||!fs.existsSync(resolved))throw Error('Dylib bağımlılığı bulunamadı: '+dep);
   if(fs.realpathSync(resolved)===file)continue;
   const child=bundle(resolved);execFileSync('install_name_tool',['-change',dep,'@loader_path/'+child,dest]);
  }
  execFileSync('install_name_tool',['-id','@rpath/'+name,dest]);return name;
 }
 const main=bundle(source);
 if(main!=='libmpv.2.dylib')fs.symlinkSync(main,path.join(root,'libmpv.2.dylib'));
};
