/* The visible company plan is a saved report for guests and BP readers;
 * the project account keeps its existing private editor and save boundary. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
function harness(role=null){
 const calls=[],listeners={},notices=[];let html='',publicHandler,privateRows=[];
 const status={textContent:''},form={elements:{target:{value:''},strategyText:{value:''},confirmed:{checked:false}},querySelector:()=>({disabled:false}),reportValidity:()=>true};
 const host={isConnected:true,contains:()=>true,get innerHTML(){return html;},set innerHTML(value){html=value;form.elements.target.value=value.match(/name="target"[^>]*value="([^"]*)"/)?.[1]||'';form.elements.strategyText.value=value.match(/name="strategyText"[^>]*>([\s\S]*?)<\/textarea>/)?.[1]||'';},querySelector(selector){return selector==='[data-cwp-status]'?status:selector==='[data-cwp-form]'&&html.includes('data-cwp-form')?form:null;}};
 const document={addEventListener(type,handler){(listeners[type]||=[]).push(handler);}},x={window:null,document,console,Intl,Date,AbortController};x.window=x;x.addEventListener=()=>{};vm.createContext(x);
 for(const file of ['core','store-review-model','company-week-plan'])vm.runInContext(fs.readFileSync(new URL('../operations/'+file+'.js',import.meta.url),'utf8'),x,{filename:file+'.js'});
 const W=x.WBCompanyWeekPlan,catalog=x.WBModel.storeCatalog.filter(s=>s.ownerApplicable!==false),targets=[15,8,20,20,31,23,28,21,22,12,20,22,20,10,25,15,17,21],met=[2,3,13,10,12,4,5,8,12,6,7,6,9,3,6,2,3,13];
 const rows=catalog.map((s,i)=>({...s,monthlyTarget:targets[i],monthlyMet:met[i]})),strategy='一、逐套明确邀约与责任分工。\n二、落实礼品准备和报告价值使用。\n三、复查真实正反馈与执行卡点。';
 function plan({month='2026-11',start='2026-11-16',end='2026-11-22',target=120,text=strategy}={}){
  const allocation=W.allocationPayload(W.allocateTargets(rows,target));
  // Public projection deliberately has no wb_items key or editor-only status.
  return {updated_at:'2026-11-16T10:00:00Z',payload:{recordType:'company-week-plan',periodStart:start,periodEnd:end,target,strategyText:text,sourceAsOf:month+'-15',sourceVersion:'2026-11-15T08:00:00Z',calculation:{monthlyTarget:350,monthlyMet:124,remainingGap:226,remainingDays:15,periodDays:7,suggestedTarget:106},allocation}};
 }
 const business={housing:[],meetings:[],imports:[{as_of:'2026-11-15',created_at:'2026-11-15T08:00:00Z'}],items:[{kind:'goals',key:'2026-11|goals|@@company|monthly',payload:Object.fromEntries(catalog.map((s,i)=>[s.store,targets[i]]))}]};
 for(const [i,s] of catalog.entries())for(let n=0;n<targets[i]+5;n++)business.housing.push({房源编号:i+'-'+n,大区:s.region,门店:s.store,店组:s.store+'A组',细分在售户数:1,本月是否面见:n<met[i]?1:0});
 publicHandler=async(_action,args)=>({month:args.month,items:args.month==='2026-11'?[plan()]:[]});privateRows=[{...plan(),key:'private-plan'}];
 const cloud={member:role?{login_id:role==='project'?'0921':'1317',display_name:role==='project'?'张亚玲':'陈晶',role}:null,project:role==='project',async publicCompanyWeekPlans(action,args){calls.push({api:'public',action,args:structuredClone(args)});return publicHandler(action,args);},async storeReview(action,args){calls.push({api:'storeReview',action,args:structuredClone(args)});return {businessData:business,items:[]};},async companyWeekPlan(action,args){calls.push({api:'private',action,args:structuredClone(args)});if(action==='load')return {month:args.month,items:privateRows};throw Error('test never requests a private write');}};
 const ctx={host,cloud,month:'2026-11',today:'2026-11-16',notify:message=>notices.push(message)};
 return {W,ctx,host,calls,form,plan,strategy,notices,business,async mount(){W.mount(ctx);await flush();},setPublic(handler){publicHandler=handler;},setPrivate(rows){privateRows=rows;}};
}
function verifyReport(h,text=h.strategy,target=120){
 const html=h.host.innerHTML;
 assert.ok(html.includes(String(target)),'the saved execution quantity is visible');
 assert.match(html,/五大区周目标分解/);assert.match(html,/18家门店周目标分解/);
 for(const line of text.split('\n')){
  assert.ok(html.includes(line),'each saved strategy is visible: '+line);
  assert.ok([...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].some(match=>match[1].includes(line)),'strategy appears in a normal paragraph: '+line);
 }
 assert.doesNotMatch(html,/<textarea\b|name="confirmed"|data-cwp="voice(?:-stop)?"|保存全司周计划|项目负责人已确认本周目标与核心策略|进入BP[／/]管理入口|进入BP|待设定/,'a public reader sees a report without editor controls or login instructions');
 const exported=h.W.text();assert.match(exported,new RegExp('本周执行目标：'+target+'套'));assert.ok(exported.includes(text));assert.doesNotMatch(exported,/本周目标分解|月度目标|106套|状态：|待BP确认|draft/,'the copied report keeps the saved target and three strategies only');
}

// Signed-out visitors load the safe published projection, without touching private APIs.
const guest=harness();await guest.mount();assert.deepEqual(guest.calls,[{api:'public',action:'load',args:{month:'2026-11'}}]);verifyReport(guest);
assert.equal(guest.host.innerHTML.includes('自动建议周量'),false);

// Optional live totals retain aggregate facts without retaining private source fields.
const projected=harness();projected.ctx.businessData=projected.business;
Object.assign(projected.business.housing[0],{维护人姓名:'私有维护人哨兵',房间号:'PRIVATE-ROOM-SENTINEL',手机号:'PRIVATE-PHONE-SENTINEL',面见反馈:'PRIVATE-FEEDBACK-SENTINEL'});
projected.business.items.push({kind:'rules',key:'2026-11|rules|@@company|private-rule',payload:{secret:'PRIVATE-RULE-SENTINEL'}});
await projected.mount();const safeBusiness=projected.W.state.cache.get('2026-11').businessData,safeText=JSON.stringify(safeBusiness);
for(const privateValue of ['维护人姓名','房间号','手机号','面见反馈','私有维护人哨兵','PRIVATE-ROOM-SENTINEL','PRIVATE-PHONE-SENTINEL','PRIVATE-FEEDBACK-SENTINEL','PRIVATE-RULE-SENTINEL','private-rule','rules'])assert.ok(!safeText.includes(privateValue),'public aggregate cache excludes '+privateValue);
assert.ok(safeBusiness.housing.length>0,'safe active/met facts remain available');assert.ok(!safeBusiness.items.some(item=>item.kind==='rules'));
const safeCalculation=projected.W.calculate(safeBusiness,projected.W.defaultPeriod('2026-11','2026-11-16')).calculation;assert.equal(safeCalculation.monthlyTarget,350);assert.equal(safeCalculation.monthlyMet,124);
assert.match(projected.host.innerHTML,/月度面见目标<\/span><strong>350/);assert.match(projected.host.innerHTML,/月度累计面见<\/span><strong>124/);verifyReport(projected);

// BP readers use the same report even when signed in; only the project editor is private.
for(const role of ['collaborator','region']){const reader=harness(role);await reader.mount();assert.deepEqual(reader.calls,[{api:'public',action:'load',args:{month:'2026-11'}}]);verifyReport(reader);}

// An absent saved plan is an empty report, not a fabricated recommendation or draft.
const empty=harness();empty.setPublic(async(_action,args)=>({month:args.month,items:[]}));await empty.mount();assert.match(empty.host.innerHTML,/该周期暂无已保存目标与策略/);assert.doesNotMatch(empty.host.innerHTML,/106|待设定|<textarea\b|保存全司周计划|进入BP/);assert.doesNotMatch(empty.W.text(),/106|120套|待设定|状态：/);

// An old anonymous request cannot replace the project editor after a role change.
const roleChange=harness(),pendingGuest=deferred();roleChange.setPublic(()=>pendingGuest.promise);roleChange.W.mount(roleChange.ctx);await flush();assert.equal(roleChange.calls.length,1);
const projectText='项目负责人当前策略';roleChange.setPrivate([{...roleChange.plan({target:121,text:projectText}),key:'current-private-plan'}]);roleChange.ctx.cloud.member={login_id:'0921',display_name:'张亚玲',role:'project'};roleChange.ctx.cloud.project=true;await roleChange.mount();
assert.ok(roleChange.calls.some(c=>c.api==='storeReview'));assert.ok(roleChange.calls.some(c=>c.api==='private'&&c.action==='load'));assert.match(roleChange.host.innerHTML,/<textarea\b/);assert.ok(roleChange.host.innerHTML.includes(projectText));
const privatePage=roleChange.host.innerHTML,privateCache=JSON.stringify(roleChange.W.state.cache.get('2026-11'));pendingGuest.resolve({month:'2026-11',items:[roleChange.plan({text:'访客旧内容哨兵'})]});await flush();assert.equal(roleChange.host.innerHTML,privatePage);assert.equal(JSON.stringify(roleChange.W.state.cache.get('2026-11')),privateCache);assert.ok(!roleChange.host.innerHTML.includes('访客旧内容哨兵'));

// An earlier month's late public response cannot alter the currently selected month.
const monthChange=harness(),pendingNovember=deferred(),decemberText='一、十二月邀约共识。\n二、十二月专业服务。\n三、十二月执行复查。';monthChange.setPublic((_action,args)=>args.month==='2026-11'?pendingNovember.promise:Promise.resolve({month:args.month,items:[monthChange.plan({month:'2026-12',start:'2026-12-07',end:'2026-12-13',target:88,text:decemberText})]}));
monthChange.W.mount(monthChange.ctx);await flush();monthChange.ctx.month='2026-12';monthChange.ctx.today='2026-12-07';await monthChange.mount();verifyReport(monthChange,decemberText,88);const decemberPage=monthChange.host.innerHTML,decemberCache=JSON.stringify(monthChange.W.state.cache.get('2026-12'));pendingNovember.resolve({month:'2026-11',items:[monthChange.plan({text:'十一月迟到内容哨兵'})]});await flush();assert.equal(monthChange.host.innerHTML,decemberPage);assert.equal(JSON.stringify(monthChange.W.state.cache.get('2026-12')),decemberCache);assert.ok(!monthChange.host.innerHTML.includes('十一月迟到内容哨兵'));assert.deepEqual(monthChange.calls.filter(c=>c.api==='public').map(c=>c.args.month),['2026-11','2026-12']);

// The project account retains its private editable workflow and never reads public data.
const project=harness('project');await project.mount();assert.equal(project.calls.filter(c=>c.api==='public').length,0);assert.equal(project.calls.filter(c=>c.api==='storeReview').length,1);assert.equal(project.calls.filter(c=>c.api==='private'&&c.action==='load').length,1);assert.match(project.host.innerHTML,/<textarea\b/);assert.match(project.host.innerHTML,/保存全司周计划/);assert.equal(project.form.elements.target.value,'120');assert.equal(project.form.elements.strategyText.value,project.strategy);
console.log('PASS public company week plan: guest/BP saved report, one safe public read, frozen120 allocation tables, three strategy paragraphs, no editor/login/draft controls, explicit empty state, clean text export, role/month async isolation and unchanged private project editor.');
