/* Queue and cancellation for the local review editor. No cloud text-generation endpoint. */
(function(root){
 'use strict';
 const MODEL='onnx-community/Qwen2.5-1.5B-Instruct',REVISION='d54957e3af1be04546436e874a60fe386041b244';
 const base=root.document?.currentScript?.src||new URL('operations/review-ai.js',root.location?.href||'https://localhost/').href;
 const WORKER_URL=new URL('review-ai-worker.js?v=20261115-ai-q4-02',base).href;
 const KINDS=new Set(['actions','highlights','blockers','nextActions','companyStrategy']);
 let worker=null,current=null,queue=[],sequence=0,status={phase:'idle',message:'免费本机AI；首次使用需自动下载约1.2—1.8GB模型。',model:MODEL};
 const abortError=()=>Object.assign(Error('已取消AI整理，原文仍保留'),{name:'AbortError'});
 function report(req,update){status={...status,...update};try{req?.onProgress?.({...status});}catch{}}
 function clear(req){if(req.timer)root.clearTimeout(req.timer);req.signal?.removeEventListener('abort',req.abort);}
 function finish(req,error,result){if(current!==req)return;clear(req);current=null;report(req,{phase:error?'error':'ready',message:error?.message||'整理稿已生成，请核对后再应用。'});error?req.reject(error):req.resolve(result);drain();}
 function kill(){if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}worker=null;}
 function timer(req,ms,message){if(req.timer)root.clearTimeout(req.timer);req.timer=root.setTimeout(()=>{if(current!==req)return;kill();finish(req,Error(message));},ms);}
 function createWorker(){
  if(worker)return worker;if(typeof root.Worker!=='function')throw Error('当前浏览器不支持本机AI整理，请使用新版桌面Chrome或Edge；原文仍保留');
  worker=new root.Worker(WORKER_URL,{type:'module',name:'workbench-review-local-ai'});
  worker.onmessage=event=>{const req=current,data=event.data||{};if(!req||data.id!==req.id)return;
   if(data.type==='progress'){report(req,{...data,phase:data.stage});if(data.stage==='generating'&&!req.generating){req.generating=true;timer(req,240000,'本机AI整理超时，原文仍保留；可减少单次输入后重试');}return;}
   if(data.type==='error'){finish(req,Error(data.message||'AI整理失败，原文仍保留'));return;}
   if(data.type==='result'){
    const result=data.result;if(result?.method!=='local-model'||result.model!==MODEL||result.revision!==REVISION||typeof result.text!=='string'||!result.text.trim()){finish(req,Error('未收到真实模型整理结果，原文仍保留'));return;}
    finish(req,null,result);
   }
  };
  worker.onerror=event=>{const req=current;kill();if(req)finish(req,Error('本机AI运行未完成，原文仍保留。请检查网络或使用新版桌面浏览器后重试。'));};
  return worker;
 }
 function drain(){if(current||!queue.length)return;const req=queue.shift();if(req.signal?.aborted){clear(req);req.reject(abortError());drain();return;}current=req;report(req,{phase:'loading',message:'正在准备免费本机AI；首次会自动下载模型，后续复用缓存。'});timer(req,720000,'本机模型准备超时，原文仍保留。请检查网络后重试');try{createWorker().postMessage({id:req.id,input:req.input});}catch(error){finish(req,error);}}
 function organize({text='',kind='actions',context={},onProgress,signal}={}){
  if(typeof text!=='string'||text.length>6000||!KINDS.has(kind))return Promise.reject(Error('整理内容或类型不正确；每框最多6000字'));
  let safeContext;try{safeContext=JSON.parse(JSON.stringify(context||{}));if(JSON.stringify(safeContext).length>16000)throw Error();}catch{return Promise.reject(Error('背景信息过长或格式不正确，原文仍保留'));}
  if(!text.trim()&&kind!=='companyStrategy')return Promise.reject(Error('请先输入或说出需要整理的内容'));
  if(signal?.aborted)return Promise.reject(abortError());
  return new Promise((resolve,reject)=>{const req={id:++sequence,input:{text,kind,context:safeContext},onProgress,signal,resolve,reject,timer:null,generating:false};req.abort=()=>{if(current===req){kill();finish(req,abortError());}else{queue=queue.filter(x=>x!==req);clear(req);reject(abortError());}};signal?.addEventListener('abort',req.abort,{once:true});queue.push(req);drain();});
 }
 function stop(){const req=current;if(!req)return;kill();finish(req,abortError());}
 function reset(){const pending=queue;queue=[];for(const req of pending){clear(req);req.reject(abortError());}if(current){const req=current;kill();finish(req,abortError());}else kill();status={phase:'idle',message:'AI已停止，原文仍保留。',model:MODEL};}
 root.addEventListener?.('pagehide',reset);
 root.WBReviewAI={organize,stop,reset,model:MODEL,revision:REVISION,get busy(){return !!current||queue.length>0;},get status(){return {...status};}};
 if(typeof module==='object')module.exports=root.WBReviewAI;
})(typeof window==='object'?window:globalThis);
