import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run the real table and canvas renderers against synthetic monthly snapshots.
// This test never reads or writes the production service.
const htmlSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const coreSource=fs.readFileSync(new URL('../operations/core.js',import.meta.url),'utf8');
const drawn=[];
const ctx={scale(){},fillRect(){},strokeRect(){},measureText(t){return {width:[...String(t)].length*7};},fillText(t,x,y){drawn.push({text:String(t),x,y});}};
const sandbox={console,window:{},document:{createElement(){return {getContext(){return ctx},toBlob(fn){fn({type:'image/png'})}}}},URL,Promise,Map,Set};
sandbox.globalThis=sandbox.window;
vm.createContext(sandbox);
vm.runInContext(coreSource,sandbox);
vm.runInContext(`const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); const arr=x=>Array.isArray(x)?x:[]; const tone=()=>'';let tableSerial=0; const tableModels=new Map(); let currentView={scope:'company'}; const DATA={}; const monthLabel=()=> '11月';`,sandbox);
vm.runInContext(htmlSource.slice(htmlSource.indexOf('const progressRankLegend ='),htmlSource.indexOf('\nfunction showProgressImage')),sandbox);
vm.runInContext(htmlSource.slice(htmlSource.indexOf('function renderTable(block)'),htmlSource.indexOf('\nfunction renderBlock')),sandbox);
const M=sandbox.window.WBModel;
const catalog=[
  ['花木大区','碧云店',8],['花木大区','浦东别墅旗舰店',16],['花木大区','仁恒河滨城店',15],['花木大区','御翠园店',13],
  ['黄浦大区','复兴香园店',18],['黄浦大区','黄浦滨江店',18],['黄浦大区','新天地二店',14],['黄浦大区','新天地一店',13],
  ['陆家嘴大区','陆家嘴滨江店',21],['陆家嘴大区','陆家嘴金融中心店',23],['陆家嘴大区','陆家嘴旗舰店',28],['陆家嘴大区','顶级豪宅部',22],['陆家嘴大区','星河湾店',31],
  ['滨江古北大区','长宁古北店',5],['滨江古北大区','融创滨江壹号院店',16],
  ['徐汇大区','嘉御庭公馆店',9],['徐汇大区','尚海湾店',14],['徐汇大区','徐汇滨江店',16],
];
const housing=catalog.map(([region,store],i)=>({'大区':region,'门店':store,'店组':store+'A组','维护人姓名':'业主顾问'+i,'房源编号':'test-'+i,'细分在售户数':true,'本月是否面见':region==='花木大区','门店top户数':true,'户型top户数':true}));
const meetings=housing.slice(1,4).map(r=>({'房源编号':r['房源编号'],'面见时间':'2026-11-04'}));
const goals=Object.fromEntries(catalog.map(([,store,goal])=>[store,goal]));
const customerRows=[
  {region:'徐汇大区',store:'徐汇一店',group:'徐汇一店A组',name:'测试顾问甲',count:3},
  {region:'徐汇大区',store:'徐汇一店',group:'徐汇一店A组',name:'测试顾问乙',count:2},
  {region:'滨江古北大区',store:'Hmall中心店',group:'Hmall中心店A组',name:'测试顾问丙',count:2},
  {region:'黄浦大区',store:'黄浦滨江店',group:'黄浦滨江店B组',name:'测试顾问丁',count:1},
];
const options={customerRows,customerImported:true};
const raw=M.table(housing,{},goals,'2026-11',meetings,options);
const block=M.withRateRanks(raw,raw.rows);
const storeRows=block.rows.filter(r=>r._level==='store');
assert.equal(storeRows.length,21,'complete company view includes 21 stores');
assert.equal(block.columns.at(-1).key,'customer_count','customer count is the far-right leaf');
assert.equal(block.columnGroups.at(-1).keys[0],'customer_count','customer heading is the far-right group');
assert.equal(block.rows[0].customer_count,8,'sum the numeric counts rather than the four source rows');
assert.equal(block.rows[0].target,300,'owner target remains 300');
assert.equal(storeRows.reduce((n,r)=>n+r.customer_count,0),8);
assert.equal(block.rows.filter(r=>r._level==='region').reduce((n,r)=>n+r.customer_count,0),8);
for(const store of ['徐汇一店','Hmall中心店','Hmall旗舰店']){
  const r=storeRows.find(r=>r.store===store);
  assert.ok(r,store+' exists without owner housing');
  for(const col of block.columns.filter(c=>!['region','store','group','name','customer_count'].includes(c.key))) assert.equal(r[col.key],'/',store+': '+col.key+' is not applicable');
  for(const rate of ['met_rate','store_top_rate','unit_top_rate']) assert.equal(M.rateRankSymbol(r,rate),'','customer-only stores cannot receive owner rank marks');
}
assert.equal(storeRows.find(r=>r.store==='Hmall旗舰店').customer_count,0,'missing from an imported full-month snapshot means zero');
const flower=block.rows.find(r=>r._level==='region'&&r.region==='花木大区');
assert.equal(flower.met_count,4);
assert.equal(flower.met_count_confirmed,3);
assert.equal(flower.met_count_pending,1);
assert.equal(storeRows.filter(r=>r.region==='花木大区').reduce((n,r)=>n+r.met_count,0),flower.met_count,'store count minima add to the regional minimum');
assert.equal(M.meetingCountValue(flower,'met_count'),'≥4','minimum must not be displayed as an exact confirmed count');

sandbox.block=block;
const html=vm.runInContext('renderTable(block)',sandbox);
assert.equal((html.match(/data-level="store"/g)||[]).length,21);
assert.match(html,/客户面见/);
assert.match(html,/本月累计次数/);
assert.match(html,/≥4/);
assert.match(html,/待补明细/);
assert.match(html,/未出现门店计0/);
assert.ok(!html.includes('徐汇二店'),'canonical display does not retain the superseded store name');
const plan=vm.runInContext("progressImagePlan({scope:'company',name:'全司',kpis:[]},block,'2026-11',{cutoff:'2026-11-04'})",sandbox);
assert.equal(plan.columns.at(-1).key,'customer_count');
assert.ok(Math.abs(plan.widths.reduce((n,w)=>n+w,0)-plan.tableWidth)<0.001,'all columns fit the image table width');
const png=await vm.runInContext("createProgressImage({scope:'company',name:'全司',kpis:[]},block,'2026-11',{cutoff:'2026-11-04'})",sandbox);
assert.equal(png.type,'image/png');
const last=plan.columns.length-1,customerX=plan.x[last]+plan.widths[last]/2;
assert.ok(drawn.some(d=>d.text==='8'&&Math.abs(d.x-customerX)<0.001&&d.y===320),'copied image contains the company total in the new far-right cell');
assert.ok(drawn.some(d=>d.text==='≥4'),'copied image preserves uncertain owner counts');
assert.ok(drawn.some(d=>d.text.includes('待补明细')),'copied image explains the minimum count');
assert.ok(drawn.some(d=>d.text.includes('未出现门店计0')),'copied image states the complete-month zero convention');

const xuhui=M.table(housing,{region:'徐汇大区',store:'徐汇一店'},goals,'2026-11',meetings,options);
assert.equal(xuhui.rows.find(r=>r._level==='store').customer_count,5);
assert.equal(xuhui.rows.find(r=>r._level==='group').customer_count,5);
assert.equal(xuhui.rows.filter(r=>r._level==='advisor').reduce((n,r)=>n+r.customer_count,0),5);
sandbox.block=xuhui;
vm.runInContext("currentView={scope:'store'}",sandbox);
const singleHtml=vm.runInContext('renderTable(block)',sandbox);
assert.match(singleHtml,/测试顾问甲/);
assert.match(singleHtml,/测试顾问乙/);
assert.match(singleHtml,/徐汇一店A组/);
assert.equal((singleHtml.match(/data-level="advisor"/g)||[]).length,2,'customer-only store retains its group and advisor breakdown');

const beforeImport=M.table(housing,{},goals,'2026-11',meetings,{customerRows:[],customerImported:false});
assert.ok(beforeImport.rows.every(r=>r.customer_count==='待导入'),'no uploaded snapshot must not be shown as observed zeros');
sandbox.block=beforeImport;
const beforeHtml=vm.runInContext('renderTable(block)',sandbox);
assert.match(beforeHtml,/待导入/);
console.log('PASS: 21 stores, customer totals and hierarchy, no-owner slashes, additive minimum counts, and copied-image rendering.');
