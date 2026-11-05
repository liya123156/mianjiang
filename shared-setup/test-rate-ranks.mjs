import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const M=require('../operations/core.js');
const store=(name,met,stock,topMet=met,topStock=stock,unitMet=met,unitStock=stock,region='大区A')=>({
  _level:'store',region,store:name,met,stock,met_rate:M.pct(met,stock),
  store_top_met:topMet,store_top_stock:topStock,store_top_rate:M.pct(topMet,topStock),
  unit_top_met:unitMet,unit_top_stock:unitStock,unit_top_rate:M.pct(unitMet,unitStock)
});
const rows=[store('A',1,4,0,5,2,4),store('B',1,2,2,5,0,4),store('C',2,4,1,5,0,8),store('无基数',0,0,0,0,0,0)];
const summary={...store('汇总',10,10),_level:'company'};
const group={...store('店组',0,10),_level:'group'};
const block={variant:'progress',rows:[summary,...rows,group]};
const ranked=M.withRateRanks(block,block.rows);
assert.deepEqual(ranked.rows[1]._rateRanks,{met_rate:'lowest',store_top_rate:'lowest',unit_top_rate:'highest'});
assert.deepEqual(ranked.rows[2]._rateRanks,{met_rate:'highest',store_top_rate:'highest',unit_top_rate:'lowest'});
assert.deepEqual(ranked.rows[3]._rateRanks,{met_rate:'highest',unit_top_rate:'lowest'});
for(const i of [0,4,5])assert.deepEqual(ranked.rows[i]._rateRanks,{});
assert.equal(rows[0]._rateRanks,undefined,'ranking must not mutate archived or live source rows');
assert.equal(M.rateRankSymbol(ranked.rows[1],'met_rate'),'❗');
assert.equal(M.rateRankSymbol(ranked.rows[2],'met_rate'),'👍');
assert.equal(M.rateRankSymbol({...ranked.rows[2],_level:'region'},'met_rate'),'');
assert.equal(M.rateRankSymbol(ranked.rows[2],'gift_rate'),'');
assert.match(M.rateRankLabel(ranked.rows[2],'met_rate'),/全司单店最高/);

// Filtering a view must preserve the full-company comparison, not create local winners.
const onlyA=M.withRateRanks({rows:[rows[0]]},block.rows).rows[0];
assert.equal(onlyA._rateRanks.met_rate,'lowest');
assert.equal(onlyA._rateRanks.store_top_rate,'lowest');
const middle=M.withRateRanks({rows:[store('中间',2,10)]},[store('最低',1,10),store('中间',2,10),store('最高',3,10)]);
assert.deepEqual(middle.rows[0]._rateRanks,{});

// Use real ratios even if the displayed two-decimal percentages are identical.
const rounded=[store('R1',1,10001),store('R2',1,10002)];
assert.equal(rounded[0].met_rate,rounded[1].met_rate);
const roundRank=M.withRateRanks({rows:rounded},rounded).rows;
assert.equal(roundRank[0]._rateRanks.met_rate,'highest');
assert.equal(roundRank[1]._rateRanks.met_rate,'lowest');
for(const same of [[store('A',0,10),store('B',0,20)],[store('A',1,2),store('B',2,4)],[store('A',1,2),store('B',0,0)]]){
  assert.ok(M.withRateRanks({rows:same},same).rows.every(row=>Object.keys(row._rateRanks).length===0),'all equal or only one eligible store has no rank');
}
const bad=[store('A',1,2),store('B',NaN,10),store('C','',10),store('D',1,Infinity)];
assert.ok(M.withRateRanks({rows:bad},bad).rows.every(row=>Object.keys(row._rateRanks).length===0));
const duplicateNames=[store('同名店',1,10,1,10,1,10,'一区'),store('同名店',2,10,2,10,2,10,'二区')];
const named=M.withRateRanks({rows:duplicateNames},duplicateNames).rows;
assert.equal(named[0]._rateRanks.met_rate,'lowest');
assert.equal(named[1]._rateRanks.met_rate,'highest');
assert.ok(M.withRateRanks(ranked,[]).rows.every(row=>Object.keys(row._rateRanks).length===0),'missing full-company data clears stale marks');

// The legacy UI is an IIFE. Run its actual source-selection functions with isolated
// dependencies to cover the historical fallback without creating a browser session.
const uiSource=await readFile(new URL('../operations/ui.js',import.meta.url),'utf8');
const rankingSource=uiSource.slice(uiSource.indexOf(' function archivedProgress('),uiSource.indexOf(' function daily('));
assert.ok(rankingSource.includes('function rankProgress('));
const uiContext={M,currentMonth:'2026-10',goals:()=>({}),customerOptions:()=>({}),viewKey:view=>view.scope==='company'?'company':view.scope+':'+view.name,
  ARCHIVE:{months:{'2026-10':{views:{company:{sections:[{blocks:[block]}]}}}}}};
vm.runInNewContext(rankingSource,uiContext);
const archiveRank=uiContext.rankProgress({rows:[rows[0]]},{housing:[]});
assert.equal(archiveRank.rows[0]._rateRanks.met_rate,'lowest','historical store view compares against archived company stores');
const restrictedWithoutCompany=uiContext.rankProgress(ranked,{housing:[{store:'A'}],companyProgress:null});
assert.ok(restrictedWithoutCompany.rows.every(row=>Object.keys(row._rateRanks).length===0),'live scoped data must not fall back to an older archive ranking');

// Exercise the actual public/private loader boundary without any network or credentials.
const cloudSource=await readFile(new URL('../operations/cloud.js',import.meta.url),'utf8');
const stamp={as_of:'2026-11-05',created_at:'2026-11-05T01:00:00Z'};
const publicData={housing:[{store:'A'},{store:'B'}],imports:[stamp],items:[]};
const privateData={housing:[{store:'A'}],imports:[stamp],items:[]};
const customerData={customerRows:[{region:'大区A',store:'A',group:'A组',name:'测试甲',count:3},{region:'大区A',store:'B',group:'B组',name:'测试乙',count:1}],customerImported:true,customerImport:{month:'2026-11',as_of:'2026-11-04',total:4},storeCatalog:[]};
async function cloudCase({loggedIn=false,role='store',publicFailure=false,changedStamp=false,customerImported=true}={}){
  const requests=[];
  const context={window:{WORKBENCH_CLOUD:{url:'https://testproject.supabase.co',anonKey:'public-test-key-'.repeat(4)}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},URL,Date,console};
  context.fetch=async(url,options)=>{
    const name=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({name,body});
    let value;
    if(name==='wb_code_login')value={token:'test-only-token',expires_at:9999999999,member:{role,store:'A',region:'大区A'}};
    else if(name==='wb_public_archives')value=[];
    else if(name==='wb_customer_api'&&body.p_action==='load')value=customerImported?customerData:{customerRows:[],customerImported:false,customerImport:null,storeCatalog:[]};
    else if(name==='wb_customer_api'&&body.p_action==='import')value={month:body.p_args.month,total:body.p_args.rows.reduce((n,r)=>n+r.count,0)};
    else if(name==='wb_public_daily'){
      if(publicFailure)return {ok:false,text:async()=>JSON.stringify({message:'unavailable'})};
      value=changedStamp?{...publicData,imports:[{...stamp,created_at:'2026-11-05T02:00:00Z'}]}:publicData;
    }else if(name==='wb_code_api'&&body.p_action==='load')value=body.p_args.p_month==='2000-01'?{items:[]}:privateData;
    else throw Error('Unexpected request '+name);
    return {ok:true,text:async()=>JSON.stringify(value)};
  };
  vm.runInNewContext(cloudSource,context);
  const cloud=context.window.WBCloud;
  if(loggedIn)await cloud.login('1234');
  const loaded=await cloud.load('2026-11');
  return {loaded,requests,cloud};
}
const anonymous=await cloudCase();
assert.equal(anonymous.requests.filter(x=>x.name==='wb_public_daily').length,1,'anonymous read reuses one public request');
assert.equal(anonymous.loaded.companyProgress.housing,anonymous.loaded.housing);
assert.equal(anonymous.loaded.customerImported,true);
assert.equal(anonymous.loaded.customerRows.reduce((n,r)=>n+r.count,0),4);
assert.equal(anonymous.loaded.customerImport.as_of,'2026-11-04','customer and owner data retain independent cutoff dates');
assert.equal(anonymous.requests.find(x=>x.name==='wb_customer_api').body.p_token,null,'reading public business totals needs no private session token');
assert.equal((await cloudCase({customerImported:false})).loaded.customerImport,null,'no customer import remains distinguishable from an imported zero snapshot');
const scoped=await cloudCase({loggedIn:true});
assert.equal(scoped.loaded.housing.length,1,'private display remains restricted to the assigned store');
assert.equal(scoped.loaded.companyProgress.housing.length,2,'rank comparison uses already-public full-company progress');
for(const options of [{loggedIn:true,publicFailure:true},{loggedIn:true,changedStamp:true}]){
  const {loaded}=await cloudCase(options);
  assert.equal(loaded.housing.length,1);
  assert.equal(loaded.companyProgress,null,'unavailable or mismatched company data must not imply a scoped company ranking');
}
const customerSnapshot={month:'2026-11',asOf:'2026-11-04',rows:customerData.customerRows,filenames:['synthetic.csv']};
for(const state of [anonymous,scoped]){
  const before=state.requests.length;
  await assert.rejects(()=>state.cloud.importCustomerSnapshot(customerSnapshot),/仅项目负责人/);
  assert.equal(state.requests.length,before,'anonymous and store roles cannot issue customer-import requests');
}
const project=await cloudCase({loggedIn:true,role:'project'});
const saved=await project.cloud.importCustomerSnapshot(customerSnapshot);
assert.equal(saved.total,4);
const write=project.requests.at(-1);
assert.equal(write.name,'wb_customer_api');
assert.equal(write.body.p_action,'import');
assert.equal(write.body.p_token,'test-only-token','import passes the existing scoped session to the server for authorization');
assert.deepEqual(write.body.p_args,customerSnapshot);
console.log('Rate ranking: exact ratios, ties, filters, source isolation, import consistency, and customer public-read/project-write boundary passed.');
