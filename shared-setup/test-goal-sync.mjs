/* Monthly goal changes must recalculate rates from the same current inventory in every scope. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const x={window:null,console,Intl,Date,crypto:globalThis.crypto};x.window=x;vm.createContext(x);
vm.runInContext(fs.readFileSync(new URL('../operations/core.js',import.meta.url),'utf8'),x,{filename:'core.js'});
const M=x.WBModel,month='2026-11';
const stores=[['花木大区','御翠园店',59],['花木大区','碧云店',40],['徐汇大区','尚海湾店',71]];
const house=(region,store,index,active=1)=>({'房源编号':store+'-'+index,'大区':region,'门店':store,'店组':store+'A组','维护人姓名':'测试伙伴','细分在售户数':active,'本月是否面见':index<2?1:0,'门店top户数':index<4?1:0,'户型top户数':index<5?1:0});
const housing=stores.flatMap(([region,store,count])=>Array.from({length:count},(_,i)=>house(region,store,i)));
housing.push(house('花木大区','御翠园店','inactive',0));
const goals={'御翠园店':13,'碧云店':8,'尚海湾店':20};
const row=(block,level,name)=>block.rows.find(r=>r._level===level&&(level==='company'||(level==='region'?r.region:r.store)===name));
const company=()=>M.table(housing,{},goals,month);
const selected=()=>M.table(housing,{region:'花木大区',store:'御翠园店'},goals,month);

const original=company(),beforeStore=row(original,'store','御翠园店');
assert.equal(beforeStore.target,13);assert.equal(beforeStore.target_rate,'22.03%');assert.equal(beforeStore.stock,59,'inactive inventory does not enter the target-rate denominator');
assert.equal(row(original,'region','花木大区').target,21);assert.equal(row(original,'region','花木大区').target_rate,'21.21%');
assert.equal(row(original,'company').target,41);assert.equal(row(original,'company').target_rate,'24.12%');

goals['御翠园店']=20;
const updated=company(),afterStore=row(updated,'store','御翠园店');
assert.equal(afterStore.target,20);assert.equal(afterStore.target_rate,'33.90%','13→20 immediately recalculates the store rate as 20/59');
assert.equal(row(updated,'region','花木大区').target,28);assert.equal(row(updated,'region','花木大区').target_rate,'28.28%','region uses aggregated goals/current stock, not a mean of store percentages');
assert.equal(row(updated,'company').target,48);assert.equal(row(updated,'company').target_rate,'28.24%','company uses aggregated goals/current stock');
assert.equal(row(selected(),'store','御翠园店').target_rate,afterStore.target_rate,'company and filtered-store views derive the same rate');
for(const key of ['stock','met','met_count','met_rate','gift','gift_rate','store_top_stock','store_top_met','store_top_rate','unit_top_stock','unit_top_met','unit_top_rate'])assert.equal(afterStore[key],beforeStore[key],'goal editing does not change actual business metric '+key);
assert.equal(beforeStore.target_rate,'22.03%','a previous export snapshot is not mutated in place');

goals['御翠园店']=0;
assert.equal(row(selected(),'store','御翠园店').target_rate,'0.00%','an explicit zero goal is not treated as missing');
assert.equal(row(company(),'region','花木大区').target,8);assert.equal(row(company(),'company').target,28);
delete goals['御翠园店'];
for(const r of [row(selected(),'store','御翠园店'),row(company(),'region','花木大区'),row(company(),'company')]){assert.equal(r.target,'—','a missing goal is not silently filled with zero');assert.equal(r.target_rate,'—');}
assert.equal(row(company(),'region','徐汇大区').target_rate,'28.17%','an incomplete goal in one region does not hide a complete goal in another');

goals['御翠园店']=20;
housing.push(house('花木大区','御翠园店',59));
assert.equal(row(selected(),'store','御翠园店').stock,60);assert.equal(row(selected(),'store','御翠园店').target_rate,'33.33%','an updated inventory denominator recalculates the unchanged goal');
const empty=M.table([],{region:'花木大区',store:'御翠园店'},goals,month,[],{showCustomer:true,storeCatalog:[{region:'花木大区',store:'御翠园店'}]});
assert.equal(row(empty,'store','御翠园店').target,20);assert.equal(row(empty,'store','御翠园店').target_rate,'—','zero stock never emits Infinity or NaN');

// UI tests use acknowledged server records, not inferred success or optimistic goal values.
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const goalKey=mon=>mon+'|goals|@@company|monthly';
const goalRecord=(value,stamp='2026-11-16T01:00:00Z',mon=month)=>({key:goalKey(mon),kind:'goals',updated_at:stamp,payload:value});
const qualityPayload={recordType:'public-quality',test:true};
function business(value,stamp){return {housing:housing.filter(h=>h['房源编号']!=='御翠园店-59'),meetings:[],items:[goalRecord(value,stamp),{key:month+'|goals|@@company|quality-summary-v1',kind:'goals',payload:qualityPayload}],imports:[{as_of:'2026-11-15',created_at:'source-v1'}]};}
function harness(){
 const member={role:'project',login_id:'0921'},notices=[],listeners={};
 const ctx={window:null,console,Intl,Date,URL,crypto:globalThis.crypto,currentMonth:month,currentMode:'plan',currentView:{scope:'company',name:'全司'},ARCHIVE:{months:{}},DATA:{meta:{}},notify:text=>notices.push(text),viewKey:v=>v.scope+':'+v.name,
  document:{addEventListener(name,handler){(listeners[name]||=[]).push(handler);},getElementById(){return null;}},WBCloud:{configured:true,member,project:true},WBQuality:{records:()=>[],publicSummary:()=>qualityPayload,canonical:JSON.stringify}};
 ctx.window=ctx;vm.createContext(ctx);
 for(const name of ['core','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),ctx,{filename:name+'.js'});
 const U=ctx.WBOperations,cache=business({'御翠园店':13,'碧云店':8,'尚海湾店':20});cache.companyProgress=business({'御翠园店':13,'碧云店':8,'尚海湾店':20});cache.reader=member;U.state.cache[month]=cache;
 return {ctx,U,cache,notices,listeners};
}
function savedGoals(data,mon=month){return data.items.find(i=>i.key===goalKey(mon))?.payload;}

{
 const {U,cache}=harness();
 assert.equal(U.goalRatePreview('御翠园店',20),'目标面见率：33.90% · 20套 ÷ 在售59套');
 assert.equal(U.goalRatePreview('御翠园店',20,true),'目标面见率：33.90%（待保存） · 20套 ÷ 在售59套');
 assert.match(U.goalRatePreview('御翠园店',0),/0\.00%/);assert.match(U.goalRatePreview('御翠园店',''),/未设目标/);
 for(const invalid of [-1,1.2,'NaN'])assert.match(U.goalRatePreview('御翠园店',invalid),/非负整数/);
 assert.match(U.goalRatePreview('长宁古北店',20),/在售0套/);
 const output={textContent:''},input={name:'御翠园店',value:'20',parentElement:{querySelector:()=>output}};U.updateGoalRatePreview(input);assert.match(output.textContent,/33\.90%（待保存）/,'input edits immediately show the unsaved calculated rate');
 input.value='13';U.updateGoalRatePreview(input);assert.ok(!output.textContent.includes('待保存'),'unchanged inputs are not marked as edits');
 cache.housing=[];assert.match(U.goalRatePreview('御翠园店',20),/33\.90%/,'preview may use the matching company inventory');cache.companyProgress=null;assert.match(U.goalRatePreview('御翠园店',20),/待导入/);
}
{
 const {ctx,U,cache}=harness(),loadStarted=deferred(),reload=deferred(),sent=[];
 ctx.WBCloud.saveItem=async(...args)=>{sent.push(args);return goalRecord(args[5]);};
 ctx.WBCloud.load=()=>{loadStarted.resolve();return reload.promise;};
 const saving=U.saveMonthlyGoals({'御翠园店':'20','碧云店':'8','尚海湾店':'20'});await loadStarted.promise;
 assert.deepEqual(sent[0].slice(0,5),[month,'goals','monthly',null,null]);assert.equal(sent[0][6],'2026-11-16T01:00:00Z','the save retains the known server version guard');
 const committedCache=U.state.cache[month];assert.notEqual(committedCache,cache,'a save replaces the cache identity so exports already in flight become stale');
 assert.equal(savedGoals(committedCache)['御翠园店'],20,'the acknowledged save is applied before reload completes');assert.equal(savedGoals(committedCache.companyProgress)['御翠园店'],20,'public comparison input is synchronized too');assert.equal(savedGoals(cache)['御翠园店'],13,'the old export input is kept internally consistent');
 assert.equal(U.goalRatePreview('御翠园店',20),'目标面见率：33.90% · 20套 ÷ 在售59套');
 reload.reject(Error('temporary reload failure'));const result=await saving;
 assert.equal(result.refreshed,false);assert.equal(U.state.error,'temporary reload failure');assert.equal(savedGoals(U.state.cache[month])['御翠园店'],20,'reload failure never restores the old goal');
 assert.equal(row(ctx.WBModel.table(committedCache.housing,{},savedGoals(committedCache),month),'store','御翠园店').target_rate,'33.90%');
}
{
 const {ctx,U}=harness(),old=deferred(),latest=deferred(),newLoadStarted=deferred();let loads=0;
 ctx.WBCloud.load=()=>{loads++;if(loads===1)return old.promise;newLoadStarted.resolve();return latest.promise;};
 ctx.WBCloud.saveItem=async(...args)=>goalRecord(args[5]);
 const staleRefresh=U.refresh(),saving=U.saveMonthlyGoals({'御翠园店':20,'碧云店':8,'尚海湾店':20});await newLoadStarted.promise;
 latest.resolve(business({'御翠园店':13,'碧云店':8,'尚海湾店':20},'2026-11-15T01:00:00Z'));assert.equal((await saving).refreshed,true);
 assert.equal(savedGoals(U.state.cache[month])['御翠园店'],20,'a stale reload response is merged with the acknowledged goal');
 old.resolve(business({'御翠园店':13,'碧云店':8,'尚海湾店':20},'2026-11-14T01:00:00Z'));await staleRefresh;
 assert.equal(savedGoals(U.state.cache[month])['御翠园店'],20,'an older in-flight refresh cannot replace the post-save cache');assert.equal(U.state.loading,false);
 ctx.WBCloud.load=async()=>business({'御翠园店':22,'碧云店':8,'尚海湾店':20},'2026-11-17T01:00:00Z');await U.refresh();
 assert.equal(savedGoals(U.state.cache[month])['御翠园店'],22,'a newer server update wins over the retained save acknowledgment');
}
{
 const {ctx,U}=harness();ctx.ARCHIVE.months[month]={views:{store:{scope:'store',name:'御翠园店',sections:[{blocks:[{variant:'progress',rows:[{_level:'store',target:13}]}]}]}}};
 ctx.WBCloud.saveItem=async(...args)=>[goalRecord(args[5])];ctx.WBCloud.load=async()=>business({},'2026-11-16T01:00:00Z');
 await U.saveMonthlyGoals({'御翠园店':'','碧云店':'','尚海湾店':''});
 assert.deepEqual(Object.keys(savedGoals(U.state.cache[month])),[],'cleared goals remain an acknowledged empty map');
 const output={textContent:''};U.updateGoalRatePreview({name:'御翠园店',value:'',parentElement:{querySelector:()=>output}});
 assert.equal(output.textContent,'目标面见率：未设目标','a saved empty map does not fall back to archived targets or appear unsaved');
 assert.equal(row(ctx.WBModel.table(U.state.cache[month].housing,{},savedGoals(U.state.cache[month]),month),'store','御翠园店').target_rate,'—');
}
{
 const {ctx,U,cache}=harness(),ack=deferred(),nextCache={items:[goalRecord({'御翠园店':99},undefined,'2026-12')],housing:[]};let reloads=0;
 ctx.WBCloud.saveItem=()=>ack.promise;ctx.WBCloud.load=async()=>{reloads++;return business({});};
 const saving=U.saveMonthlyGoals({'御翠园店':20});ctx.currentMonth='2026-12';U.state.cache['2026-12']=nextCache;ack.resolve(goalRecord({'御翠园店':20}));await saving;
 assert.equal(savedGoals(U.state.cache[month])['御翠园店'],20);assert.equal(savedGoals(nextCache,'2026-12')['御翠园店'],99,'finishing a save after a month switch does not write into the newly selected month');assert.equal(reloads,0);
}
{
 const {ctx,U}=harness();let saves=0;ctx.WBCloud.saveItem=async()=>{saves++;};
 for(const value of [-1,1.5,'not-a-number'])await assert.rejects(U.saveMonthlyGoals({'御翠园店':value}),/非负整数/);
 assert.equal(saves,0);ctx.WBCloud.project=false;await assert.rejects(U.saveMonthlyGoals({'御翠园店':20}),/项目负责人/);assert.equal(saves,0);
}

console.log('PASS goal synchronization: model rates/aggregation, live unsaved preview, acknowledged saves, reload failures, stale async responses, newer server versions, cleared goals, month-switch isolation and validation.');
