/* Review editor behavior with simulated local AI and unsupported dictation. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=name=>fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const listeners=new Map();
const element=()=>({dataset:{},isConnected:true,disabled:false,hidden:false,textContent:'',after(){},remove(){this.isConnected=false;}});
const document={addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},createElement:element,getElementById(){return null;}};
const x={window:null,document,console,Intl,Date,URL,Blob,Event,AbortController,setTimeout,clearTimeout,isSecureContext:true,HTMLElement:class{},navigator:{}};
x.window=x;x.addEventListener=()=>{};vm.createContext(x);
for(const name of ['core','quality-feed','quality-rules','quality','store-review-model','review-voice'])vm.runInContext(read(name),x,{filename:name+'.js'});
const source=read('store-reviews');
vm.runInContext(source.replace('root.WBStoreReviews={','root.editorTest={normalizedFields,fieldsDefault,draft,draftKey,storeHtml,textField,organizeField,applyFieldAI,voiceField};root.WBStoreReviews={'),x,{filename:'store-reviews.js'});
const U=x.editorTest,S=x.WBStoreReviews.state;
const month='2026-11',period={periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15'},store={region:'黄浦大区',store:'新天地一店'};
const business={housing:[{'房源编号':'h1','大区':store.region,'门店':store.store,'店组':store.store+'A组','细分在售户数':1,'本月是否面见':1}],meetings:[{'面见id':'m1','房源编号':'h1','面见时间':'2026-11-12 10:00'}],imports:[{as_of:'2026-11-12',created_at:'source-v1'}],items:[]};
const notices=[];
function setup(){
 for(const name of ['cache','pending','drafts','selection','saving','open','aiDrafts'])S[name].clear();
 S.actor='0921';const ctx={month,view:{region:store.region,store:store.store},asOf:'2026-11-12',goals:{[store.store]:13},cloud:{member:{login_id:'0921',display_name:'张亚玲'}},notify:t=>notices.push(t),host:{isConnected:true,querySelector(){return null;},contains(){return false;}}};
 S.cache.set(month,{businessData:clone(business),items:[],loading:false});S.context=ctx;S.selection.set(month,{type:'weekly',start:period.periodStart});
 return ctx;
}
const unescape=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function formFor(ctx,name='actions',initial='本周联系经理，礼品已选，邀约时间待确认。'){
 const d=U.draft(ctx,period,store);d.fields[name]=initial;
 const status=element(),previewResult={value:''},preview={_html:'',set innerHTML(html){this._html=html;const m=html.match(/data-sr-ai-result="[^"]+"[^>]*>([\s\S]*?)<\/textarea>/);if(m)previewResult.value=unescape(m[1]);},get innerHTML(){return this._html;}};
 const tools={'[data-sr="ai-field"]':element(),'[data-sr="voice-field"]':element(),'[data-sr="voice-end"]':element(),'[data-sr-field-status]':status,'[data-sr-ai-preview]':preview,'[data-sr-ai-result]':previewResult};
 const wrap={dataset:{srFieldKey:U.draftKey(month,period,store.store)+'|'+name},isConnected:true,querySelector:s=>tools[s]||null};
 const area={value:initial,isConnected:true,disabled:false,readOnly:false,dataset:{},closest:s=>s==='.sr-field-wrap'?wrap:s==='.sr-form'?f:null,dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn({target:this});}};
 const fields=Object.fromEntries(Object.entries(d.fields).filter(([k])=>k!=='execution').map(([k,v])=>[k,{value:v??''}]));fields[name]=area;fields.confirmed={checked:false};
 const f={dataset:{reviewStore:store.store},elements:fields,contains:target=>target===area,closest:()=>({querySelector:()=>status}),querySelector:()=>null};
 return {f,d,area,wrap,status,preview,previewResult,key:wrap.dataset.srFieldKey,tools};
}
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const localResult=text=>({text,method:'local-model',warnings:[]});
let passed=0;const failures=[];
async function test(name,run){try{await run();passed++;}catch(e){failures.push({name,message:e.message});console.error('FAIL:',name,'—',e.message);}}

await test('legacy execution and original actions share one editable box without content loss',()=>{
 const normalized=U.normalizedFields({actions:'原计划给A组准备清单',execution:'已与经理核实2套邀约'});
 assert.ok(normalized.actions.includes('原计划给A组准备清单'));assert.ok(normalized.actions.includes('已与经理核实2套邀约'));assert.equal(normalized.execution,'');
 assert.deepEqual(clone(U.normalizedFields(normalized)),clone(normalized),'normalization is idempotent');
 const ctx=setup(),html=U.storeHtml(ctx,period,store);
 assert.equal((html.match(/<textarea name="actions"/g)||[]).length,1);assert.ok(!html.includes('<textarea name="execution"'));
 assert.equal((html.match(/data-sr="voice-field"/g)||[]).length,4);assert.equal((html.match(/data-sr="ai-field"/g)||[]).length,4);
 assert.ok(html.includes('需要提升与卡点问题分析'));
});

await test('AI preview preserves original content and remains an unsaved suggestion',async()=>{
 const ctx=setup(),v=formFor(ctx);const original=v.area.value;let args;
 x.WBReviewAI={busy:false,organize:async input=>{args=input;return localResult('已完成：联系经理与礼品选购。\n待确认：邀约时间。');}};
 await U.organizeField(v.f,'actions',ctx);
 assert.equal(args.text,original);assert.equal(args.kind,'actions');assert.equal(args.context.store,store.store);
 assert.equal(v.area.value,original);assert.equal(v.d.fields.actions,original);assert.equal(v.d.dirty,false);
 assert.ok(v.preview.innerHTML.includes('待核对'));assert.ok(v.preview.innerHTML.includes('查看原始输入'));assert.equal(S.aiDrafts.get(v.key).busy,false);
});

await test('editing the AI preview does not mutate raw text; apply and restore mark the form dirty',async()=>{
 const ctx=setup(),v=formFor(ctx);const original=v.area.value;x.WBReviewAI={busy:false,organize:async()=>localResult('AI初稿')};
 await U.organizeField(v.f,'actions',ctx);v.previewResult.value='人工核实后的整理稿';
 const editTarget={dataset:{srAiResult:'actions'},value:v.previewResult.value,closest:s=>s==='.sr-field-wrap'?v.wrap:s==='.sr-form'?v.f:null};
 for(const fn of listeners.get('input')||[])fn({target:editTarget});
 assert.equal(v.area.value,original);assert.equal(S.aiDrafts.get(v.key).result,'人工核实后的整理稿');
 U.applyFieldAI(v.f,'actions',ctx);assert.equal(v.area.value,'人工核实后的整理稿');assert.equal(v.d.fields.actions,v.area.value);assert.equal(v.d.dirty,true);
 U.applyFieldAI(v.f,'actions',ctx,true);assert.equal(v.area.value,original);assert.equal(v.d.fields.actions,original);
});

await test('source changes during AI generation reject applying an obsolete result',async()=>{
 const ctx=setup(),v=formFor(ctx),generation=defer();x.WBReviewAI={busy:false,organize:()=>generation.promise};
 const pending=U.organizeField(v.f,'actions',ctx);v.area.value+='新增事实：经理明天确认。';v.area.dispatchEvent(new Event('input'));
 generation.resolve(localResult('依据旧信息生成的整理稿'));await pending;const latest=v.area.value;
 assert.ok(v.status.textContent.includes('原文已变化'));assert.throws(()=>U.applyFieldAI(v.f,'actions',ctx),/原文已变化/);
 assert.equal(v.area.value,latest);assert.equal(v.d.fields.actions,latest);
});

await test('restoring an older source must not erase facts typed after preview or application',async()=>{
 for(const applyFirst of [false,true]){
  const ctx=setup(),v=formFor(ctx);x.WBReviewAI={busy:false,organize:async()=>localResult('已整理的内容')};await U.organizeField(v.f,'actions',ctx);
  if(applyFirst)U.applyFieldAI(v.f,'actions',ctx);
  v.area.value+='\n新补充：业主改约至周五。';v.area.dispatchEvent(new Event('input'));const latest=v.area.value;
  try{U.applyFieldAI(v.f,'actions',ctx,true);}catch{}
  assert.equal(v.area.value,latest,'newly typed facts survive the restore control');assert.equal(v.d.fields.actions,latest);
 }
});

await test('failed or cancelled generation leaves the original text and editable controls intact',async()=>{
 const ctx=setup(),v=formFor(ctx),original=v.area.value;
 x.WBReviewAI={busy:false,organize:async()=>{throw Error('模型未准备完成');}};await U.organizeField(v.f,'actions',ctx);
 assert.equal(v.area.value,original);assert.ok(v.status.textContent.includes('模型未准备完成'));assert.equal(v.tools['[data-sr="ai-field"]'].disabled,false);
 const job=defer();x.WBReviewAI={busy:false,organize:()=>job.promise};const pending=U.organizeField(v.f,'actions',ctx);S.aiDrafts.get(v.key).controller.abort();job.resolve(localResult('不得应用的已取消结果'));await pending;
 assert.equal(v.area.value,original);assert.equal(S.aiDrafts.get(v.key).result,'');assert.equal(v.tools['[data-sr="ai-field"]'].disabled,false);
});

await test('unsupported speech does not change raw content or leave controls recording',()=>{
 const ctx=setup(),v=formFor(ctx),original=v.area.value;U.voiceField(v.f,'actions');
 assert.equal(v.area.value,original);assert.equal(v.d.fields.actions,original);assert.equal(x.WBReviewVoice.recording,false);
 assert.ok(v.status.textContent.includes('不支持'));assert.equal(v.tools['[data-sr="voice-field"]'].disabled,false);assert.equal(v.tools['[data-sr="voice-end"]'].hidden,true);
});

await test('review text and its AI preview stay separated between periods and fields',async()=>{
 const ctx=setup(),v=formFor(ctx,'blockers','卡点：业主不在上海');x.WBReviewAI={busy:false,organize:async()=>localResult('业主不在上海；邀约方式待核实。')};await U.organizeField(v.f,'blockers',ctx);
 assert.ok(S.aiDrafts.has(v.key));assert.ok(!S.aiDrafts.has(v.key.replace('|blockers','|actions')));
 const other=U.draftKey(month,{periodType:'weekly',periodStart:'2026-11-16',periodEnd:'2026-11-22'},store.store)+'|blockers';
 assert.ok(!S.aiDrafts.has(other));assert.equal(v.d.fields.blockers,'卡点：业主不在上海');
});

if(failures.length){console.error(JSON.stringify({passed,failed:failures.length,failures},null,2));process.exitCode=1;}
else console.log('PASS: unified legacy fields, four text controls, preview isolation, apply/restore, stale-source protection, cancellation, unsupported speech and period isolation');
