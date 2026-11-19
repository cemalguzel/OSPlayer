const test=require('node:test');const assert=require('node:assert/strict');
const {eligible,mediaBounds,validAd}=require('../dist-electron/ad-policy');
const base={id:1,version:1,delivery_id:'id',type:'center',duration:10,repeat_interval:60,media_width:1920,media_height:300,display_screens:['home','live','movies','series']};
for(const screen of ['live','movies','series']) {
 test(screen+' bilgi çubuğu açıkken gizli',()=>assert.equal(eligible(base,{screen,fullscreen:true,controls:true}),false));
 test(screen+' önizlemede gizli',()=>assert.equal(eligible(base,{screen,fullscreen:false,controls:false}),false));
 test(screen+' tam ekranda uygun',()=>assert.equal(eligible(base,{screen,fullscreen:true,controls:false}),true));
}
test('ana ekran ve ekran hedefi',()=>{assert(eligible(base,{screen:'home',fullscreen:false,controls:true}));assert(!eligible({...base,display_screens:['movies']},{screen:'home',fullscreen:true,controls:false}));});
test('zamanlama',()=>{assert(!eligible({...base,ends_at:'2000-01-01'},{screen:'home',fullscreen:false,controls:false}));assert(!eligible({...base,starts_at:'2099-01-01'},{screen:'home',fullscreen:false,controls:false}));});
for(const [width,height] of [[1280,720],[1920,1080],[800,600]])test('tam alt genişlik '+width,()=>{const b=mediaBounds({...base,position:'bottom_full'},{x:10,y:30,width,height});assert.equal(b.width,width);assert.equal(b.x,10);assert.equal(b.y+b.height,30+height);assert(Math.abs(b.width/b.height-1920/300)<.03);});
test('özel yüzde ve köşe',()=>{const b=mediaBounds({...base,position:'top_right',width_percent:20,height_percent:30},{x:0,y:0,width:1000,height:600});assert.equal(b.width,200);assert.equal(b.x,800);assert.equal(b.y,0);});
test('özgün boyut aşılmaz',()=>{const b=mediaBounds({...base,media_width:100,media_height:100,sizing_mode:'natural'},{x:0,y:0,width:1920,height:1080});assert.equal(b.width,100);});
test('bilinmeyen ekran ve veri',()=>{assert(!eligible(base,{screen:'settings',fullscreen:true,controls:false}));assert(!validAd({...base,duration:-1}));assert(validAd(base));});
