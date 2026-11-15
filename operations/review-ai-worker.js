/* Actual local-model inference. Only model/runtime assets are fetched; review text stays in this worker. */
(function(scope){
 'use strict';
 const MODEL='onnx-community/Qwen2.5-1.5B-Instruct';
 const REVISION='d54957e3af1be04546436e874a60fe386041b244';
 const LIBRARY='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.web.min.js';
 const ASSET_ROOT='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
 const KINDS=new Set(['actions','highlights','blockers','nextActions','companyStrategy']);
 let generator=null,device='',loading=null;
 const clean=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
 function sourceText(input){return clean(input.text)+(input.kind==='companyStrategy'?'\n'+(typeof input.context==='string'?input.context:JSON.stringify(input.context||{}))+'\n'+companyFacts(input.context):'');}
 function companyFacts(context){
  if(typeof context==='string')return context.slice(0,2000);
  const c=context||{},v=c.calculation||{},lines=[];
  const shown=(label,value)=>{if(value!==null&&value!==undefined&&value!=='')lines.push(label+value+'套');};
  if(c.periodStart&&c.periodEnd)lines.push('计划周期：'+c.periodStart+'至'+c.periodEnd);
  shown('下周建议或确认目标：',c.quantitativeGoal??v.suggestedTarget);shown('月目标：',v.monthlyTarget??c.monthTarget);shown('月累计实际面见：',v.monthlyMet??c.met);shown('月剩余差距：',v.remainingGap);
  const stores=Array.isArray(c.stores)?c.stores:[];
  const priorities=stores.map(x=>({...x,gap:Math.max(0,Number(x.target||0)-Number(x.met||0))})).sort((a,b)=>b.gap-a.gap).slice(0,3);
  for(const x of priorities){const details=[];if(x.target!==null&&x.target!==undefined)details.push('月目标'+x.target+'套');if(x.met!==undefined)details.push('累计面见'+x.met+'套');if(x.storeTopStock!==undefined)details.push('门店TOP未见'+Math.max(0,Number(x.storeTopStock)-Number(x.storeTopMet||0))+'套');lines.push(x.store+'：'+details.join('，'));}
  for(const r of (Array.isArray(c.confirmedReviews)?c.confirmedReviews:[]).slice(0,2))lines.push('已确认BP复盘摘要（'+r.store+'）：'+[r.highlights,r.blockers,r.nextActions].filter(Boolean).join('；').slice(0,420));
  if(!lines.length)return JSON.stringify(c).slice(0,2000);
  return lines.join('。\n');
 }
 function buildMessages(input){
  if(!KINDS.has(input.kind))throw Error('不支持的整理类型');
  if(input.kind==='companyStrategy')return [{role:'system',content:'你负责在售房源业主面见项目。面见是顾问与业主面对面沟通，TOP房是优先维护的重点在售房源。服务对象是业主。只写未来建议，不编造已完成的动作、效果或原因，不新增数字。'},
   {role:'user',content:'根据以下事实，写3项下一周核心策略草稿，每项不超过80字并分行。每项必须引用给定重点店名或未面见TOP房对象。围绕经理组织业主邀约、逐套明确责任人与时间、BP核实执行，写清准备采取的动作。区分计划、已邀约和实际面见；安排待确认时如实写待确认。不另创社交媒体、邮件、沙龙、展会等渠道活动，不写买家营销。\n'+companyFacts(input.context)+(clean(input.text)?'\n现有原稿供参考：'+clean(input.text).slice(0,900):'')}];
  return [{role:'user',content:'请用简体中文简洁整理并分行，不用表格。按原文顺序去口头语，保留数字及计划、邀约、实际、待确认状态，不增加事实。\n原文：'+clean(input.text)}];
 }
 function tidy(text){return clean(text).replace(/^```(?:text|markdown|json)?\s*\n?|\n?```$/g,'').replace(/\*\*/g,'').replace(/^\s*[#*•]+\s*/gm,'').replace(/^\s*-\s+/gm,'').replace(/\n{3,}/g,'\n\n').trim();}
 function numbers(text){return [...new Set(String(text).replace(/^\s*\d+[.、)]\s*/gm,'').match(/\d+(?:\.\d+)?/g)||[])];}
 function quantities(text){return [...new Set(String(text).match(/\d+(?:\.\d+)?\s*(?:套|次|户|个项目)/g)||[])].map(v=>v.replace(/\s/g,''));}
 function meetingFacts(text){const facts=new Set();for(const clause of String(text).split(/[，,。；;\n]/)){for(const match of clause.matchAll(/(\d+(?:\.\d+)?)\s*套/g)){const before=clause.slice(0,match.index),after=clause.slice(match.index+match[0].length),near=before.slice(-14)+after.slice(0,14);if(!/面见|见了|见过|已见|见到/.test(near))continue;if(/原定|原来|计划|准备|预计|拟|想|待|尚未|未能|没有|还没/.test(before)&&!/实际|已(?:经)?面见/.test(before))continue;if(/尚未|还没|未面见|未见/.test(after.slice(0,10)))continue;facts.add(match[1]);}}return facts;}
 function validateResult(raw,input){
  const text=tidy(raw),source=sourceText(input),warnings=[];
  if(!text||text.length<3)throw Error('模型没有生成可用整理稿，原文仍保留，请重试');
  if(text.length>12000)throw Error('模型输出过长，原文仍保留，请分段整理');
  const allowed=new Set(numbers(source)),extra=numbers(text).filter(x=>!allowed.has(x));
  if(extra.length)throw Error('整理稿出现原文未提供的数字（'+extra.slice(0,5).join('、')+'），已拦截，请核对原文后重试');
  if(input.kind!=='companyStrategy'){
   const quantitySource=new Set(quantities(source)),extraQuantities=quantities(text).filter(v=>!quantitySource.has(v));
   if(extraQuantities.length)throw Error('整理稿改变了原文数量的单位或含义（'+extraQuantities.slice(0,4).join('、')+'），已拦截；原文仍保留');
   const sourceFacts=meetingFacts(source),outFacts=meetingFacts(text);
   if([...outFacts].some(v=>!sourceFacts.has(v)))throw Error('整理稿可能把计划或邀约量改成了实际面见量，已拦截；请保留原文并核对');
   if([...sourceFacts].some(v=>!outFacts.has(v)))warnings.push('整理稿可能没有完整保留原文中的实际面见量，请与原文逐项核对。');
   const unsupported=['线上沟通','线下面见','电话沟通','面见失败','面见成功','成交成功','签约成功','业主满意','信任提升','客户认可'].filter(v=>text.includes(v)&&!source.includes(v));
   if(unsupported.length)throw Error('整理稿出现原文未提供的具体方式或结果（'+unsupported.slice(0,3).join('、')+'），已拦截；原文仍保留');
   if(/未核实|尚未核实|没有.{0,8}核实|还没.{0,8}核实/.test(source)&&/已核实|确认原因是|原因已经明确/.test(text))throw Error('整理稿把待核实信息写成了已确认原因，已拦截；原文仍保留');
  }
  const positiveSource=source.replace(/(?:未|尚未|没有|还没|没|不|未能|无法)(?:全部|完全|按时|如期)?(?:完成|执行|落实|达成|实现|面见|邀约)/g,'');
  if(input.kind!=='companyStrategy'&&!/(已(?:经)?(?:完成|执行|落实|达成|实现|面见|邀约)|完成了|执行了|落实了|实际.{0,8}(完成|面见))/.test(positiveSource)&&/(已(?:经)?(?:完成|执行|落实|达成|实现)|完成了|落实了|达成了)/.test(text))throw Error('整理稿把尚未证明完成的事项写成了已完成，已拦截；请核对后重试');
  if(/计划|准备|预计|下周|拟|待/.test(source)&&/已|完成|实际/.test(source))warnings.push('原文同时包含计划和执行信息，请核对整理稿中的完成状态。');
  const missing=numbers(input.text).filter(x=>!numbers(text).includes(x));if(missing.length)warnings.push('部分原文数字未出现在整理稿中（'+missing.slice(0,6).join('、')+'），请确认是否需要保留。');
  if(/未|尚未|还没|没有|未能|无法/.test(input.text)&&!/未|尚未|还没|没有|未能|无法|待核实|待补充|待确认/.test(text))warnings.push('请特别核对原文中的未完成、否定或待确认事项，避免改变原意。');
  if(input.kind==='companyStrategy')warnings.push('此为AI生成的策略草稿。重点对象、目标量、责任分工、完成时间和资源安排需项目负责人审核；建议不代表已确认或已执行。');
  return {text:input.kind==='companyStrategy'?'策略草稿\n'+text:text,model:MODEL,revision:REVISION,method:'local-model',warnings};
 }
 function generatedText(result){const value=result?.[0]?.generated_text;if(Array.isArray(value))return value.at(-1)?.content||'';return typeof value==='string'?value:'';}
 function post(id,type,value){scope?.postMessage?.({id,type,...value});}
 async function chooseDevice(){
  try{const adapter=await scope.navigator?.gpu?.requestAdapter({powerPreference:'high-performance'});if(adapter?.features?.has('shader-f16'))return 'webgpu';}catch{}
  return 'wasm';
 }
 async function ensureGenerator(id){
  if(generator)return generator;if(loading)return loading;
  loading=(async()=>{
   post(id,'progress',{stage:'loading',message:'首次使用正在准备免费本机AI，模型约1.2—1.8GB；完成后浏览器会缓存复用。'});
   const {pipeline,env}=await import(LIBRARY);env.allowLocalModels=false;env.useBrowserCache=true;
   env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.wasmPaths=ASSET_ROOT;
   device=await chooseDevice();
   function progress_callback(p){const total=Number(p.total||0),loaded=Number(p.loaded||0),progress=Number.isFinite(Number(p.progress))?Number(p.progress):total?loaded/total*100:0;post(id,'progress',{stage:'loading',device,progress,loaded,total,message:p.status==='progress'?`正在下载本机模型 ${Math.max(0,Math.min(100,progress)).toFixed(0)}%`:'正在准备本机AI模型…'});}
   try{generator=await pipeline('text-generation',MODEL,{revision:REVISION,dtype:device==='webgpu'?'q4f16':'q4',device,progress_callback});}
   catch(error){
    if(device!=='webgpu')throw error;
    post(id,'progress',{stage:'loading',device:'wasm',message:'显卡模式不可用，正在尝试本机兼容模式；可能需要缓存另一份约1.8GB模型。'});device='wasm';
    generator=await pipeline('text-generation',MODEL,{revision:REVISION,dtype:'q4',device:'wasm',progress_callback});
   }
   return generator;
  })();
  try{return await loading;}catch(error){generator=null;throw Error('本机AI模型未能准备完成。请检查网络和浏览器空间后重试；原文没有改变。');}finally{loading=null;}
 }
 async function run(id,input){
  if(!KINDS.has(input.kind)||typeof input.text!=='string'||input.text.length>6000||JSON.stringify(input.context||{}).length>16000)throw Error('整理内容或背景数据超出支持范围');
  if(!clean(input.text)&&input.kind!=='companyStrategy')throw Error('请先输入或说出需要整理的内容');
  const pipe=await ensureGenerator(id);post(id,'progress',{stage:'generating',device,message:'AI正在本机整理，原文仍保留，请稍候…'});
  const maxTokens=input.kind==='companyStrategy'?600:Math.min(520,Math.max(160,Math.ceil(input.text.length*0.9)));
  const output=await pipe(buildMessages(input),{max_new_tokens:maxTokens,do_sample:false,return_full_text:false});
  const raw=generatedText(output),tokenCount=pipe.tokenizer.encode(raw,{add_special_tokens:false}).length;
  if(tokenCount>=maxTokens-1)throw Error('模型输出触及长度上限，可能尚未整理完整；原文仍保留，请分段整理或重试');
  return validateResult(raw,input);
 }
 if(scope?.postMessage)scope.onmessage=async event=>{const {id,input}=event.data||{};try{post(id,'result',{result:await run(id,input)});}catch(error){post(id,'error',{message:error?.message||'AI整理未完成，原文仍保留，请重试'});}};
 if(typeof module==='object')module.exports={MODEL,REVISION,LIBRARY,companyFacts,buildMessages,tidy,numbers,quantities,meetingFacts,validateResult,generatedText};
})(typeof self==='object'?self:null);
