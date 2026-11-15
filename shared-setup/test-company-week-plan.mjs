/* Calendar, calculation and stateful planning checks; no browser or remote writes. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const handlers=new Map(),rootHandlers=new Map(),notices=[];
const x={console,Intl,Date,URL,Blob,AbortController,document:{addEventListener:(name,fn)=>handlers.set(name,fn)}};x.window=x;x.addEventListener=(name,fn)=>rootHandlers.set(name,fn);
vm.createContext(x);
for(const name of ['core','quality-feed','quality-rules','quality','store-review-model'])vm.runInContext(read('operations/'+name+'.js'),x);
const source=read('operations/company-week-plan.js');
vm.runInContext(source.replace('root.WBCompanyWeekPlan={','root.testCWP={period,draft,read,render,editable,load,save,generate,cancelAI,adoptRemote,formula};root.WBCompanyWeekPlan={'),x);
const P=x.WBCompanyWeekPlan,U=x.testCWP,S=P.state;
const periods=P.periods('2026-11');
const week=periods.find(p=>p.periodStart==='2026-11-16');
assert.deepEqual(clone(P.defaultPeriod('2026-11','2026-11-15')),clone(week));
assert.equal(P.defaultPeriod('2026-12','2026-11-15').periodStart,'2026-12-01');
assert.equal(P.defaultPeriod('2026-11','2026-12-05').periodStart,'2026-11-30');
assert.equal(P.periods('2028-02').at(-1).periodEnd,'2028-02-29');
const targets=[15,8,13,16,31,23,28,21,22,9,14,16,16,5,18,13,14,18];
const met=[2,2,10,9,11,4,5,6,8,5,7,3,5,3,6,2,3,7];
function business(asOf='2026-11-12',version='2026-11-13T00:59:41.728675Z'){
 const owners=x.WBModel.storeCatalog.filter(s=>s.ownerApplicable!==false),goals={},housing=[],meetings=[];
 owners.forEach((s,i)=>{goals[s.store]=targets[i];for(let j=0;j<Math.max(met[i],3);j++)housing.push({'房源编号':s.store+'-'+j,'大区':s.region,'门店':s.store,'店组':s.store+'A组','细分在售户数':1,'本月是否面见':j<met[i]?1:0,'本月是否送礼物':0,'门店top户数':j===0?1:0,'户型top户数':j===1?1:0,'维护人姓名':'不应进入AI上下文的姓名','房间号':'不应进入AI上下文的房号'});});
 housing.push({'房源编号':'customer-only','大区':'徐汇大区','门店':'徐汇一店','细分在售户数':1,'本月是否面见':1});
 return {housing,meetings,imports:[{as_of:asOf,created_at:version}],items:[{kind:'goals',key:'2026-11|goals|@@company|monthly',payload:goals}]};
}
const base=business();let result=P.calculate(base,week);
assert.equal(result.calculation.monthlyTarget,300);assert.equal(result.calculation.monthlyMet,98);
assert.equal(result.calculation.remainingGap,202);assert.equal(result.calculation.remainingDays,18);
assert.equal(result.calculation.periodDays,7);assert.equal(result.calculation.suggestedTarget,79);
result=P.calculate(business('2026-11-18'),week);assert.equal(result.calculation.remainingDays,12);assert.equal(result.calculation.periodDays,7);assert.equal(result.calculation.suggestedTarget,68,'only four days remain in the selected week');
assert.equal(P.calculate(business('2026-11-22'),week).calculation.suggestedTarget,null,'ended plan period is a historical read');
const noGoal=business();delete noGoal.items[0].payload['碧云店'];assert.equal(P.calculate(noGoal,week).calculation.monthlyTarget,null);assert.equal(P.calculate(noGoal,week).calculation.suggestedTarget,null);
const noSource=business();noSource.imports=[];assert.equal(P.calculate(noSource,week).calculation.suggestedTarget,null);
const noHomes=business();noHomes.housing=[];assert.equal(P.calculate(noHomes,week).calculation.suggestedTarget,null);
const finished=business();finished.items[0].payload=Object.fromEntries(Object.keys(finished.items[0].payload).map(k=>[k,0]));assert.equal(P.calculate(finished,week).calculation.suggestedTarget,0);

const cell=()=>({textContent:'',innerHTML:'',disabled:false});
function host(){const status=cell(),badge=cell();return {isConnected:true,innerHTML:'',form:null,contains:()=>true,querySelector(q){return q==='[data-cwp-status]'?status:q==='.cwp-badge'?badge:q==='[data-cwp-form]'?this.form:null;}};}
function ctx({project=true,member={login_id:'0921',display_name:'负责人'},call=async()=>({items:[]}),data=business()}={}){return {host:host(),month:'2026-11',today:'2026-11-15',businessData:data,cloud:{project,member,storeReview:async()=>({items:[],businessData:data}),companyWeekPlan:call},notify:t=>notices.push(t)};}
function reset(){U.cancelAI();for(const name of ['cache','pending','drafts','selection','sourceHints'])S[name].clear();S.actor='0921';S.ctx=null;notices.length=0;}
function ready(c,items=[],reviews=[]){S.ctx=c;S.cache.set(c.month,{loaded:true,loading:false,items:clone(items),businessData:c.businessData,regionalReviews:reviews});}
function form(d){const button=cell();return {elements:{target:{value:d.target??''},strategyText:{value:d.strategyText},confirmed:{checked:d.status==='confirmed'}},reportValidity:()=>true,querySelector:()=>button};}
function row(c,overrides={}){const z=P.calculate(c.businessData,week);return {key:'2026-11|review|@@company|company-week-plan:2026-11-16:2026-11-22',updated_at:'2026-11-15T10:30:00Z',payload:{recordType:'company-week-plan',periodStart:week.periodStart,periodEnd:week.periodEnd,target:80,strategyText:'保存的策略',status:'confirmed',updatedBy:'负责人',...z,...overrides}};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
// Only the project owner can change the shared company plan.
reset();let c=ctx();ready(c);U.render(c);assert.ok(c.host.innerHTML.includes('AI生成策略草稿'));assert.ok(c.host.innerHTML.includes('体积与等待时间以进度为准'));assert.ok(!c.host.innerHTML.includes('href='));assert.equal(U.editable(c),true);
c.cloud.project=false;U.render(c);assert.match(c.host.innerHTML,/<fieldset disabled>/);assert.equal(U.editable(c),false);await assert.rejects(()=>U.save(c,form(U.draft(c,week))),/仅项目负责人/);
reset();c=ctx({member:null});assert.equal(U.editable(c),false);await U.load(c);assert.equal(S.cache.size,0);

// Saved data is frozen even when new imports arrive.
reset();c=ctx();const saved=row(c);ready(c,[saved]);let d=U.draft(c,week);assert.equal(d.target,80);assert.equal(d.calculation.suggestedTarget,79);
S.cache.get(c.month).businessData=business('2026-11-20','2026-11-21T00:00:00Z');assert.equal(U.draft(c,week).sourceAsOf,'2026-11-12');assert.equal(U.draft(c,week).target,80);
const report=P.text();assert.ok(report.includes('80套'));assert.ok(report.includes('保存的策略'));assert.ok(report.includes('2026-11-12'));

// Remounting after an import refreshes unsaved system suggestions, preserving manual choices and saved snapshots.
reset();c=ctx();ready(c);let liveSource=c.businessData;c.cloud.storeReview=async()=>({items:[],businessData:liveSource});P.mount(c);d=U.draft(c,week);d.strategyText='原稿保留';d.dirty=true;
liveSource=business('2026-11-18','2026-11-19T00:00:00Z');c.businessData=liveSource;P.mount(c);await S.pending.get(c.month);assert.equal(d.target,68);assert.equal(d.sourceAsOf,'2026-11-18');assert.equal(d.strategyText,'原稿保留');
d.target=95;liveSource=business('2026-11-19','2026-11-20T00:00:00Z');c.businessData=liveSource;P.mount(c);await S.pending.get(c.month);assert.equal(d.target,95);assert.equal(d.calculation.suggestedTarget,56);
reset();c=ctx();const originalSaved=row(c);ready(c,[originalSaved]);d=U.draft(c,week);c.cloud.companyWeekPlan=async()=>({items:[originalSaved]});c.businessData=business('2026-11-18','2026-11-19T00:00:00Z');c.cloud.storeReview=async()=>({items:[],businessData:c.businessData});P.mount(c);await S.pending.get(c.month);d=U.draft(c,week);assert.equal(d.target,80);assert.equal(d.sourceAsOf,'2026-11-12');assert.equal(d.calculation.suggestedTarget,79);

// AI context uses only store/region aggregate data and latest confirmed review excerpts.
const reviews=[{store:'新天地二店',region:'黄浦大区',payload:{status:'confirmed',periodStart:'2026-11-09',periodEnd:'2026-11-15',fields:{highlights:'围绕价格交流',blockers:'需要加强邀约',nextActions:'逐组确认安排',owner:'不应进入上下文的责任人'}}}];
reset();c=ctx();ready(c,[],reviews);d=U.draft(c,week);const aiContext=P.buildAIContext(c,week,d);assert.equal(aiContext.quantitativeGoal,79);assert.equal(aiContext.regions.length,5);assert.equal(aiContext.stores.length,18);assert.equal(aiContext.confirmedReviews.length,1);assert.ok(!JSON.stringify(aiContext).includes('不应进入'));assert.ok(!JSON.stringify(aiContext).includes('customer-only'));

// AI returns a preview, not an automatic replacement. Late results cannot overwrite typing.
reset();c=ctx();ready(c);d=U.draft(c,week);d.strategyText='项目负责人原稿';c.host.form=form(d);
let generatedInput;const ai=deferred();x.WBReviewAI={organize:async arg=>{generatedInput=arg;arg.onProgress({message:'下载模型50%'});return ai.promise;}};
let pending=U.generate(c);assert.equal(generatedInput.kind,'companyStrategy');assert.ok(generatedInput.signal);assert.equal(d.strategyText,'项目负责人原稿');
ai.resolve({method:'local-model',text:'未来一周建议策略',warnings:['须核实']});await pending;assert.equal(d.strategyText,'项目负责人原稿');assert.equal(d.preview.text,'未来一周建议策略');
const late=deferred();x.WBReviewAI.organize=()=>late.promise;pending=U.generate(c);c.host.form.elements.strategyText.value='生成期间继续编辑';late.resolve({method:'local-model',text:'过期结果',warnings:[]});await pending;assert.equal(d.strategyText,'生成期间继续编辑');assert.ok(d.notice.includes('有修改'));
// A non-model or empty result is never reported as successful AI.
x.WBReviewAI.organize=async()=>({method:'rules',text:'规则整理'});await U.generate(c);assert.match(d.error,/有效的本机AI/);

// Cancelled/old-period results do not apply.
const stale=deferred();x.WBReviewAI.organize=()=>stale.promise;pending=U.generate(c);U.cancelAI();S.selection.set(c.month,'2026-11-23');stale.resolve({method:'local-model',text:'不应出现',warnings:[]});await pending;assert.notEqual(U.draft(c,P.periods(c.month).find(p=>p.periodStart==='2026-11-23')).strategyText,'不应出现');

// Save carries the original calculation separately from the manually adjusted target.
reset();let submitted;const saveGate=deferred();c=ctx({call:async(action,args)=>{if(action==='save'){submitted=clone(args);return saveGate.promise;}return {items:[]};}});ready(c);d=U.draft(c,week);d.target=90;d.strategyText='人工确认后的重点动作';d.status='confirmed';c.host.form=form(d);pending=U.save(c,c.host.form);assert.equal(submitted.payload.target,90);assert.equal(submitted.payload.calculation.suggestedTarget,79);assert.equal(submitted.payload.sourceAsOf,'2026-11-12');assert.equal(submitted.periodStart,'2026-11-16');assert.ok(!('label' in submitted));
c.host.form.elements.strategyText.value='保存途中继续补充';saveGate.resolve(row(c,{...submitted.payload,status:'confirmed'}));await pending;assert.equal(d.strategyText,'保存途中继续补充');assert.equal(d.dirty,true);assert.ok(d.notice.includes('后续修改'));

// A second window update is shown as a conflict instead of silently replacing local input.
const newRow=row(c,{strategyText:'另一个窗口的版本'});newRow.updated_at='2026-11-15T11:00:00Z';c.cloud.companyWeekPlan=async()=>({items:[newRow]});await U.load(c,true);assert.equal(d.strategyText,'保存途中继续补充');assert.equal(d.remote.updated_at,newRow.updated_at);await assert.rejects(()=>U.save(c,c.host.form),/其他窗口/);U.adoptRemote(d);assert.equal(d.strategyText,'另一个窗口的版本');assert.equal(d.dirty,false);

// AI restoration never overwrites words typed after adopting a draft.
reset();c=ctx();ready(c);d=U.draft(c,week);d.strategyText='原稿';c.host.form=form(d);d.preview={original:'原稿',target:d.target,text:'AI草稿',warnings:[]};
const click=async action=>handlers.get('click')({target:{closest:()=>({dataset:{cwp:action}})}});
await click('apply-ai');assert.equal(d.restore.original,'原稿');assert.equal(d.restore.appliedText,'AI草稿');
c.host.form.elements.strategyText.value='AI草稿加人工补充';await click('restore-ai');assert.equal(d.strategyText,'AI草稿加人工补充');assert.ok(notices.at(-1).includes('避免覆盖新输入'));
c.host.form.elements.strategyText.value='AI草稿';await click('restore-ai');assert.equal(d.strategyText,'原稿');

// Long existing drafts stay intact and are rejected for whole-text AI rather than truncated.
d.strategyText='长'.repeat(6500);c.host.form=form(d);U.render(c);assert.ok(c.host.innerHTML.includes('长'.repeat(6500)));await assert.rejects(()=>U.generate(c),/全文保留/);assert.equal(d.strategyText.length,6500);

// Strategy context stays bounded even when all eighteen reports have large texts.
reset();c=ctx();const manyReviews=x.WBModel.storeCatalog.filter(s=>s.ownerApplicable!==false).map(s=>({store:s.store,region:s.region,payload:{status:'confirmed',periodStart:'2026-11-09',periodEnd:'2026-11-15',fields:{highlights:'有价值的场景'.repeat(3000),blockers:'需要核实的卡点'.repeat(3000),nextActions:'下一步的行动'.repeat(3000)}}}));ready(c,[],manyReviews);d=U.draft(c,week);const bounded=P.buildAIContext(c,week,d);assert.ok(JSON.stringify(bounded).length<16000);assert.equal(bounded.stores.length,18);assert.equal(bounded.regions.length,5);assert.ok(bounded.confirmedReviews.length>0);assert.ok(bounded.reviewExcerptNote.includes('摘要'));assert.ok(bounded.reviewExcerptNote.includes('完整原报告'));

// A newly refreshed source/calculation invalidates in-flight strategy output.
c.host.form=form(d);const changedSource=deferred();x.WBReviewAI.organize=()=>changedSource.promise;pending=U.generate(c);S.cache.get(c.month).businessData=business('2026-11-13','2026-11-14T00:00:00Z');d.calculation.remainingGap=190;changedSource.resolve({method:'local-model',text:'旧底表结果',warnings:[]});await pending;assert.equal(d.strategyText,'');assert.equal(d.preview,null);assert.ok(d.notice.includes('底表测算'));

// Leaving a page with a modified company plan requests the standard unsaved-draft guard.
let prevented=0;const unload={preventDefault(){prevented++;},returnValue:null};d.dirty=true;rootHandlers.get('beforeunload')(unload);assert.equal(prevented,1);assert.equal(unload.returnValue,'');d.dirty=false;rootHandlers.get('beforeunload')(unload);assert.equal(prevented,1);
console.log('PASS company weekly planning: calendar defaults, 79-suite calculation, elapsed-day boundaries, owner-only edits, frozen history, local AI previews, stale/cancelled output protection, concurrent saves and aggregate-only context');
