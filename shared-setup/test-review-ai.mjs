/* No network or model download by default. Optional real CPU inference uses REVIEW_AI_REAL_RUNTIME. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const worker=require('../operations/review-ai-worker.js');
const source=fs.readFileSync(new URL('../operations/review-ai.js',import.meta.url),'utf8');
const workerSource=fs.readFileSync(new URL('../operations/review-ai-worker.js',import.meta.url),'utf8');
assert.equal(worker.MODEL,'onnx-community/Qwen2.5-1.5B-Instruct');
assert.match(worker.REVISION,/^[a-f0-9]{40}$/);
assert.match(worker.LIBRARY,/@huggingface\/transformers@3\.8\.1\/dist\/transformers\.web\.min\.js$/);
assert.ok(!/fetch\(|api[_-]?key|api\.openai|pollinations/i.test(workerSource),'no external text generation or embedded credentials');

const input={text:'嗯，本周原来想请A组经理约3套业主面见，实际先约到了2套，其中1套已经面见了。还有1套业主本周不在上海，预计下周再约。',kind:'actions',context:{store:'新天地一店'}};
const messages=worker.buildMessages(input);assert.equal(messages.length,1);assert.ok(messages[0].content.includes(input.text));assert.match(messages[0].content,/按原文顺序/);assert.ok(!messages[0].content.includes('新天地一店'),'factual editing cannot borrow facts from background');
let result=worker.validateResult('核心动作：A组经理邀约3套业主。\n实际执行与结果：已约2套，其中1套已面见；另1套业主本周不在上海，计划下周再约。',input);
assert.equal(result.method,'local-model');assert.equal(result.revision,worker.REVISION);
assert.ok(result.warnings.length>0,'mixed execution and plans require preview review');
assert.throws(()=>worker.validateResult('本周完成面见8套。',input),/原文未提供的数字/);
assert.throws(()=>worker.validateResult('面见次数：3次。',input),/数量的单位或含义/);
assert.throws(()=>worker.validateResult('实际面见3套，其中1套面见失败。',input),/计划或邀约量/);
assert.throws(()=>worker.validateResult('已约2套，其中1套面见成功。',input),/具体方式或结果/);
assert.throws(()=>worker.validateResult('已核实主要时间放在带看。',{text:'经理说时间放在带看，我还没有核实。',kind:'blockers',context:{}}),/待核实信息/);
assert.throws(()=>worker.validateResult('已完成邀约。',{text:'预计明天邀约业主，目前尚未完成。',kind:'actions',context:{}}),/尚未证明完成/);
assert.throws(()=>worker.validateResult('',input),/没有生成可用/);
assert.equal(worker.tidy('**核心动作**\n* 约业主\n- 保留原文'),'核心动作\n约业主\n保留原文');
assert.equal(worker.generatedText([{generated_text:[{role:'user',content:'原文'},{role:'assistant',content:'整理稿'}]}]),'整理稿');
assert.equal(worker.generatedText([{generated_text:'直接回复'}]),'直接回复');
result=worker.validateResult('优先核实A组未面见TOP房的邀约安排。',{text:'',kind:'companyStrategy',context:{monthTarget:300,met:98}});assert.match(result.warnings.join(''),/策略草稿/);

const workers=[];
class FakeWorker{
 constructor(url,options){this.url=url;this.options=options;this.sent=[];workers.push(this);}
 postMessage(value){this.sent.push(value);}
 terminate(){this.terminated=true;}
 progress(stage='loading'){this.onmessage?.({data:{id:this.sent.at(-1).id,type:'progress',stage,message:'进度'}});}
 result(text='核心动作：联系经理确认邀约安排。'){this.onmessage?.({data:{id:this.sent.at(-1).id,type:'result',result:{text,model:worker.MODEL,revision:worker.REVISION,method:'local-model',warnings:[]}}});}
 error(message){this.onmessage?.({data:{id:this.sent.at(-1).id,type:'error',message}});}
}
const x={window:null,Worker:FakeWorker,URL,AbortController,setTimeout,clearTimeout,document:{currentScript:{src:'https://example.test/mianjiang/operations/review-ai.js'}},addEventListener(){}};x.window=x;vm.createContext(x);vm.runInContext(source,x);const A=x.WBReviewAI;
const progress=[];
const p1=A.organize({...input,onProgress:p=>progress.push(p)});const p2=A.organize({text:'记录第二个框',kind:'highlights'});
assert.equal(workers.length,1);assert.equal(workers[0].sent.length,1);assert.match(workers[0].url,/mianjiang\/operations\/review-ai-worker\.js/);assert.equal(workers[0].options.type,'module');
workers[0].progress('loading');workers[0].progress('generating');workers[0].result();assert.equal((await p1).method,'local-model');assert.equal(workers[0].sent.length,2,'generation is serialized');workers[0].result();await p2;assert.equal(A.busy,false);assert.ok(progress.some(p=>p.phase==='generating'));

const p3=A.organize(input);workers[0].error('模型下载失败，原文保留');await assert.rejects(p3,/模型下载失败/);assert.equal(A.status.phase,'error','failure is not reported as AI success');
const p4=A.organize(input);workers[0].onmessage({data:{id:workers[0].sent.at(-1).id,type:'result',result:{text:'伪整理',model:worker.MODEL,revision:worker.REVISION,method:'rules'}}});await assert.rejects(p4,/真实模型/);

const firstAbort=new AbortController();const p5=A.organize({...input,signal:firstAbort.signal});const p6=A.organize(input);const staleHandler=workers[0].onmessage,oldId=workers[0].sent.at(-1).id;firstAbort.abort();await assert.rejects(p5,e=>e.name==='AbortError');assert.equal(workers[0].terminated,true);assert.equal(workers.length,2);staleHandler({data:{id:oldId,type:'result',result:{text:'已过期结果',model:worker.MODEL,revision:worker.REVISION,method:'local-model'}}});assert.equal(A.busy,true,'late result cannot resolve the next request');workers[1].result();await p6;

const queuedAbort=new AbortController();const p7=A.organize(input),p8=A.organize({...input,signal:queuedAbort.signal});queuedAbort.abort();await assert.rejects(p8,e=>e.name==='AbortError');workers[1].result();await p7;assert.equal(A.busy,false);
const p9=A.organize(input);A.stop();await assert.rejects(p9,e=>e.name==='AbortError');
const p10=A.organize(input),p11=A.organize(input);A.reset();await assert.rejects(p10,e=>e.name==='AbortError');await assert.rejects(p11,e=>e.name==='AbortError');assert.equal(A.busy,false);
await assert.rejects(A.organize({text:'',kind:'actions'}),/先输入/);await assert.rejects(A.organize({text:'x'.repeat(6001),kind:'actions'}),/6000/);

// Explicit timeout must terminate inference; a late worker response cannot become a preview.
const clock=new Map();let timerId=0;const timed={...x,window:null,setTimeout(fn,ms){const id=++timerId;clock.set(id,{fn,ms});return id;},clearTimeout(id){clock.delete(id);}};timed.window=timed;
vm.createContext(timed);vm.runInContext(source,timed);const T=timed.WBReviewAI,timedPromise=T.organize(input),timedWorker=workers.at(-1);
assert.equal([...clock.values()][0].ms,720000);timedWorker.progress('generating');assert.equal([...clock.values()][0].ms,240000);
const lateTimeoutHandler=timedWorker.onmessage,timeoutId=timedWorker.sent.at(-1).id;[...clock.values()][0].fn();await assert.rejects(timedPromise,/超时/);assert.equal(timedWorker.terminated,true);assert.equal(T.busy,false);
lateTimeoutHandler({data:{id:timeoutId,type:'result',result:{text:'超时后的旧稿',model:worker.MODEL,revision:worker.REVISION,method:'local-model'}}});assert.equal(T.status.phase,'error');
const compactContext={quantitativeGoal:79,calculation:{monthlyTarget:300,monthlyMet:98,remainingGap:202},stores:[{store:'甲店',target:15,met:2,storeTopStock:8,storeTopMet:2}]};
assert.match(worker.companyFacts(compactContext),/TOP未见6套/);assert.doesNotThrow(()=>worker.validateResult('建议甲店逐套安排6套未面见TOP房的业主邀约。',{kind:'companyStrategy',text:'',context:compactContext}));


if(process.env.REVIEW_AI_REAL_RUNTIME){
 const {pipeline,env}=await import(process.env.REVIEW_AI_REAL_RUNTIME);env.allowLocalModels=false;env.cacheDir=process.env.REVIEW_AI_MODEL_CACHE||'/workspace/scratch/c76c968338bc/ai-engine-test/model-cache';
 const started=Date.now();const pipe=await pipeline('text-generation',worker.MODEL,{revision:worker.REVISION,dtype:'q4',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
 const output=await pipe(worker.buildMessages(input),{max_new_tokens:250,do_sample:false,return_full_text:false});
 const actual=worker.validateResult(worker.generatedText(output),input);
 console.log(JSON.stringify({realInference:true,elapsedSeconds:Math.round((Date.now()-started)/1000),text:actual.text,warnings:actual.warnings}));
 await pipe.dispose();
}
console.log('PASS: actual-model provenance, pinned assets, fact/status validation, preview warnings, serial queue, cancellation, late-result isolation and explicit failure (no rules fallback)');
