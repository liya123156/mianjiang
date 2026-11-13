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
    const context=ctx?new Proxy(ctx,{get(target,key){if(key==='fillText')return (value,...args)=>{drawn.push(String(value));target.fillText(String(value),...args);};const value=target[key];return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}}):{scale(){},fillRect(){},strokeRect(){},createLinearGradient(){return {addColorStop(){}};},beginPath(){},roundRect(){},fill(){},stroke(){},measureText(t){return {width:[...String(t)].length*18};},fillText(t){drawn.push(String(t));}};
    const canvas={width:1,height:1,getContext(){if(native){native.width=canvas.width;native.height=canvas.height;}return context;},toBlob(callback){onImage?.();if(native)native.encode('png').then(buffer=>{callback(new Blob([buffer],{type:'image/png'}));native.width=1;native.height=1;});else queueMicrotask(()=>callback(new Blob([JSON.stringify(drawn)],{type:'image/png'})));}};
    canvases.push({canvas,drawn});return canvas;
  }
};
const x={document,currentMonth:month,currentMode:'daily',currentView:company,DATA:{meta:{},regions:[],views:{}},ARCHIVE:{months:{}},Intl,URL,Date,console,TextEncoder,Blob,Uint8Array,Uint32Array,DataView,queueMicrotask,setTimeout,crypto:globalThis.crypto,WBVoice:{reset(){},field:()=>''},isHistoryArchiveMonth:()=>false,renderTable:()=>'',viewKey:v=>v.scope+':'+v.name,viewFromUrl:()=>company,updateUrl(){},resolveView:(region,store)=>store?{scope:'store',name:store,region,store}:region?{scope:'region',name:region,region}:company,WBCloud:{configured:false,member:null,project:false}};
const storage=new Map();x.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
Object.defineProperty(x.WBCloud,'project',{get:()=>x.WBCloud.member?.role==='project'});
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
  const count=index===0?50:1;
  for(let i=0;i<count;i++){
    const id=index+'-'+i,met=index===1||index===0&&i>=25?0:1;
    housing.push({大区:s.region,门店:s.store,店组:s.store+'A组',维护人姓名:'伙伴'+index,房源编号:id,细分在售户数:1,本月是否面见:met,门店top户数:1,户型top户数:1,分盘:'楼盘哨兵'+index,房间号:id});
    if(met)meetings.push({房源编号:id,面见id:id,面见时间:'2026-11-08',面见反馈:index===0&&i===0?'第一条原文起点'+('完整原文保留 ORIGINAL-FEEDBACK-'.repeat(2500))+'第一条原文终点':'已反馈客户，看房后确认底价'});
  }
}
meetings.unshift({...meetings[0],面见id:'再次面见',面见时间:'2026-11-09',面见反馈:'第二次较晚反馈哨兵'});
const excluded=M.storeCatalog.find(s=>!s.ownerApplicable);
housing.push({...housing[0],大区:excluded.region,门店:excluded.store,房源编号:'customer-only'});
const snapshot=()=>({housing,meetings,items:[],imports:[{as_of:'2026-11-09',created_at:'2026-11-09T08:00:00Z'}],periods:[],snapshots:[],reader:x.WBCloud.member});
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
assert.equal(manifest.stores.length,18);assert.equal(manifest.asOf,'2026-11-09');assert.equal(manifest.status,'prepared');
assert.equal(manifest.stores[0].modules.details.length,2,'25 unmet TOP homes must retain the second page');
assert.ok(manifest.stores[0].modules.quality.length>1,'complete long feedback must paginate');
assert.deepEqual(manifest.stores[0].moduleLabels,{progress:'面见及礼物进展',details:'未面见TOP房明细',quality:'业主面见真实反馈'});
assert.equal(manifest.stores[0].metrics.met,25);assert.equal(manifest.stores[0].metrics.meetingCount,26);
assert.match(read(entries,manifest.stores[0].message),/全盘面见：25套（50\.00%）/,'current announcement template uses owner coverage; the manifest retains meeting counts');
assert.equal(manifest.stores[1].metrics.met,0);assert.equal(manifest.stores[1].images.length,3,'zero meetings still yields all three modules');
assert.equal(read(entries,'门店群配置.csv').split('\r\n').length,19);
assert.ok(manifest.stores.every(s=>s.groupName===''),'never infer or prefill a WeChat recipient');
assert.ok(manifest.stores.every(s=>s.images.every(name=>entries.has(name))));
assert.ok(!manifest.stores.some(s=>s.store===excluded.store));
if(!realCanvas){
 assert.ok(read(entries,manifest.stores[0].modules.progress[0]).includes('面见次数 26次'),'progress KPI shows the numeric meeting count, not its explanatory label');
 for(const [index,store] of manifest.stores.entries()){
  const imageText=store.images.map(name=>read(entries,name)).join('\n');
  for(const other of catalog.filter(s=>s.store!==store.store))assert.ok(!imageText.includes(other.store),'cross-store image: '+other.store);
  assert.ok(imageText.includes(store.store));
 }
 const first=manifest.stores[0].modules.details.map(name=>read(entries,name)).join('');
 for(let i=25;i<50;i++)assert.ok(first.includes('0-'+i),'all unmet TOP pages retained');
 assert.ok(first.includes('未面见TOP房明细'));assert.ok(!first.includes('楼盘哨兵1'));
 const feedback=manifest.stores[0].modules.quality.map(name=>read(entries,name)).join('');
 assert.ok(feedback.includes('真实反馈'));assert.ok(feedback.includes('第一条原文起点'));assert.ok(feedback.includes('第一条原文终点'));
 assert.ok(feedback.indexOf('第一条原文起点')<feedback.indexOf('第二次较晚反馈哨兵'),'same-home events follow chronological order');
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
install(project);
await assert.rejects(api.buildSendPackage(company,{pilot:true}),/先导入/);
const pilotStores=[{store:'复兴香园店',groupName:'测试💜经理群,一'},{store:'新天地二店',groupName:'🏆测试经理群（两店试行）'}];
P.savePilotConfig({version:1,stores:pilotStores});
const pilot=await api.buildSendPackage(company,{pilot:true}),pilotEntries=unzip(await pilot.blob.arrayBuffer());
assert.equal(pilot.manifest.stores.length,2);assert.equal(pilot.manifest.pilot,true);
assert.match(pilot.filename,/2店试行资料包/);
for(const row of pilot.manifest.stores){assert.equal(row.groupName,pilotStores.find(s=>s.store===row.store).groupName);assert.ok(row.images.every(name=>pilotEntries.has(name)));}
assert.equal(read(pilotEntries,'门店群配置.csv').split('\r\n').length,3);
assert.ok(read(pilotEntries,'门店群配置.csv').includes('"测试💜经理群,一"'));
for(const name of pilotEntries.keys())assert.ok(!catalog.filter(s=>!pilotStores.some(p=>p.store===s.store)).some(s=>name.includes(s.store)));
await assert.rejects(api.buildSendPackage(storeView(pilot.manifest.stores[0]),{pilot:true}),/两家试行店均须/);
install({role:'store',...pilot.manifest.stores[0]});await assert.rejects(api.buildSendPackage(company,{pilot:true}),/授权/);
install(project);once=false;onImage=()=>{if(!once){once=true;P.savePilotConfig({version:1,stores:pilotStores.map(s=>({...s,groupName:s.groupName+'更新'}))});}};
await assert.rejects(api.buildSendPackage(company,{pilot:true}),/配置已变化/);onImage=null;
assert.throws(()=>P.validatePilotConfig({version:1,stores:[pilotStores[0]]}),/两家/);
assert.throws(()=>P.validatePilotConfig({version:1,stores:[pilotStores[0],pilotStores[0]]}),/重复/);
assert.throws(()=>P.validatePilotConfig({version:1,stores:[pilotStores[0],{...pilotStores[1],groupName:pilotStores[0].groupName}]}),/完整名称/);
assert.throws(()=>P.validatePilotConfig({version:1,stores:[pilotStores[0],{store:excluded.store,groupName:'不适用门店'}]}),/无效/);
assert.throws(()=>P.validatePilotConfig({version:1,stores:[pilotStores[0],{...pilotStores[1],groupName:'群名\n其他群'}]}),/完整名称/);
P.savePilotConfig({version:1,stores:pilotStores});install(project);api.render(company);
assert.match(elements.get('report').innerHTML,/两店微信试行.*生成两店试行资料包/s);
assert.ok(elements.get('report').innerHTML.includes('测试💜经理群,一'));
assert.ok(elements.get('report').innerHTML.includes('🏆测试经理群（两店试行）'));
storage.clear();
const projectConfig={recordType:'wechat-send-config',version:2,mode:'pilot',pilotStores:pilotStores.map(s=>s.store),stores:catalog.map(s=>({...s,groupName:pilotStores.find(p=>p.store===s.store)?'项目共享'+pilotStores.find(p=>p.store===s.store).groupName:''}))};
const shared=install(project);shared.sendConfigItem={key:'2000-01|rules|@@company|wechat-send-config-v1',kind:'rules',payload:projectConfig};
api.render(company);const projectPanel=elements.get('report').innerHTML;
assert.match(projectPanel,/项目负责人统一操作 · 18家门店/);assert.match(projectPanel,/公示口径：套数与面见率等权综合排名，门店／店组各自比较，仅展示首末并保留并列。/);assert.match(projectPanel,/已配置 <b>2\/18<\/b> 店，待配置 16 店/);assert.doesNotMatch(projectPanel,/data-ops="pilot-import"/);
const sharedPilot=await api.buildSendPackage(company,{pilot:true});assert.equal(sharedPilot.manifest.stores.length,2);assert.equal(sharedPilot.manifest.recipientsComplete,true);assert.equal(sharedPilot.manifest.operatorRole,'project');assert.ok(sharedPilot.manifest.stores.every(s=>s.groupName.startsWith('项目共享')));
if(process.env.PILOT_ZIP_PATH){assert.ok(realCanvas,'runner interoperability fixture must contain real PNGs');fs.writeFileSync(process.env.PILOT_ZIP_PATH,Buffer.from(await sharedPilot.blob.arrayBuffer()));}
const sharedAll=await api.buildSendPackage(company);assert.equal(sharedAll.manifest.stores.length,18);assert.equal(sharedAll.manifest.stores.filter(s=>s.groupName).length,2);assert.equal(sharedAll.manifest.recipientsComplete,false);
assert.throws(()=>P.validateProjectConfig({...projectConfig,stores:projectConfig.stores.slice(1)}),/全部/);
assert.throws(()=>P.validateProjectConfig({...projectConfig,pilotStores:[catalog[0].store]}),/试行名单/);
once=false;onImage=()=>{if(!once){once=true;shared.sendConfigItem={...shared.sendConfigItem,payload:{...projectConfig,stores:projectConfig.stores.map(s=>({...s,groupName:s.groupName?s.groupName+'改名':''}))}};}};
await assert.rejects(api.buildSendPackage(company,{pilot:true}),/配置已变化/);onImage=null;
install({role:'region',region:'黄浦大区'}).sendConfigItem={payload:projectConfig};api.render({scope:'region',region:'黄浦大区',name:'黄浦大区'});assert.ok(!elements.get('report').innerHTML.includes('项目共享'));
// Current-range publications export one progress image, with the agreed identity levels.
install(project);
const companyPublication=await api.buildPublicationPackage(company),companyFiles=unzip(await companyPublication.blob.arrayBuffer());
assert.equal(companyPublication.manifest.images.length,1);
assert.deepEqual(Array.from(companyPublication.manifest.levels),['company','region','store']);
assert.ok(!('groupName' in companyPublication.manifest));assert.ok(!companyFiles.has('门店群配置.csv'));
const companyText=read(companyFiles,'话术.txt');
assert.match(companyText,/🎯 本月目标与进展/);assert.match(companyText,/🏅 标杆门店/);assert.match(companyText,/⚠️ 重点提醒门店/);assert.match(companyText,/🔎 面见质量/);
assert.doesNotMatch(companyText,/各店进展|各组进展|💡|👏|公示口径|等权综合排名/);
const qualitySection=companyText.split('🔎 面见质量\n')[1].split('\n\n')[0];
assert.ok(qualitySection.split('\n').every(line=>!line.includes('%')),'public quality keeps one count per line without percentages or commentary');
if(!realCanvas){const companyImage=read(companyFiles,companyPublication.manifest.images[0]);assert.ok(!companyImage.includes('伙伴0'));assert.ok(!companyImage.includes(catalog[0].store+'A组'));}
const regionView={scope:'region',name:catalog[0].region,region:catalog[0].region};
const regionPublication=await api.buildPublicationPackage(regionView),regionFiles=unzip(await regionPublication.blob.arrayBuffer());
assert.equal(regionPublication.manifest.images.length,1);assert.deepEqual(Array.from(regionPublication.manifest.levels),['region','store','group']);
const regionText=read(regionFiles,'话术.txt');assert.match(regionText,/标杆门店与店组/);assert.match(regionText,/重点提醒门店与店组/);assert.ok(regionText.includes(catalog[2].store+'A组'));assert.ok(regionText.includes(catalog[3].store+'A组'));assert.ok(!regionText.includes(catalog[0].store+'A组'),'middle-ranked group is not included in first/last announcements');assert.doesNotMatch(regionText,/各店进展/);
if(!realCanvas){const regionImage=read(regionFiles,regionPublication.manifest.images[0]);assert.ok(regionImage.includes(catalog[0].store+'A组'));assert.ok(!regionImage.includes('伙伴0'));for(const store of catalog.filter(s=>s.region!==catalog[0].region))assert.ok(!regionImage.includes(store.store));}
install({role:'region',region:catalog[0].region});await api.buildPublicationPackage(regionView);await assert.rejects(api.buildPublicationPackage(company),/无权/);
install({role:'store',...catalog[0]});await assert.rejects(api.buildPublicationPackage(regionView),/无权/);
install(project);once=false;onImage=()=>{if(!once){once=true;api.state.cache[month]=snapshot();}};
await assert.rejects(api.buildPublicationPackage(company),/已变化/);onImage=null;assert.equal(api.state.exporting,false);
// Gift prompts use registered coverage; no warning at 20%, no inference about preparation.
install(project);
const base={_level:'store',store:catalog[0].store,stock:100,met:10,met_rate:'10.00%',_target:20,store_top_met:1,store_top_rate:'10.00%',unit_top_met:1,unit_top_rate:'10.00%'};
for(const [met,gift,warning] of [[10,1,true],[10,2,false],[10,3,false],[0,0,false]]){
 const metric={...base,met,gift,gift_rate:M.pct(gift,met)},text=api.novemberMessage(company,{rows:[metric]},metric,20,'业主数据截至2026-11-09');
 assert.equal(text.includes('🎁 伴手礼提醒'),warning,'gift warning boundary '+gift+'/'+met);
 if(warning){assert.match(text,/系统送礼登记覆盖率低于20%/);assert.match(text,/核实伴手礼准备、使用及补录情况/);assert.doesNotMatch(text,/没有准备|未准备|未安排/);}
}
console.log('PASS company/region public packages: one image, exact levels, concise messages, count-only quality, scoped access and interrupted export.');
console.log('PASS gift reminders: below 20% only, no warning at 20% or zero meetings, registration wording avoids assuming unprepared gifts.');
console.log('PASS shared project configuration: one operator, 18-store directory, 2 ready/16 pending, automatic loading, private scope and changed-recipient abort.');
console.log('PASS two-store pilot: only configured stores, exact emoji names and CSV, both stores required, scope checks, local persistence and changed-group abort.');
console.log('PASS '+(realCanvas?'real PNG + ':'')+'18-store ZIP: CRC, Chinese filenames, all three modules, pagination, counts, isolated recipients, role scopes, and interrupted export.');
