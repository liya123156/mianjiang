/* Planning, daily publication and copied plans share the acknowledged monthly goal record. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const month='2026-11',company={scope:'company',name:'全司'},key=month+'|goals|@@company|monthly';
const source=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness({actor=null}={}){
 const elements=new Map(),listeners={},renders=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,querySelectorAll:()=>[],setAttribute(){}});return elements.get(id);};
 const document={addEventListener(name,fn){(listeners[name]||=[]).push(fn);},getElementById:el,querySelector:el,querySelectorAll:()=>[]};
 const x={window:null,document,console,Intl,Date,URL,URLSearchParams,crypto:globalThis.crypto,currentMonth:month,currentMode:'plan',currentView:company,tableModels:new Map(),tableSerial:0,
  DATA:{meta:{},regions:[],views:{'company:全司':company}},ARCHIVE:{months:{}},location:{href:'https://example.test/',search:'',hash:''},history:{replaceState(){}},
  notify(){},viewKey:v=>v.scope+':'+v.name,viewFromUrl:()=>company,highlight(){},esc:v=>String(v??''),
  WBCloud:{configured:true,member:actor},WBQuality:{records:()=>[],publicSummary:()=>({recordType:'public-quality',sentinel:true}),canonical:JSON.stringify}};
 Object.defineProperty(x.WBCloud,'project',{get:()=>x.WBCloud.member?.role==='project'});
 x.window=x;vm.createContext(x);
 for(const name of ['operations/core.js','project-plan.js','operations/november-plan.js','operations/ui.js'])vm.runInContext(source(name),x,{filename:name});
 x.syncPlanScope=()=>{};
 const original=x.renderProject;
 x.renderProject=view=>{renders.push(view);return original(view);};
 const U=x.WBOperations,M=x.WBModel,owners=M.storeCatalog.filter(entry=>entry.ownerApplicable!==false);
 const values=Object.fromEntries(owners.map(entry=>[entry.store,19]));
 const goalRecord=(payload,stamp='2026-11-16T08:00:00Z')=>({key,kind:'goals',payload:{...payload},updated_at:stamp});
 function business(payload=values,stamp,reader=x.WBCloud.member){
  const housing=owners.map((entry,i)=>({'房源编号':'p'+i,'大区':entry.region,'门店':entry.store,'店组':entry.store+'A组','维护人姓名':'测试伙伴','细分在售户数':1,'本月是否面见':0}));
  return {reader,housing,meetings:[],items:[goalRecord(payload,stamp),{key:month+'|goals|@@company|quality-summary-v1',kind:'goals',payload:{recordType:'public-quality',sentinel:true}}],imports:[{as_of:'2026-11-15',created_at:'source-v1'}],snapshots:[],periods:[]};
 }
 const install=(payload=values,stamp)=>{const d=business(payload,stamp);if(actor)d.companyProgress=business(payload,stamp);U.state.cache[month]=d;return d;};
 const html=()=>x.WBNovemberPlan.render(company),text=()=>x.WBNovemberPlan.exportText();
 return {x,U,M,owners,values,goalRecord,business,install,html,text,elements,renders};
}
function verifyPublishedTargets(h,total){
 const plan=h.U.novemberTargets();assert.equal(plan.total,total);
 assert.equal(plan.stores.length,18,'only owner-meeting stores enter the quantitative target breakdown');assert.equal(plan.regions.length,5);
 assert.equal(plan.stores.reduce((n,row)=>n+row.target,0),total);assert.equal(plan.regions.reduce((n,row)=>n+row.target,0),total);
 const html=h.html(),text=h.text();
 assert.ok(html.includes('>'+total+'套<'),'rendered plan total '+total);assert.ok(text.includes('全司目标：'+total+'套'),'copy plan uses the same total');
 assert.equal(html.includes('300套'),false,'rendered planning prose has no old hard-coded total');assert.equal(text.includes('300套'),false,'copied planning prose has no old hard-coded total');
 for(const item of plan.stores)assert.ok(text.includes(item.store+'：'+item.target+'套'),'copy keeps exact store target '+item.store);
 for(const item of plan.regions)assert.ok(text.includes(item.name+'：'+item.target+'套'),'copy keeps exact region target '+item.name);
 const coverage=html.match(/<article data-plan-metric="owner-stores">([\s\S]*?)<\/article>/)?.[1]||'';
 assert.ok(coverage.includes('业主面见覆盖门店')&&coverage.includes('18家'),'owner-meeting coverage card matches the 18-store quantitative scope');
 for(const v of ['100%','≥20%','≥40%'])assert.ok(html.includes(v),'strategy standard remains '+v);
 assert.doesNotMatch(html,/NaN|undefined套|null套/);
 return plan;
}

// An unloaded planning page must not silently substitute the old 300-suite baseline.
{
 const h=harness();
 assert.equal(h.html().includes('300套'),false,'unloaded plan does not show old total');assert.equal(h.text().includes('300套'),false,'unloaded copy does not show old total');
 const plan=h.U.novemberTargets();assert.ok(!plan||plan.total===null||plan.total===undefined,'there is no confirmed total before loading');
}

// Public goals remain global even when the rendered planning scope is regional or one store.
{
 const h=harness();h.install({...h.values,'徐汇一店':999,'Hmall中心店':999,'Hmall旗舰店':999});
 const plan=verifyPublishedTargets(h,342);
 assert.ok(!plan.stores.some(row=>row.store==='徐汇一店'));
 for(const view of [{scope:'region',name:plan.regions[0].name,region:plan.regions[0].name},{scope:'store',name:plan.stores[0].store,store:plan.stores[0].store,region:plan.stores[0].region}]){
  h.x.currentView=view;assert.match(h.x.WBNovemberPlan.render(view),/>342套</,'shared plan does not relabel scoped data as a company total');
 }
 const changed={...h.values,[h.owners[0].store]:26};h.install(changed,'2026-11-16T09:00:00Z');verifyPublishedTargets(h,349);
}

// A missing goal is not zero; clear-all never restores archived or hard-coded targets.
{
 const h=harness(),missing={...h.values};delete missing[h.owners[0].store];h.install(missing);
 let plan=h.U.novemberTargets();assert.equal(plan.total,null);assert.equal(plan.stores.find(row=>row.store===h.owners[0].store).target,null);
 assert.equal(plan.regions.find(row=>row.name===h.owners[0].region).target,null);
 assert.doesNotMatch(h.html(),/null套|undefined套|NaN|300套/);assert.doesNotMatch(h.text(),/null套|undefined套|NaN|300套/);
 h.install({});plan=h.U.novemberTargets();assert.equal(plan.total,null);assert.ok(plan.stores.every(row=>row.target===null));
 assert.equal(h.html().includes('300套'),false,'unloaded plan does not show old total');assert.equal(h.text().includes('300套'),false,'unloaded copy does not show old total');
 h.install(Object.fromEntries(h.owners.map(entry=>[entry.store,0])));verifyPublishedTargets(h,0);
}

// A cached private response cannot be reused after the active reader changes.
{
 const actor={role:'project'},h=harness({actor});h.install();h.x.WBCloud.member={role:'project'};
 const plan=h.U.novemberTargets();assert.ok(!plan||plan.total===null||plan.total===undefined);
 assert.doesNotMatch(h.html(),/>342套</,'stale private reader is not a planning source');
}

// Entering a guest planning page starts one load and refreshes the visible plan when complete.
{
 const h=harness(),pending=deferred();let loads=0;
 h.x.WBCloud.load=()=>{loads++;return pending.promise;};
 h.x.renderProject(company);assert.equal(loads,1,'initial plan render requests shared targets');
 h.x.renderProject(company);assert.equal(loads,1,'a render during an existing request does not start duplicate loads');
 assert.equal(h.elements.get('report').innerHTML.includes('300套'),false,'initial planning render has no static total');
 pending.resolve(h.business());
 // Resolve the returned load and any follow-up publication microtasks without timing assumptions.
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(h.U.state.loading,false);assert.ok(h.renders.length>=3,'the completed target load redraws plan mode');
 assert.match(h.elements.get('report').innerHTML,/>342套</);verifyPublishedTargets(h,342);
}

// Saving the acknowledged record updates planning totals and copy, even if reloading fails.
{
 const actor={role:'project'},h=harness({actor});h.install();
 h.x.WBCloud.saveItem=async(...args)=>h.goalRecord(args[5],'2026-11-16T10:00:00Z');
 h.x.WBCloud.load=async()=>{throw Error('temporary reload failure');};
 const updated={...h.values,[h.owners[0].store]:26},result=await h.U.saveMonthlyGoals(updated);
 assert.equal(result.refreshed,false);assert.ok(h.renders.length>0,'saving in plan mode redraws the acknowledged target');verifyPublishedTargets(h,349);
 assert.match(h.elements.get('report').innerHTML,/>349套</);
}

// A finished November refresh must not replace a later selected month or its page.
{
 const h=harness(),pending=deferred();h.x.WBCloud.load=()=>pending.promise;
 const loading=h.U.refresh();h.x.currentMonth='2026-12';pending.resolve(h.business());await loading;
 assert.equal(h.renders.length,0);assert.equal(h.U.state.cache[month].items.find(row=>row.key===key).payload[h.owners[0].store],19);
}

console.log('PASS planning goal synchronization: live company/region/store targets, copied prose, missing/zero goals, reader isolation, initial public load/redraw, acknowledged saves and month isolation.');
