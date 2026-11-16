/* Store publication keeps progress and every unmet-TOP page in a single bounded PNG. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),real=process.env.REAL_CANVAS?require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js'):null;
const source=fs.readFileSync(new URL('../operations/store-publication-image.js',import.meta.url),'utf8');
function harness(){
 const canvases=[],decoded=[],closed=[],urls=[],revoked=[];let failExport=false,failContext=false;
 const x={window:null,console,Blob,document:{fonts:{ready:Promise.resolve()},createElement(tag){
  assert.equal(tag,'canvas');const native=real?.createCanvas(1,1),draws=[],texts=[];let context;
  const canvas={width:300,height:150,getContext(){if(failContext)return null;if(native){native.width=this.width;native.height=this.height;const ctx=native.getContext('2d');context=ctx;return new Proxy(ctx,{get(target,key){if(key==='drawImage')return (image,...args)=>{draws.push({id:image.id,...Object.fromEntries(['x','y','width','height'].map((k,i)=>[k,args[i]]))});return target.drawImage(image.native||image,...args);};if(key==='fillText')return (value,...args)=>{texts.push(value);return target.fillText(value,...args);};const value=target[key];return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}});}context={drawImage(image,x,y,width,height){draws.push({id:image.id,x,y,width,height});},fillText(value){texts.push(value);},fillRect(){}};return context;},toBlob(callback,type){if(failExport){callback(null);return;}if(native)native.encode('png').then(bytes=>callback(new Blob([bytes],{type})));else callback(new Blob([JSON.stringify({width:this.width,height:this.height,draws,texts})],{type}));}};
  canvas.draws=draws;canvas.texts=texts;canvases.push(canvas);return canvas;
 }},async createImageBitmap(blob){const spec=JSON.parse(await blob.text());if(spec.fail)throw Error('decode error');const bitmap={...spec,close(){closed.push(spec.id);}};if(real){const native=real.createCanvas(spec.width,spec.height);const ctx=native.getContext('2d');ctx.fillStyle=spec.color||'#f5eafb';ctx.fillRect(0,0,spec.width,spec.height);ctx.fillStyle='#542c77';ctx.font='bold 50px sans-serif';ctx.fillText(spec.label||spec.id,50,90);bitmap.native=native;}decoded.push(spec.id);return bitmap;},URL:{createObjectURL(blob){const url='test:'+urls.length;urls.push({url,blob});return url;},revokeObjectURL(url){revoked.push(url);}}};
 x.window=x;vm.createContext(x);vm.runInContext(source,x,{filename:'store-publication-image.js'});
 return {x,U:x.WBStorePublicationImage,canvases,decoded,closed,urls,revoked,setFailExport:value=>failExport=value,setFailContext:value=>failContext=value};
}
const blob=(id,width,height,extra={})=>new Blob([JSON.stringify({id,width,height,...extra})],{type:'image/png'});
const progress=blob('progress',3000,1854,{label:'Store meeting progress',color:'#eee5f5'}),unmet=[blob('top-page-1',1660,1200,{label:'Unmet TOP page 1',color:'#fffdf9'}),blob('top-page-2',1660,720,{label:'Unmet TOP page 2',color:'#f1ebf8'})];
{
 const {U,canvases,closed}=harness(),plan=U.layout({progress:{width:3000,height:1854},unmet:[{width:1660,height:1200},{width:1660,height:720}]}),png=await U.combine({progress,unmet});
 assert.equal(png.type,'image/png');assert.equal(canvases.length,1,'only the final output canvas is allocated');
 const canvas=canvases[0];assert.equal(canvas.width,3000);assert.equal(canvas.height,plan.height);assert.equal(canvas.draws.length,3,'every source page is retained');
 assert.deepEqual(canvas.draws.map(d=>d.id),['progress','top-page-1','top-page-2']);
 for(let i=0;i<plan.panels.length;i++){const p=plan.panels[i],draw=canvas.draws[i];assert.deepEqual(draw,{id:['progress','top-page-1','top-page-2'][i],x:0,y:p.y,width:p.width,height:p.height});assert.ok(p.width>=p.nativeWidth,'source pages are never downscaled');}
 assert.equal(canvas.draws[0].height,1854,'native-width progress retains its original resolution');assert.equal(plan.panels[1].y,1854+48);assert.equal(plan.panels[2].y,plan.panels[1].y+plan.panels[1].height+48);
 assert.deepEqual(closed,['progress','top-page-1','top-page-2'],'all decoded image bitmaps are released after export');
 if(real&&process.env.PREVIEW_PATH){fs.writeFileSync(process.env.PREVIEW_PATH,Buffer.from(await png.arrayBuffer()));console.log('RENDER '+process.env.PREVIEW_PATH+' '+canvas.width+'x'+canvas.height);}
}
{
 const {U,canvases}=harness();await U.combine({progress,unmet:[]});assert.equal(canvases[0].draws.length,1);assert.ok(canvases[0].texts.includes('本月未面见TOP房明细'));assert.ok(canvases[0].texts.includes('当前范围暂无本月未面见TOP房。'),'an explicit empty input is represented, not silently omitted');
 const emptyPage=blob('source-empty-state',1660,430);await U.combine({progress,unmet:[emptyPage]});assert.deepEqual(canvases[1].draws.map(d=>d.id),['progress','source-empty-state']);assert.equal(canvases[1].texts.length,0,'a provided source empty-state page is kept verbatim');
}
{
 const {U}=harness();assert.throws(()=>U.layout({progress:{width:0,height:100}}),/尺寸无效/);assert.throws(()=>U.layout({progress:{width:30001,height:1}}),/尺寸无效/);assert.throws(()=>U.layout({progress:{width:1.5,height:100}}),/尺寸无效/);
 assert.throws(()=>U.layout({progress:{width:1000,height:29000},unmet:[{width:1000,height:1000}]}),/超过单张图片尺寸上限/,'the edge limit is enforced even below the pixel limit');
 assert.throws(()=>U.layout({progress:{width:3000,height:22000},unmet:[]}),/超过单张图片尺寸上限/,'the 64MP limit is enforced below the maximum edge size');
 assert.equal(U.layout({progress:{width:1000,height:1000},unmet:[{width:3000,height:900}]}).width,3000,'the largest input determines common width, independent of source order');
}
{
 const {U,canvases,closed}=harness();await assert.rejects(U.combine({progress,unmet:[unmet[0],blob('broken',1660,500,{fail:true})]}),/第2页读取失败/);assert.equal(canvases.length,0,'a failed detail page never exports a partial composite');assert.deepEqual(closed,['progress','top-page-1']);
 await assert.rejects(U.combine({progress,unmet:[blob('too-big',3000,22000)]}),/超过单张图片尺寸上限/);assert.equal(canvases.length,0,'dimensions are validated before allocating the final canvas');
 await assert.rejects(U.combine({progress,unmet:'not-pages'}),/完整/);await assert.rejects(U.combine({unmet:[]}),/完整/);await assert.rejects(U.combine({progress:new Blob(['bad'],{type:'image/jpeg'})}),/PNG/);
}
{
 const h=harness();h.setFailExport(true);await assert.rejects(h.U.combine({progress,unmet}),/生成失败/);assert.deepEqual(h.closed,['progress','top-page-1','top-page-2']);
 const bad=harness();bad.setFailContext(true);await assert.rejects(bad.U.combine({progress,unmet:[unmet[0]]}),/无法合并图片/);assert.deepEqual(bad.closed,['progress','top-page-1']);
}
if(!real){
 const h=harness();delete h.x.createImageBitmap;h.x.Image=class{set src(value){const entry=h.urls.find(e=>e.url===value);entry.blob.text().then(raw=>{const spec=JSON.parse(raw);this.id=spec.id;this.naturalWidth=spec.width;this.naturalHeight=spec.height;this.onload();});}};
 await h.U.combine({progress,unmet:[unmet[0]]});assert.equal(h.urls.length,2);assert.deepEqual(h.revoked,h.urls.map(e=>e.url),'fallback object URLs are always revoked');assert.deepEqual(h.canvases[0].draws.map(d=>d.id),['progress','top-page-1']);
}
console.log('PASS store publication composite: one complete PNG, every TOP page in order, no downscale, explicit empty state, bounded dimensions, decode/export failure atomicity, bitmap cleanup and image fallback.');
