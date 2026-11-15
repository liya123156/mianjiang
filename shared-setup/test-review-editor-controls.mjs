/* Review editor keeps typing and dictation available without model loading. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=name=>fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v)),listeners=new Map();
const element=()=>({dataset:{},isConnected:true,disabled:false,hidden:false,textContent:''});
const document={addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},getElementById(){return null;}};
let modelCalls=0;
const x={window:null,document,console,Intl,Date,URL,Blob,Event,setTimeout,clearTimeout,isSecureContext:true,HTMLElement:class{},navigator:{},WBReviewAI:{organize(){modelCalls++;throw Error('Model must remain unused');},stop(){}}};
x.window=x;x.addEventListener=()=>{};vm.createContext(x);
for(const name of ['core','quality-feed','quality-rules','quality','store-review-model','review-voice'])vm.runInContext(read(name),x,{filename:name+'.js'});
vm.runInContext(read('store-reviews').replace('root.WBStoreReviews={','root.editorTest={normalizedFields,fieldsDefault,draft,draftKey,storeHtml,textField,voiceField,paint};root.WBStoreReviews={'),x,{filename:'store-reviews.js'});
const U=x.editorTest,S=x.WBStoreReviews.state;
const month='2026-11',period={periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15'},store={region:'黄浦大区',store:'新天地一店'};
const business={housing:[{'房源编号':'h1','大区':store.region,'门店':store.store,'店组':store.store+'A组','细分在售户数':1,'本月是否面见':1}],meetings:[{'面见id':'m1','房源编号':'h1','面见时间':'2026-11-12 10:00'}],imports:[{as_of:'2026-11-12',created_at:'source-v1'}],items:[]};
function setup(){
 for(const name of ['cache','pending','drafts','selection','saving','open','aiDrafts'])S[name].clear();
 S.actor='0921';const ctx={month,view:{region:store.region,store:store.store},asOf:'2026-11-12',goals:{[store.store]:13},cloud:{member:{login_id:'0921',display_name:'张亚玲'}},host:{isConnected:true,innerHTML:'',querySelector(){return null;},contains(){return false;}}};
 S.cache.set(month,{businessData:clone(business),items:[],loading:false});S.context=ctx;S.selection.set(month,{type:'weekly',start:period.periodStart});return ctx;
}
function formFor(ctx,name='actions',initial='已与经理沟通，邀约时间待确认。'){
 const d=U.draft(ctx,period,store);d.fields[name]=initial;const status=element(),tools={'[data-sr="voice-field"]':element(),'[data-sr="voice-end"]':element(),'[data-sr-field-status]':status};
 const wrap={dataset:{srFieldKey:U.draftKey(month,period,store.store)+'|'+name},isConnected:true,querySelector:s=>tools[s]||null};
 const area={value:initial,isConnected:true,disabled:false,readOnly:false,dataset:{},focus(){},closest:s=>s==='.sr-field-wrap'?wrap:s==='.sr-form'?f:null,dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn({target:this});}};
 const fields=Object.fromEntries(Object.entries(d.fields).filter(([k])=>k!=='execution').map(([k,v])=>[k,{value:v??''}]));fields[name]=area;fields.confirmed={checked:false};
 const f={dataset:{reviewStore:store.store},elements:fields,contains:target=>target===area,closest:()=>({querySelector:()=>status}),querySelector:()=>null};return {f,d,area,wrap,status,tools};
}

// Existing two-field records are preserved in the unified action/result box.
const legacy=U.normalizedFields({actions:'原计划给A组准备清单',execution:'已核实2套邀约'});
assert.ok(legacy.actions.includes('原计划给A组准备清单'));assert.ok(legacy.actions.includes('已核实2套邀约'));assert.equal(legacy.execution,'');
assert.deepEqual(clone(U.normalizedFields(legacy)),clone(legacy),'legacy normalization is idempotent');
let ctx=setup(),html=U.storeHtml(ctx,period,store);
assert.equal((html.match(/<textarea name="actions"/g)||[]).length,1);
assert.ok(!html.includes('<textarea name="execution"'));
assert.equal((html.match(/data-sr="voice-field"/g)||[]).length,4);
assert.equal((html.match(/data-sr="voice-end"/g)||[]).length,4);
assert.ok(html.includes('四、需要提升与卡点问题分析'));
assert.doesNotMatch(html,/data-sr="ai-|data-sr-ai-preview|AI整理|本机模型|下载.*模型/);

// A stale model preview in memory cannot reappear in the rendered editor.
const k=U.draftKey(month,period,store.store)+'|actions';
S.aiDrafts.set(k,{source:'旧原稿',result:'旧整理稿',busy:true,notice:'AI正在整理'});
html=U.storeHtml(ctx,period,store);U.paint(ctx);
assert.doesNotMatch(html,/旧整理稿|AI正在整理|data-sr="ai-/);
assert.doesNotMatch(ctx.host.innerHTML,/sr-ai-download-note|AI免费|本机模型|0\.5GB|data-sr="ai-/);
assert.equal(modelCalls,0,'rendering never starts a model');

// Unsupported webpage dictation gives a fallback and preserves manual input.
ctx=setup();let v=formFor(ctx),original=v.area.value;
U.voiceField(v.f,'actions');
assert.equal(v.area.value,original);assert.equal(v.d.fields.actions,original);
assert.equal(x.WBReviewVoice.recording,false);assert.ok(v.status.textContent.includes('不支持'));
assert.equal(v.tools['[data-sr="voice-field"]'].disabled,false);assert.equal(v.tools['[data-sr="voice-end"]'].hidden,true);

// Dictation still starts and ends safely when no AI button exists in the field.
let recognition;
x.SpeechRecognition=class{
 constructor(){recognition=this;}
 start(){}
 stop(){this.onend?.();}
 abort(){}
};
ctx=setup();v=formFor(ctx,'blockers','已核实业主不在上海。');original=v.area.value;
U.voiceField(v.f,'blockers');assert.equal(x.WBReviewVoice.recording,true);
assert.equal(v.tools['[data-sr="voice-field"]'].disabled,true);assert.equal(v.tools['[data-sr="voice-end"]'].hidden,false);
recognition.onstart();
const result=[{transcript:'准备确认视频沟通的时间。'}];result.isFinal=true;
recognition.onresult({results:[result]});
assert.equal(v.area.value,original+'\n准备确认视频沟通的时间。');
assert.equal(v.d.fields.blockers,v.area.value);assert.equal(v.d.dirty,true);
x.WBReviewVoice.stop();
assert.equal(x.WBReviewVoice.recording,false);assert.equal(v.area.readOnly,false);
assert.equal(v.tools['[data-sr="voice-field"]'].disabled,false);assert.equal(v.tools['[data-sr="voice-end"]'].hidden,true);
assert.equal(modelCalls,0);

// Manual corrections survive rendering and remain separate between periods.
v.area.value+='\n补充：需经理协助。';v.area.dispatchEvent(new Event('input'));
const text=v.area.value;U.paint(ctx);assert.equal(v.d.fields.blockers,text);
S.selection.set(month,{type:'weekly',start:'2026-11-16'});U.paint(ctx);
S.selection.set(month,{type:'weekly',start:period.periodStart});U.paint(ctx);
assert.equal(U.draft(ctx,period,store).fields.blockers,text);
assert.equal(modelCalls,0);
console.log('PASS: no AI controls or download notices, no model calls, unified legacy fields, retained fourth title, four dictation controls, unsupported fallback, successful voice input and manual input retention');

