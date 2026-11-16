/* Exercise the actual package builder while keeping raster composition a separate concern. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const month='2026-11',company={scope:'company',name:'全司'},source={as_of:'2026-11-16',created_at:'source-v1'};
const catalog=[
 ['花木大区','仁恒河滨城店'],['花木大区','碧云店'],['花木大区','御翠园店'],['花木大区','浦东别墅旗舰店'],
 ['陆家嘴大区','星河湾店'],['陆家嘴大区','陆家嘴金融中心店'],['陆家嘴大区','陆家嘴旗舰店'],['陆家嘴大区','陆家嘴滨江店'],['陆家嘴大区','顶级豪宅部'],
 ['徐汇大区','嘉御庭公馆店'],['徐汇大区','尚海湾店'],['徐汇大区','徐汇滨江店'],
 ['滨江古北大区','融创滨江壹号院店'],['滨江古北大区','长宁古北店'],
 ['黄浦大区','黄浦滨江店'],['黄浦大区','新天地一店'],['黄浦大区','新天地二店'],['黄浦大区','复兴香园店']
].map(([region,store])=>({region,store,ownerApplicable:true}));
const regions=[...new Set(catalog.map(s=>s.region))];
const png=text=>new Blob([text],{type:'image/png'}),blobText=blob=>blob.text();
const cfg={version:2,company:{groupName:''},regions:regions.map(region=>({region,groupName:''})),stores:catalog.map(s=>({...s,groupName:''})),pilotStores:[]};
function harness(member={role:'project'}){
 const combines=[],zipWrites=[],progressCalls=[];
 const housing=catalog.map(s=>({'大区':s.region,'门店':s.store}));
 const state={cache:{},loading:false,exporting:false,savingSendConfig:false};
 const d={reader:member,housing,meetings:[],items:[],imports:[{...source}]};state.cache[month]=d;
 const C={member};Object.defineProperty(C,'project',{get:()=>C.member?.role==='project'});
 const metric=s=>({...s,_level:'store',_target:20,met:s.store===catalog[0].store?1:0,met_count:s.store===catalog[0].store?2:0,gift:0,stock:50,metIds:s.store===catalog[0].store?['met-first']:[]});
 const M={storeCatalog:catalog,table(rows,scope){const stores=catalog.filter(s=>(!scope.region||s.region===scope.region)&&(!scope.store||s.store===scope.store));return {rows:[...(!scope.store?[{_level:scope.region?'region':'company',region:scope.region||'全司',store:'/',_target:360,met:1,met_count:2,gift:0,stock:900,metIds:['met-first']}]:[]),...stores.map(metric)]};}};
 const P={moduleLabels:{progress:'面见及礼物进展',details:'未面见TOP房明细',quality:'业主面见真实反馈'},emptyFeedbackImage:async({store})=>png('EMPTY-QUALITY:'+store),projectConfigDefaults:()=>cfg,allGroupTemplate:()=> 'ALL-GROUP-CONFIG',groupTemplate:()=> 'STORE-GROUP-CONFIG',async zip(files){zipWrites.push(files);return new Blob(['zip']);}};
 const x={Blob,Date,Map,Set,JSON,Number,String,Array,Object,console,currentMonth:month,currentView:company,C,M,state,root:null,
  data:()=>state.cache[x.currentMonth],canonicalStore:s=>s,memberScopes:()=>member.stores||[member],sendConfig:()=>cfg,goals:()=>Object.fromEntries(catalog.map(s=>[s.store,20])),rankProgress:p=>p,
  Q:{records:()=>[{houseId:'met-first'}],summary:rows=>({total:rows.length,feedback:rows.length})},
  F:{select:rows=>rows,counts:()=>({}),images:async({scope})=>[png('QUALITY-FIRST:'+scope),png('QUALITY-LAST:'+scope)]},
  companyBenchmarkData:()=>({allCompany:true}),metHouseRows:view=>view.store===catalog[0].store?[{}]:[],
  priorityFacts:()=>[],novemberPraises:()=>[],makeMessage:view=>'MESSAGE:'+view.name,publicationKpis:()=>[],customerOptions:()=>({}),meetingValue:r=>r.met_count,
  unmetTopRows:view=>view.store===catalog[0].store?Array.from({length:49},(_,i)=>({id:'TOP-'+(i+1)})):[],
  unmetTopImageBlobs:async(rows,view)=>rows.length?[png('TOP-PAGE-1:'+view.store),png('TOP-PAGE-2:'+view.store),png('TOP-PAGE-3-LAST:'+view.store)]:[png('EMPTY-TOP:'+view.store)],
  createProgressImage:async(view,progress)=>{progressCalls.push({view,levels:progress.rows.map(r=>r._level)});return png('PROGRESS:'+view.name);},
  WBSendPackage:P,WBCompanyBenchmark:{image:async()=>png('GLOBAL-BOARD')},WBStorePublicationImage:{async combine(args){combines.push(args);return png('COMBINED\n'+await blobText(args.progress)+'\n'+(await Promise.all(args.unmet.map(blobText))).join('\n'));}}
 };
 x.root=x;x.root.WBSendPackage=P;vm.createContext(x);
 const ui=fs.readFileSync(new URL('../operations/ui.js',import.meta.url),'utf8');
 const start=ui.indexOf(' async function buildSendPackage('),end=ui.indexOf('\n function publicationKpis(',start);
 assert.ok(start>=0&&end>start,'actual package builder remains available');
 vm.runInContext(ui.slice(start,end)+'\nthis.build=buildSendPackage;',x);
 return {x,state,d,C,combines,zipWrites,progressCalls};
}
const h=harness(),result=await h.x.build(company,{allScopes:true}),files=h.zipWrites.at(-1),entries=new Map(files.map(f=>[f.name,f.data])),manifest=result.manifest;
assert.equal(manifest.schemaVersion,2);assert.equal(manifest.scopeCount,24);assert.equal(manifest.stores.length,18);assert.equal(manifest.publications.length,6);
assert.equal(h.combines.length,18,'every store gets exactly one composite');assert.equal(h.combines[0].unmet.length,3,'all TOP pages are provided to the compositor');
assert.ok(!files.some(f=>/\/02_未面见TOP房明细_\d+\.png$/.test(f.name)),'the ZIP must not keep separately forwarded TOP pages');
for(const row of manifest.stores){
 assert.equal(new Set(row.images).size,row.images.length,'the sender image list has no duplicate composite');
 assert.equal(row.modules.progress.length,1);assert.equal(row.modules.details.length,0,'legacy details does not cause a second send');
 assert.equal(row.progressIncludesUnmetTop,true);assert.ok(row.unmetTopPages>=1);
 assert.match(row.modules.progress[0],/01_面见进展及未面见TOP房明细\.png$/);
 assert.equal(row.moduleLabels.progress,'面见及礼物进展＋未面见TOP房明细');assert.equal(row.moduleLabels.details,'已合并至进展图');
 assert.ok(row.images.every(name=>entries.has(name)));assert.equal(row.modules.benchmark.length,1);
 assert.match(row.modules.benchmark[0],/03_全司面见标杆榜\.png$/);
 assert.ok(row.modules.quality.every(name=>/02_业主面见真实反馈_\d+\.png$/.test(name)));
}
const first=manifest.stores[0],second=manifest.stores[1];
assert.equal(first.metrics.unmetTopCount,49);assert.equal(first.unmetTopPages,3);assert.equal(first.modules.quality.length,2,'long raw feedback remains paginated');assert.equal(first.images.length,4,'composite plus two feedback pages plus global board');
assert.equal(second.metrics.met,0);assert.equal(second.metrics.unmetTopCount,0);assert.equal(second.unmetTopPages,1);assert.equal(second.images.length,3,'normal/empty store now needs three images rather than four');
const firstText=await blobText(entries.get(first.modules.progress[0]));
assert.match(firstText,/PROGRESS:仁恒河滨城店/);assert.match(firstText,/TOP-PAGE-1:/);assert.match(firstText,/TOP-PAGE-2:/);assert.match(firstText,/TOP-PAGE-3-LAST:/);
assert.match(await blobText(entries.get(second.modules.progress[0])),/EMPTY-TOP:碧云店/);
const global=entries.get(first.modules.benchmark[0]);for(const row of manifest.stores)assert.equal(entries.get(row.modules.benchmark[0]),global,'all stores reuse one company board Blob');
for(const p of manifest.publications){
 assert.equal(p.images.length,p.scope==='company'?1:2,'company and region package image counts remain unchanged');
 assert.match(p.images[0],/01_面见及礼物进展\.png$/);assert.match(await blobText(entries.get(p.images[0])),/^PROGRESS:/,'company/region progress remains its original single image');
 if(p.scope==='region')assert.equal(entries.get(p.images[1]),global);
 const call=h.progressCalls.find(c=>c.view.name===p.name);assert.ok(call);assert.ok(!call.levels.includes('advisor'));
}
assert.ok(String(entries.get('使用说明.txt')).includes('合并'),'the README explains the combined store image');

const scoped=harness({role:'store',...catalog[0]}),scopeResult=await scoped.x.build(company);
assert.equal(scopeResult.manifest.stores.length,1);assert.equal(scopeResult.manifest.stores[0].images.length,3,'scoped store gets composite and two feedback pages, without inventing a global board');assert.ok(!scopeResult.manifest.stores[0].modules.benchmark);
const stale=harness();stale.x.WBStorePublicationImage.combine=async args=>{stale.state.cache[month]={...stale.d};return png('STALE');};
await assert.rejects(stale.x.build(company),/已变化/);assert.equal(stale.zipWrites.length,0,'source change during composition cannot produce a completed package');assert.equal(stale.state.exporting,false);
console.log('PASS combined store package: all TOP pages in one image, unique sender lists, empty-state and long-feedback retention, 24 scopes, unchanged company/region images, original roles and stale-source abort.');
