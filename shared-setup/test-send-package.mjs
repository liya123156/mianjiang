import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';

// Optional real PNG render: REAL_CANVAS=1 node shared-setup/test-send-package.mjs
const realCanvas = process.env.REAL_CANVAS ? createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'package.json'))('@napi-rs/canvas') : null;
const month = '2026-11', company = {scope:'company',name:'全司'};
const elements = new Map(), canvases = [];
let onImage;
const document = {
  getElementById(id) { if(!elements.has(id))elements.set(id,{innerHTML:'',setAttribute(){}});return elements.get(id); },
  querySelector(id) { return this.getElementById(id); }, querySelectorAll(){return [];},addEventListener(){},
  createElement(type) {
    assert.equal(type,'canvas');
    const drawn=[],native=realCanvas?.createCanvas(1,1),ctx=native?.getContext('2d');
    const context=ctx?new Proxy(ctx,{get(target,key){if(key==='fillText')return (value,...args)=>{drawn.push(String(value));target.fillText(String(value),...args);};const value=target[key];return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}}):{scale(){},fillRect(){},strokeRect(){},measureText(t){return {width:[...String(t)].length*18};},fillText(t){drawn.push(String(t));}};
    const canvas={width:1,height:1,getContext(){if(native){native.width=canvas.width;native.height=canvas.height;}return context;},toBlob(callback){onImage?.();if(native)native.encode('png').then(buffer=>callback(new Blob([buffer],{type:'image/png'})));else queueMicrotask(()=>callback(new Blob([JSON.stringify(drawn)],{type:'image/png'})));}};
    canvases.push({canvas,drawn});return canvas;
  }
};
const x={document,currentMonth:month,currentMode:'daily',currentView:company,DATA:{meta:{},regions:[],views:{}},ARCHIVE:{months:{}},Intl,URL,Date,console,TextEncoder,Blob,Uint8Array,Uint32Array,DataView,queueMicrotask,setTimeout,crypto:globalThis.crypto,WBVoice:{reset(){},field:()=>''},isHistoryArchiveMonth:()=>false,renderTable:()=>'',viewKey:v=>v.scope+':'+v.name,viewFromUrl:()=>company,updateUrl(){},resolveView:(region,store)=>store?{scope:'store',name:store,region,store}:region?{scope:'region',name:region,region}:company,WBCloud:{configured:false,member:null,project:false}};
x.window=x;vm.createContext(x);
for(const file of ['core','quality-feed','quality-rules','quality','workflow','scene','send-package','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+file+'.js',import.meta.url),'utf8'),x,{filename:file+'.js'});
vm.runInContext('const esc=v=>String(v??""); const arr=x=>Array.isArray(x)?x:[]; const monthLabel=()=>"11月";',x);
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
vm.runInContext(html.slice(html.indexOf('const progressRankLegend ='),html.indexOf('\nfunction showProgressImage')),x);
const M=x.WBModel,api=x.WBOperations,P=x.WBSendPackage;
const storeView=s=>({scope:'store',name:s.store,store:s.store,region:s.region});
const catalog=M.storeCatalog.filter(s=>s.ownerApplicable);
const housing=[],meetings=[];
for(const [index,s] of catalog.entries()){
  const count=index===0?25:1;
  for(let i=0;i<count;i++){
    const id=index+'-'+i,met=index===1?0:1;
    housing.push({大区:s.region,门店:s.store,店组:s.store+'A组',维护人姓名:'伙伴'+index,房源编号:id,细分在售户数:1,本月是否面见:met,门店top户数:1,户型top户数:1,分盘:'楼盘哨兵'+index,房间号:id});
    if(met)meetings.push({房源编号:id,面见id:id,面见时间:'2026-11-08',面见反馈:'已反馈客户，看房后确认底价'});
  }
}
meetings.push({...meetings[0],面见id:'再次面见'});
const excluded=M.storeCatalog.find(s=>!s.ownerApplicable);
housing.push({...housing[0],大区:excluded.region,门店:excluded.store,房源编号:'customer-only'});
const snapshot=()=>({housing,meetings,items:[],imports:[{as_of:'2026-11-08',created_at:'2026-11-09T08:00:00Z'}],periods:[],snapshots:[],reader:x.WBCloud.member});
function install(member){x.WBCloud.member=member;api.state.cache[month]=snapshot();return api.state.cache[month];}
function unzip(buffer){
  const entries=new Map(),b=new Uint8Array(buffer),d=new DataView(b.buffer);let offset=0;
  while(d.getUint32(offset,true)===0x04034b50){
    assert.equal(d.getUint16(offset+8,true),0);assert.ok(d.getUint16(offset+6,true)&0x800);
    const size=d.getUint32(offset+18,true),nameLength=d.getUint16(offset+26,true),extra=d.getUint16(offset+28,true),start=offset+30+nameLength+extra,name=new TextDecoder().decode(b.slice(offset+30,offset+30+nameLength));
    const bytes=b.slice(start,start+size);let crc=0xffffffff;for(const value of bytes){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}assert.equal((crc^0xffffffff)>>>0,d.getUint32(offset+14,true),'CRC of '+name);
    entries.set(name,bytes);offset=start+size;
  }
  assert.equal(d.getUint32(offset,true),0x02014b50);
  assert.equal(d.getUint32(b.length-22,true),0x06054b50);assert.equal(d.getUint16(b.length-12,true),entries.size);
  return entries;
}
const read=(entries,name)=>new TextDecoder().decode(entries.get(name));
install(null);await assert.rejects(api.buildSendPackage(company),/登录/);
const project={role:'project'};install(project);
const all=await api.buildSendPackage(company),entries=unzip(await all.blob.arrayBuffer()),manifest=JSON.parse(read(entries,'manifest.json'));
assert.equal(manifest.stores.length,18);assert.equal(manifest.asOf,'2026-11-08');assert.equal(manifest.status,'prepared');
assert.equal(manifest.stores[0].modules.details.length,2,'25 houses must retain the second page');
assert.equal(manifest.stores[0].metrics.met,25);assert.equal(manifest.stores[0].metrics.meetingCount,26);
assert.match(read(entries,manifest.stores[0].message),/面见次数：26次/);
assert.equal(manifest.stores[1].metrics.met,0);assert.equal(manifest.stores[1].images.length,3,'zero meetings still yields all three modules');
assert.equal(read(entries,'门店群配置.csv').split('\r\n').length,19);
assert.ok(manifest.stores.every(s=>s.groupName===''),'never infer or prefill a WeChat recipient');
assert.ok(manifest.stores.every(s=>s.images.every(name=>entries.has(name))));
assert.ok(!manifest.stores.some(s=>s.store===excluded.store));
if(!realCanvas){
 for(const [index,store] of manifest.stores.entries()){
  const imageText=store.images.map(name=>read(entries,name)).join('\n');
  for(const other of catalog.filter(s=>s.store!==store.store))assert.ok(!imageText.includes(other.store),'cross-store image: '+other.store);
  assert.ok(imageText.includes(store.store));
 }
 const first=manifest.stores[0].modules.details.map(name=>read(entries,name)).join('');
 for(let i=0;i<25;i++)assert.ok(first.includes('0-'+i));
}else{
 for(const store of manifest.stores)for(const name of store.images){const bytes=entries.get(name);assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);const image=await realCanvas.loadImage(Buffer.from(bytes));assert.ok(image.width>=1500&&image.height>300);}
 if(process.env.PREVIEW_DIR){fs.mkdirSync(process.env.PREVIEW_DIR,{recursive:true});for(const [index,name] of manifest.stores[0].images.entries())fs.writeFileSync(path.join(process.env.PREVIEW_DIR,'sample-'+index+'.png'),entries.get(name));}
}
install({role:'region',region:catalog[0].region});const region=await api.buildSendPackage(company);assert.ok(region.manifest.stores.every(s=>s.region===catalog[0].region));
install({role:'store',...catalog[0]});const single=await api.buildSendPackage(company);assert.equal(single.manifest.stores.length,1);assert.equal(single.manifest.stores[0].store,catalog[0].store);
await assert.rejects(api.buildSendPackage(storeView(catalog[4])),/没有可导出/);
install({role:'store',...catalog[0],stores:[catalog[4]]});assert.equal((await api.buildSendPackage(company)).manifest.stores.length,2);
install(project);api.state.cache[month].reader=null;await assert.rejects(api.buildSendPackage(company),/刷新/);
install(project);api.state.loading=true;await assert.rejects(api.buildSendPackage(company),/刷新/);api.state.loading=false;
install(project);let once=false;onImage=()=>{if(!once){once=true;x.WBCloud.member=null;}};
await assert.rejects(api.buildSendPackage(storeView(catalog[0])),/已变化/);onImage=null;assert.equal(api.state.exporting,false);
install(project);once=false;onImage=()=>{if(!once){once=true;x.currentMonth='2026-12';}};
await assert.rejects(api.buildSendPackage(storeView(catalog[0])),/已变化/);onImage=null;x.currentMonth=month;
install(project);once=false;onImage=()=>{if(!once){once=true;api.state.cache[month]=snapshot();}};
await assert.rejects(api.buildSendPackage(storeView(catalog[0])),/已变化/);onImage=null;
await assert.rejects(P.zip([{name:'../outside',data:'x'}]),/无效/);
await assert.rejects(P.zip([{name:'same',data:'x'},{name:'same',data:'y'}]),/重复/);
console.log('PASS '+(realCanvas?'real PNG + ':'')+'18-store ZIP: CRC, Chinese filenames, all three modules, pagination, counts, isolated recipients, role scopes, and interrupted export.');
