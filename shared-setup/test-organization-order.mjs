import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const M=createRequire(import.meta.url)('../operations/core.js');
const housing=M.storeCatalog.filter(s=>s.ownerApplicable).flatMap((s,i)=>['C','D','A','B'].flatMap((g,j)=>['乙','甲'].map((name,k)=>({大区:s.region,门店:s.store,店组:s.store+g+'组',维护人姓名:name,房源编号:`${i}-${j}-${k}`,细分在售户数:1,本月是否面见:j%2,门店top户数:1,户型top户数:k%2}))));
const customers=M.storeCatalog.filter(s=>!s.ownerApplicable).flatMap(s=>['D','B','C','A'].map((g,i)=>({region:s.region,store:s.store,group:s.store+g+'组',name:'伙伴',count:i+1})));
const options={includeAllLevels:true,showCustomer:true,customerImported:true,customerRows:customers};
const month='2026-11',build=(scope={},rows=housing,opts=options)=>M.table(rows,scope,{},month,[],opts);
const identity=r=>[r._level,r.region,r.store,r.group,r.name].join('|');
const orgRows=build().rows;
assert.deepEqual(orgRows.filter(r=>r._level==='store').map(r=>r.store),M.storeCatalog.map(s=>s.store));
assert.deepEqual(orgRows.filter(r=>r._level==='region').map(r=>r.region),M.unique(M.storeCatalog.map(s=>s.region)));
for(const s of M.storeCatalog){
 const groups=orgRows.filter(r=>r._level==='group'&&r.store===s.store);
 assert.deepEqual(groups.map(r=>r.group),['A','B','C','D'].map(g=>s.store+g+'组'));
 for(const scope of [{region:s.region},{region:s.region,store:s.store}]){
  assert.deepEqual(build(scope).rows.filter(r=>r._level==='group'&&r.store===s.store).map(r=>r.group),groups.map(r=>r.group));
 }
}
const reversed=build({},[...housing].reverse(),{...options,customerRows:[...customers].reverse()});
assert.deepEqual(reversed.rows.map(identity),orgRows.map(identity),'source row order must not change hierarchy');
for(const r of reversed.rows){
 const original=orgRows.find(x=>identity(x)===identity(r));
 for(const key of ['stock','met','met_count','met_rate','store_top_rate','unit_top_rate','customer_count'])assert.equal(r[key],original[key],key+' values unchanged');
}
assert.deepEqual(M.orderProgress({...build(),rows:[...orgRows].reverse()}).rows,orgRows,'legacy blocks preserve parent summaries and group/advisor nesting');
assert.deepEqual(['D组','C组','B组','Ａ组','10组','2组','未分组'].sort(M.compareGroup),['2组','10组','Ａ组','B组','C组','D组','未分组']);
assert.deepEqual(['店 c 组','店Ａ组','店b组','店D组'].sort(M.compareGroup),['店Ａ组','店b组','店 c 组','店D组']);
assert.deepEqual(M.snapshot(housing,{},'2026-11-13').map(s=>s.store),M.storeCatalog.filter(s=>s.ownerApplicable).map(s=>s.store));
assert.ok(M.snapshot(housing,{},'2026-11-13').every(s=>s.payload.groups.map(g=>g.group.slice(-2)).join(',')==='A组,B组,C组,D组'));
const rankings={variant:'ranking',rows:[{store:'Z'},{store:'A'}]};assert.equal(M.orderProgress(rankings),rankings,'performance rankings are not reordered');
assert.deepEqual(['御翠园店F组','御翠园店C组','御翠园店D组','御翠园店A组'].sort(M.compareGroup),['御翠园店A组','御翠园店C组','御翠园店D组','御翠园店F组']);
const rowsWithRanks=M.withRateRanks(build(),orgRows).rows;
assert.deepEqual(M.orderProgress({variant:'progress',rows:[...rowsWithRanks].reverse()}).rows,rowsWithRanks,'ranking markers remain attached to same rows');

// Exercise the actual page, mobile, copied-image model and scope directories.
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',setAttribute(){}});return elements.get(id);};
const x={console,window:null,document:{addEventListener(){},getElementById:element,querySelectorAll(){return []}},currentMonth:month,currentMode:'daily',currentView:{scope:'store'},DATA:{regions:[],views:{}},ARCHIVE:{months:{}},WBCloud:{configured:false,member:null},WBVoice:{},Intl,URL,Date,crypto:globalThis.crypto};x.window=x;vm.createContext(x);
for(const f of ['core','ui']){
 let source=fs.readFileSync(new URL('../operations/'+f+'.js',import.meta.url),'utf8');
 if(f==='ui')source=source.replace('root.WBOperations={','root.testOrganizationUI={setCloudRegions,metHouseRows,unmetTopRows};root.WBOperations={');
 vm.runInContext(source,x);
}
x.WBOperations.state.cache[month]={housing:[...housing].reverse(),items:[],periods:[],directory:[...M.storeCatalog].reverse()};
x.testOrganizationUI.setCloudRegions();
assert.deepEqual(Array.from(x.DATA.regions.flatMap(r=>r.stores)),M.storeCatalog.filter(s=>s.ownerApplicable).map(s=>s.store));
x.WBCloud.member={role:'project'};
for(const f of ['metHouseRows','unmetTopRows']){
 const details=Array.from(x.testOrganizationUI[f]({scope:'company'}));
 for(let i=1;i<details.length;i++)assert.ok(M.compareStore(details[i-1].store,details[i].store)<0||(details[i-1].store===details[i].store&&M.compareGroup(details[i-1].group,details[i].group)<=0));
}
vm.runInContext(`const esc=v=>String(v??'');const arr=x=>Array.isArray(x)?x:[];const tone=()=>'';let tableSerial=0;const tableModels=new Map();const monthLabel=()=> '11月';`,x);
vm.runInContext(html.slice(html.indexOf('const progressRankLegend ='),html.indexOf('\nfunction showProgressImage')),x);
vm.runInContext(html.slice(html.indexOf('function renderTable(block)'),html.indexOf('\nfunction renderBlock')),x);
const store='陆家嘴金融中心店',scope={region:'陆家嘴大区',store};
x.testBlock={...build(scope),rows:[...build(scope).rows].reverse()};
const rendered=vm.runInContext('renderTable(testBlock)',x);
for(const section of rendered.split('<div class="progress-mobile">')){
 let last=-1;for(const g of ['A','B','C','D']){const at=section.indexOf(store+g+'组');assert.ok(at>last,g+' row follows previous group');last=at;}
}
const plan=vm.runInContext("progressImagePlan({scope:'store',name:'测试',kpis:[]},testBlock,'2026-11',{})",x);
assert.deepEqual(Array.from(plan.rows,identity),build(scope).rows.map(identity));
assert.deepEqual(Array.from(vm.runInContext('[...tableModels.values()][0].tabs[0].rows',x),identity),build(scope).rows.map(identity));
console.log('PASS: 5 regions / 21 stores / A–D groups, shuffled imports, nesting, unchanged metrics/ranks, filters, house details, table and copied-image order.');
