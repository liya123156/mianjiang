import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../operations/work-records.js',import.meta.url),'utf8');
let sequence=0;
class Element{
 constructor(tag='host'){this.tag=tag;this.handlers={};this.children=[];this.fields=new Map();this.parts=new Map();this._html='';this.dataset={};}
 set innerHTML(value){this._html=value;this.fields.clear();this.parts.clear();const raw=value.match(/<textarea name="rawText" data-wr-input="create"[^>]*>([\s\S]*?)<\/textarea>/);if(raw)this.fields.set('[data-wr-input="create"]',{value:raw[1]});for(const key of ['store','group','occurredAt']){const re=new RegExp(key==='store'?'<select name="store" data-wr-context="store">([\\s\\S]*?)<\\/select>':'<input[^>]*data-wr-context="'+key+'"[^>]*value="([^"]*)"'),match=value.match(re);if(match)this.fields.set('[data-wr-context="'+key+'"]',{value:key==='store'?(match[1].match(/<option value="([^"]*)" selected/)?.[1]||''):match[1]});}if(value.includes('data-wr-list'))this.parts.set('[data-wr-list]',{innerHTML:''});if(value.includes('data-wr-count'))this.parts.set('[data-wr-count]',{textContent:''});}
 get innerHTML(){return this._html}
 querySelector(selector){if(selector==='.wr-dialog')return this.children.find(x=>x.className==='wr-dialog')||null;return this.fields.get(selector)||this.parts.get(selector)||null;}
 addEventListener(type,fn){this.handlers[type]=fn}
 removeEventListener(type,fn){if(this.handlers[type]===fn)delete this.handlers[type]}
 contains(){return true}
 append(element){element.parent=this;this.children.push(element)}
 showModal(){this.open=true}
 close(){this.open=false}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
}
const x={window:null,document:{createElement:tag=>new Element(tag)},WBModel:{storeCatalog:[{region:'黄浦大区',store:'新天地一店'},{region:'黄浦大区',store:'新天地二店'}]},console,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`},FormData:class{constructor(form){this.data=form.values||{}}get(key){return this.data[key]??null}}};x.window=x;vm.createContext(x);vm.runInContext(source,x);
const W=x.WBWorkRecords;
const record=values=>W.normalize({id:'r1',month:'2026-11',region:'黄浦大区',store:'新天地一店',group:'A组',rawText:'下午计划与经理一对一确认礼品，王漫回复“苹果礼盒”。',status:'open',version:3,aiStatus:'pending',createdAt:'2026-11-13T01:00:00Z',createdBy:{loginId:'0921',displayName:'张亚玲'},...values});
assert.equal(W.aiLabel(record(),false),'已保存 · 待整理');
assert.ok(!W.summaryHtml(record()).includes('苹果礼盒'),'raw source must not be manufactured into a review summary');
const organized=record({summary:{done:['物料包已发到经理群'],plans:['下午开展一对一沟通'],feedback:['王漫经理回复选择苹果礼盒'],pending:['采购、到货、使用尚待核实'],review_text:'已同步物料并收到一个选品反馈。'},summaryMethod:'manual',summaryStatus:'reviewed'});
const summary=W.summaryHtml(organized);assert.match(summary,/已完成/);assert.match(summary,/计划与安排/);assert.match(summary,/承接反馈与执行结果/);assert.match(summary,/待核实/);assert.match(summary,/已核实的复盘归纳/);
assert.equal(W.aiLabel(organized,false),'归纳已核实');assert.equal(W.aiLabel(record({...organized,summaryStatus:'stale'}),false),'有新原文 · 归纳待更新');assert.match(W.summaryHtml(record({...organized,summaryStatus:'stale'})),/不作为本次新增进展的已核实结论/);
const snapshotAfter={...organized,id:'hidden-record-uuid',version:99,processorAvailable:false,attachments:[{id:'hidden-attachment-uuid',name:'经理沟通录音.amr',type:'audio/amr',size:123}],rawText:'完整原文开始\n下午计划沟通；王漫选择苹果礼盒。\n完整原文结束'};
const history=W.historyEntryHtml({type:'source-appended',actorName:'张亚玲',createdAt:'2026-11-13T01:00:00Z',version:99,before:{...organized,rawText:'补充前原文'},after:snapshotAfter});
for(const word of ['补充原始信息','修改前','本次保存后','事项标题','归属','事项状态','负责人','事件日期','约定时间','原始信息','经理沟通录音.amr','归纳内容','补充前原文','完整原文开始\n下午计划沟通；王漫选择苹果礼盒。\n完整原文结束'])assert.ok(history.includes(word),word);
for(const hidden of ['hidden-record-uuid','hidden-attachment-uuid','processorAvailable','source-appended','"rawText"','版本 99'])assert.ok(!history.includes(hidden),hidden);
assert.match(W.historyEntryHtml({type:'created',after:organized}),/建立记录/);assert.match(W.historyEntryHtml({type:'edited',after:organized}),/核对／修改记录/);assert.ok(!W.historyEntryHtml({type:'unknown-internal-type',after:organized}).includes('unknown-internal-type'));
assert.ok(W.historySnapshotHtml({rawText:'<script>alert(1)</script>',summary:{done:['<svg onload=x>']}}).includes('&lt;script&gt;'));assert.ok(!W.historySnapshotHtml({rawText:'<script>alert(1)</script>'}).includes('<script>'));
const hostile=record({rawText:'<img src=x onerror=alert(1)>',title:'<script>evil</script>',attachments:[{id:'bad" onmouseover="x',name:'<svg onload=x>',type:'image/png',size:1}]});
const card=W.cardHtml(hostile,{processorAvailable:false,expanded:new Set()});assert.ok(!card.includes('<script>'));assert.ok(!card.includes('<img src=x'));assert.ok(card.includes('&lt;svg'));assert.ok(card.includes('提交于'));assert.ok(!card.includes('事件日期'),'upload date cannot become business occurrence date');
assert.ok(W.cardHtml(record({occurredAt:'2026-11-12'}),{expanded:new Set()}).includes('事件日期：2026-11-12'));
const png={name:'截图.png',type:'image/png',size:100};assert.equal(W.validateFiles([png]),true);assert.equal(W.fileType({name:'录音.amr',type:''}),'audio/amr');assert.throws(()=>W.validateFiles([{name:'x.svg',type:'image/svg+xml',size:100}]),/支持/);assert.throws(()=>W.validateFiles([{...png,size:8*1024*1024+1}]),/8MB/);assert.throws(()=>W.validateFiles(Array(5).fill(png)),/最多/);assert.throws(()=>W.validateFiles(Array(3).fill({...png,size:8*1024*1024})),/20MB/);
const other=record({id:'r2',store:'新天地二店',createdBy:{loginId:'1317'}}),view={scope:'store',store:'新天地一店'},all=[organized,other];
const chronology=[record({id:'early',updatedAt:'2026-11-11T00:00:00Z'}),record({id:'late',updatedAt:'2026-11-12T00:00:00Z'})];assert.equal(W.filterRecords(chronology,{scope:'all',who:'all',status:'all',search:''},{},{}).at(0).id,'late');assert.equal(chronology.at(0).id,'early','view ordering never mutates the source array');
assert.equal(W.filterRecords(all,{scope:'current',who:'all',status:'all',search:''},view,{loginId:'0921'}).length,1);assert.equal(W.filterRecords(all,{scope:'all',who:'mine',status:'all',search:''},view,{loginId:'1317'})[0].id,'r2');assert.equal(W.filterRecords(all,{scope:'all',who:'all',status:'all',search:'苹果礼盒'},view,{}).length,2);

const anonHost=new Element(),anonymous={member:null,records(){throw Error('must not call server while anonymous')}};
const anon=W.mount(anonHost,{month:'2026-11',cloud:anonymous});await anon.refresh();assert.match(anonHost.innerHTML,/已授权工号/);assert.equal(anon.state.records.length,0);anon.destroy();
let uploaded=0,failSave=true;const calls=[],member={login_id:'0921',display_name:'张亚玲'},cloud={member,async records(action,args){calls.push({action,args});if(action==='list')return {records:[organized],processorAvailable:false};if(action==='create'){if(failSave)throw Error('网络中断，可重试');return {record:{...organized,id:'new',rawText:args.rawText},processorAvailable:false};}return {record:organized,processorAvailable:false}},async uploadRecordAttachment(){uploaded++;return {id:'a1',name:'截图.png',type:'image/png',size:100}}};
const host=new Element(),callbackArgs=[];const instance=W.mount(host,{month:'2026-11',view,cloud,initialDraft:{rawText:'原始聊天',store:'新天地一店',group:'B组',files:[{file:png}],requestId:'00000000-0000-4000-8000-999999999999'},onChanged:p=>{callbackArgs.push(p);throw Error('callback failure cannot undo save')}});
await instance.refresh();await instance.updateContext({view:{scope:'store',store:'新天地二店'}});assert.equal(instance.state.draft.rawText,'原始聊天');assert.equal(instance.state.draft.store,'新天地一店','scope switch does not silently change draft ownership');
const createForm={dataset:{wrForm:'create'},closest(){return this}};const event={target:createForm,preventDefault(){}};
host.handlers.submit(event);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(uploaded,1);assert.match(instance.state.error,/网络中断/);assert.equal(instance.state.draft.files[0].id,'a1');
failSave=false;host.handlers.submit(event);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(uploaded,1,'retry reuses the already saved attachment');assert.equal(callbackArgs.length,1);assert.equal(instance.state.error,'');assert.equal(instance.state.draft.rawText,'');
const creates=calls.filter(c=>c.action==='create');assert.equal(creates.length,2);assert.equal(creates[0].args.requestId,creates[1].args.requestId);assert.equal(creates[1].args.month,'2026-11');assert.equal(creates[1].args.occurredAt,null);assert.equal(creates[1].args.attachmentIds[0],'a1');
const button=(action,id)=>({dataset:{wr:action,id},closest(){return this}});
await host.handlers.click({target:button('edit','r1')});
const editValues={title:'',status:'in_progress',store:'新天地一店',group:'A组',owner:'',due:'',occurredAt:'',summary_done:'物料包已发到经理群',summary_plans:'下午开展一对一沟通',summary_feedback:'王漫经理回复选择苹果礼盒',summary_pending:'采购、到货、使用尚待核实',summary_blockers:'',summary_next_steps:'',summary_review_text:'已同步物料并收到一个选品反馈。'};
const editForm={dataset:{wrForm:'edit'},values:editValues,closest(){return this}};
host.handlers.submit({target:editForm,preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,0));
const edited=calls.filter(c=>c.action==='edit').at(-1).args;assert.equal(edited.expectedVersion,3);assert.equal(edited.rawText,undefined,'editing cannot rewrite original source');assert.equal(edited.summary,undefined,'status-only edits do not falsely mark the original summary as manually checked');
let conflicts=true;const originalApi=cloud.records;cloud.records=async(action,args)=>{if(action==='edit'&&conflicts){calls.push({action,args});throw Error('记录版本冲突，请核对最新进展')}return originalApi(action,args)};
await host.handlers.click({target:button('edit','r1')});editValues.summary_plans='下午沟通是否开展仍待核实';editValues.summaryReviewed='on';
host.handlers.submit({target:editForm,preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,0));assert.match(instance.state.dialog.error,/版本冲突/);assert.equal(instance.state.dialog.record.summary.plans[0],'下午沟通是否开展仍待核实');
instance.state.records.find(r=>r.id==='r1').version=4;conflicts=false;host.handlers.submit({target:editForm,preventDefault(){}});await new Promise(resolve=>setTimeout(resolve,0));
const retriedEdit=calls.filter(c=>c.action==='edit').at(-1).args;assert.equal(retriedEdit.expectedVersion,3,'refreshing a newer record cannot silently remove optimistic conflict protection');assert.equal(retriedEdit.summary.plans[0],'下午沟通是否开展仍待核实');assert.equal(retriedEdit.summaryReviewStatus,'reviewed');
cloud.member=null;await instance.refresh();assert.equal(instance.state.records.length,0);assert.ok(!host.innerHTML.includes('原始聊天'));instance.destroy();assert.equal(Object.keys(host.handlers).length,0);
let finishUpload;const pendingUpload=new Promise(resolve=>finishUpload=resolve),raceCalls=[],raceHost=new Element(),raceCloud={member,async records(action,args){raceCalls.push({action,args});return {records:[],processorAvailable:false}},async uploadRecordAttachment(){return pendingUpload}};
const race=W.mount(raceHost,{month:'2026-11',cloud:raceCloud,initialDraft:{rawText:'11月原始记录',files:[{file:png}]}});await race.refresh();raceHost.handlers.submit(event);await new Promise(resolve=>setTimeout(resolve,0));await race.updateContext({month:'2026-12'});finishUpload({id:'pending-file'});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(raceCalls.filter(c=>c.action==='create').length,0,'changing month during upload must not submit old source into the new month');assert.equal(race.state.draft.rawText,'11月原始记录');race.destroy();
console.log('PASS shared record UI: source/plan/result separation, manual and stale labels, no fake AI, source escaping, private auth gate, attachment limits, scope/my filters, occurrence date, preserved drafts, idempotent save retry, callback safety and logout cleanup.');
