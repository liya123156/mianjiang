/* Stateful UI regression checks without a browser or a DOM dependency. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const events=new Map();
const notices=[];
const document={addEventListener(type,fn){events.set(type,fn);},getElementById(){return null;}};
const x={window:null,document,console,Intl,Date,URL,Blob,HTMLElement:class{},navigator:{}};
x.window=x;x.addEventListener=()=>{};vm.createContext(x);
for(const name of ['core','quality-feed','quality-rules','quality','store-review-model'])vm.runInContext(read('operations/'+name+'.js'),x,{filename:name+'.js'});
const marker='root.WBStoreReviews={';
const source=read('operations/store-reviews.js');
assert.ok(source.includes(marker),'private test seam remains explicit');
vm.runInContext(source.replace(marker,'root.testStoreReviews={catalog,draftKey,fieldsDefault,existing,draft,currentSnapshot,storeHtml,paint,check,load,save,dirty,mergeRemote,conflictHtml,synthesis,reportData};'+marker),x,{filename:'store-reviews.js'});
const U=x.testStoreReviews,S=x.WBStoreReviews.state,R=x.WBStoreReviewModel;
const store={region:'黄浦大区',store:'新天地一店'};
const period={periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15'};
const priorPeriod={periodType:'weekly',periodStart:'2026-11-02',periodEnd:'2026-11-08'};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const cell=()=>({textContent:'',innerHTML:'',disabled:false,isConnected:true});
function host(){const notice=cell(),summary=cell();return {isConnected:true,innerHTML:'',notice,summary,querySelector(s){return s==='[data-sr-notice]'?notice:s==='[data-sr-synthesis]'?summary:null;}};}
function business(month='2026-11',version='source-v1',met=1){
 const date=month+'-12';return {month,imports:[{as_of:date,created_at:version}],items:[{key:month+'|goals|monthly',kind:'goals',payload:{[store.store]:13}}],
  housing:[{'房源编号':'h1','大区':store.region,'门店':store.store,'店组':store.store+'A组','细分在售户数':1,'本月是否面见':met,'门店top户数':1,'户型top户数':1}],
  meetings:met?[{'房源编号':'h1','面见id':'event1','面见时间':date+' 10:00'}]:[]};
}
function context({member={login_id:'0921',display_name:'张亚玲'},view={},month='2026-11',cloudCall=async()=>({items:[],businessData:business(month)})}={}){
 return {month,view,host:host(),asOf:month+'-12',goals:{[store.store]:13},notify:t=>notices.push(t),publicData:business(month),cloud:{member,storeReview:cloudCall}};
}
function reset(){for(const name of ['cache','pending','drafts','selection','saving','open'])S[name].clear();S.actor='0921';S.context=null;notices.length=0;}
function ready(ctx,data=business(ctx.month),items=[]){S.cache.set(ctx.month,{businessData:copy(data),items:copy(items),previousItems:[],loading:false});S.context=ctx;}
function row(ctx,p=period,overrides={}){
 const snap=R.makeSnapshot({...p,month:ctx.month,...store,housing:business(ctx.month).housing,meetings:business(ctx.month).meetings,goals:ctx.goals,asOf:ctx.asOf,sourceVersion:'source-v1'});
 return {key:ctx.month+'|review|'+store.store+'|store-period-review:'+p.periodType+':'+p.periodStart+':'+p.periodEnd,month:ctx.month,kind:'review',...store,updated_at:'2026-11-15T08:00:00Z',payload:{recordType:'store-period-review',periodType:p.periodType,periodStart:p.periodStart,periodEnd:p.periodEnd,status:'draft',fields:{...U.fieldsDefault(),periodGoal:4,actions:'原定动作',highlights:'原分享',nextGoal:5,nextActions:'下周动作'},snapshot:snap,...overrides}};
}
function form(d){
 const status=cell(),saveNote=cell(),analysis=cell(),completion=cell(),submit=cell(),image=cell();
 const detail={querySelector:s=>s==='[data-sr-status]'?status:null};
 const elements=Object.fromEntries(Object.entries(d.fields).map(([k,v])=>[k,{value:v??''}]));elements.confirmed={checked:d.status==='confirmed'};
 return {dataset:{reviewStore:store.store},elements,status,saveNote,analysis,completion,submit,image,reportValidity:()=>true,closest:s=>s==='details'?detail:null,
  querySelector:s=>({'[type="submit"]':submit,'[data-sr-save-note]':saveNote,'[data-sr-analysis]':analysis,'[data-sr-completion]':completion,'[data-sr="image"]':image}[s]||null)};
}
function click(ctx,action,f,extra={}){S.context=ctx;const b={dataset:{sr:action,...extra},closest:s=>s==='.sr-form'?f:null};return events.get('click')({target:{closest:s=>s==='[data-sr]'?b:null}});}

// Five regions retain eighteen owner stores and a consistent five-part report.
reset();let ctx=context();ready(ctx);U.paint(ctx);
assert.equal((ctx.host.innerHTML.match(/class="sr-region"/g)||[]).length,5);
assert.equal((ctx.host.innerHTML.match(/class="sr-store"/g)||[]).length,18);
for(const excluded of ['徐汇一店','Hmall中心店','Hmall旗舰店'])assert.ok(!ctx.host.innerHTML.includes(excluded),excluded+' is excluded from owner reviews');
for(const label of ['一、目标达成与数据分析','二、核心动作与执行情况','三、有效做法与标杆分享','四、需要提升与卡点问题分析','五、下周目标与核心举措'])assert.ok(ctx.host.innerHTML.includes(label),label);
ctx.view={region:'黄浦大区'};U.paint(ctx);assert.equal((ctx.host.innerHTML.match(/class="sr-store"/g)||[]).length,4);
ctx.view={region:store.region,store:store.store};U.paint(ctx);assert.equal((ctx.host.innerHTML.match(/class="sr-store"/g)||[]).length,1);
assert.ok(!ctx.host.innerHTML.includes('name="periodGoal" type="number" min="0" max="100000"'),'client target range matches server');

// The actual persisted date names are accepted after reloading; data is frozen.
reset();ctx=context();let saved=row(ctx);ready(ctx,business(),[saved]);
let d=U.draft(ctx,period,store);
assert.equal(d.row.key,saved.key);assert.equal(d.fields.actions,'原定动作');
assert.equal(d.snapshot.sourceVersion,'source-v1');
S.drafts.clear();S.cache.get(ctx.month).businessData=business(ctx.month,'source-v2',0);
d=U.draft(ctx,period,store);assert.equal(d.snapshot.sourceVersion,'source-v1','saved snapshot stays frozen despite latest business data');
assert.equal(d.snapshot.period.met,1);
const sql=read('shared-setup/database-store-reviews.sql');
assert.match(sql,/'periodStart'\s*,\s*start_text/);assert.match(sql,/'periodEnd'\s*,\s*end_text/);

// Confirmed next-period targets carry across both week and month boundaries.
reset();ctx=context();const prior=row(ctx,priorPeriod,{status:'confirmed'});ready(ctx,business(),[prior]);
d=U.draft(ctx,period,store);assert.equal(d.fields.periodGoal,5);assert.equal(d.fields.actions,'下周动作');assert.equal(d.carried,true);
const localActions='尚未保存的逐组沟通';d.fields.actions=localActions;d.dirty=true;
S.selection.set(ctx.month,{type:'weekly',start:'2026-11-16'});U.paint(ctx);
S.selection.set(ctx.month,{type:'weekly',start:period.periodStart});U.paint(ctx);
assert.equal(U.draft(ctx,period,store).fields.actions,localActions,'switching periods does not discard unsaved input');
reset();ctx=context({month:'2026-12'});const november=context();
const lastWeek={periodType:'weekly',periodStart:'2026-11-30',periodEnd:'2026-11-30'};
const previousWeek=row(november,lastWeek,{status:'confirmed'});ready(ctx,business('2026-12'));S.cache.get(ctx.month).previousItems=[previousWeek];
const firstDecember=R.periods('2026-12')[0];assert.equal(firstDecember.periodStart,'2026-12-01');assert.equal(firstDecember.periodEnd,'2026-12-06');
d=U.draft(ctx,firstDecember,store);assert.equal(d.fields.periodGoal,5);assert.equal(d.fields.actions,'下周动作');
const previousMonth=row(november,{periodType:'monthly',periodStart:'2026-11-01',periodEnd:'2026-11-30'},{status:'confirmed'});
S.cache.get(ctx.month).previousItems=[previousMonth];
d=U.draft(ctx,{periodType:'monthly',periodStart:'2026-12-01',periodEnd:'2026-12-31'},store);assert.equal(d.fields.periodGoal,5);assert.equal(d.fields.actions,'下周动作');

// All editing/export controls stay disabled until the authenticated read finishes.
reset();const loading=deferred();let calls=0;ctx=context({cloudCall:async()=>{calls++;return loading.promise;}});S.context=ctx;
assert.match(U.storeHtml(ctx,period,store),/<fieldset disabled>/);
assert.match(U.storeHtml(ctx,period,store),/data-sr="image" disabled/);
const loadingPromise=U.load(ctx);assert.equal(calls,1);assert.equal(S.cache.get(ctx.month).loading,true);
assert.match(U.storeHtml(ctx,period,store),/<fieldset disabled>/);
loading.resolve({items:[],businessData:business()});await loadingPromise;
assert.doesNotMatch(U.storeHtml(ctx,period,store),/<fieldset disabled>/);
// Even a programmatic draft entered before load retains words while adopting safe data.
reset();const boot=deferred();ctx=context({cloudCall:()=>boot.promise});S.context=ctx;
d=U.draft(ctx,period,store);d.fields.actions='读取期间保留的输入';d.dirty=true;
const bootPromise=U.load(ctx);boot.resolve({items:[],businessData:business(ctx.month,'source-new',0)});await bootPromise;
assert.equal(d.fields.actions,'读取期间保留的输入');assert.equal(d.snapshot.sourceVersion,'source-new');assert.equal(d.snapshot.period.met,0);

// Shared conflicts merge independent fields and require a choice for overlapping edits.
reset();ctx=context();saved=row(ctx);ready(ctx,business(),[saved]);d=U.draft(ctx,period,store);
d.fields.actions='我的新动作';d.fields.highlights='我的新分享';d.dirty=true;
let remote=copy(saved);remote.updated_at='2026-11-15T09:00:00Z';remote.payload.fields.execution='另一位BP的执行';remote.payload.fields.highlights='另一位BP的分享';
U.mergeRemote(d,remote);
assert.equal(d.fields.actions,'我的新动作');assert.equal(d.fields.execution,'');assert.ok(d.conflicts.actions.includes('另一位BP的执行'));assert.equal(d.fields.highlights,'我的新分享');
assert.equal(d.conflicts.highlights,'另一位BP的分享');assert.equal(d.row.updated_at,remote.updated_at);
assert.ok(U.conflictHtml(d).includes('采用最新填写'));assert.ok(U.conflictHtml(d).includes('保留我的填写'));
await assert.rejects(()=>U.save(form(d),ctx),/同时修改/);
await click(ctx,'resolve',form(d),{field:'highlights',choice:'remote'});
assert.equal(d.fields.highlights,'另一位BP的分享');await click(ctx,'resolve',form(d),{field:'actions',choice:'remote'});assert.ok(d.fields.actions.includes('另一位BP的执行'));assert.equal(Object.keys(d.conflicts).length,0);
let submitted;
ctx.cloud.storeReview=async(action,args)=>{assert.equal(action,'save');submitted=copy(args);return {...remote,updated_at:'2026-11-15T09:01:00Z',payload:{...remote.payload,...args.payload}};};
await U.save(form(d),ctx);assert.equal(submitted.expectedUpdatedAt,remote.updated_at,'merged save advances its concurrency baseline');assert.equal(d.dirty,false);

// Refresh merges remote changes without throwing away local text or its save version.
remote=copy(d.row);remote.updated_at='2026-11-15T09:02:00Z';remote.payload.fields.blockers='共享更新的卡点';
d.fields.actions='刷新前未保存的动作';d.dirty=true;
ctx.cloud.storeReview=async(action)=>{assert.equal(action,'load');return {items:[remote],businessData:business(ctx.month,'source-v2',0)};};
await U.load(ctx,true);assert.equal(d.fields.actions,'刷新前未保存的动作');assert.equal(d.fields.blockers,'共享更新的卡点');assert.equal(d.row.updated_at,remote.updated_at);
assert.equal(d.snapshot.sourceVersion,'source-v1','refreshing reports never silently overwrites a saved historical snapshot');

// Updating source data really reads it again, retaining the current prose.
const beforeLatest=notices.length;let loads=0;
ctx.cloud.storeReview=async(action)=>{assert.equal(action,'load');loads++;return {items:[remote],businessData:business(ctx.month,'source-v3',0)};};
await click(ctx,'latest',form(d));
assert.equal(loads,1);assert.equal(d.snapshot.sourceVersion,'source-v3');assert.equal(d.snapshot.period.met,0);assert.equal(d.fields.actions,'刷新前未保存的动作');assert.equal(d.dirty,true);assert.ok(notices.slice(beforeLatest).some(t=>t.includes('最新底表')));

// In-flight saves preserve later typing, then confirmation refreshes just the summary.
reset();const saving=deferred();let saveArgs;ctx=context({cloudCall:async(action,args)=>{assert.equal(action,'save');saveArgs=copy(args);return saving.promise;}});ready(ctx);d=U.draft(ctx,period,store);d.fields.highlights='已核实的好做法';d.status='confirmed';d.dirty=true;
let f=form(d);const pendingSave=U.save(f,ctx);assert.equal(f.submit.disabled,true);
f.elements.actions.value='保存请求发出后的补充';U.dirty(f,ctx);
const firstSaved=row(ctx,{...period},{status:'confirmed',fields:copy(saveArgs.payload.fields)});firstSaved.updated_at='2026-11-15T09:03:00Z';saving.resolve(firstSaved);await pendingSave;
assert.equal(d.fields.actions,'保存请求发出后的补充');assert.equal(d.dirty,true);assert.equal(d.row.updated_at,firstSaved.updated_at);assert.equal(f.submit.disabled,false);
assert.ok(notices.some(t=>t.includes('仍有后续修改待保存')));
ctx.cloud.storeReview=async(action,args)=>({...firstSaved,updated_at:'2026-11-15T09:04:00Z',payload:{...firstSaved.payload,...copy(args.payload)}});
await U.save(form(d),ctx);assert.equal(d.dirty,false);assert.ok(ctx.host.summary.innerHTML.includes('已确认1/18店'));assert.ok(ctx.host.summary.innerHTML.includes('已核实的好做法'));

// Guest access cannot load or save, and the backend scope explicitly admits all eight BPs.
reset();let guestCalls=0;ctx=context({member:null,cloudCall:async()=>{guestCalls++;throw Error('must not call');}});S.context=ctx;
await U.load(ctx);assert.equal(guestCalls,0);assert.equal(U.check(ctx),false);
d=U.draft(ctx,period,store);await assert.rejects(()=>U.save(form(d),ctx),/管理入口/);assert.equal(guestCalls,0);
assert.match(U.storeHtml(ctx,period,store),/<fieldset disabled>/);U.paint(ctx);assert.ok(ctx.host.innerHTML.includes('BP／管理入口'));
for(const code of ['0003','0921','1317','1446','3401','3448','3273','0562'])assert.ok(sql.includes("'"+code+"'"),code+' is in the shared review allowlist');
assert.match(sql,/s\.expires_at>now\(\)/);assert.match(sql,/m\.enabled/);

console.log('PASS: 18-store structure, persisted dates, frozen snapshots, cross-month carryover, safe initial load, three-way conflicts, source refresh, in-flight input preservation, confirmation summary and login protection');
