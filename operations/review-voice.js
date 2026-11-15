/* Reusable dictation for review textareas. Recognition never saves or submits a report. */
(function(root){
 'use strict';
 let active=null;
 const fallback='也可直接在此框使用输入法语音（Windows：Win+H）。';
 const call=(fn,...args)=>{try{if(typeof fn==='function')fn(...args);}catch{}};
 const emit=(session,message,state)=>call(session.onStatus,message,{state,area:session.area});
 function endResult(session,reason){return {reason,heard:session.heard,text:String(session.area?.value??''),area:session.area};}
 function finish(session,message,reason='ended',statusState='ended'){
  if(active!==session)return false;
  root.clearTimeout(session.connectionTimer);root.clearTimeout(session.limitTimer);root.clearTimeout(session.stopTimer);
  session.observer?.disconnect();
  session.area.readOnly=session.originalReadOnly;
  const r=session.recognition;r.onstart=null;r.onresult=null;r.onerror=null;r.onend=null;
  active=null;
  if(message)emit(session,message,statusState);
  call(session.onEnd,endResult(session,reason));
  return true;
 }
 function reset(reason='reset'){
  const session=active;if(!session)return false;
  finish(session,'语音已结束，已转出的文字保留在原输入框。',reason);
  try{session.recognition.abort();}catch{}
  return true;
 }
 function failStart(options,message,reason){
  emit(options,message,'error');call(options.onEnd,{reason,heard:false,text:String(options.area?.value??''),area:options.area});return false;
 }
 function stop(reason='stopped'){
  const session=active;if(!session)return false;if(session.stopping)return true;
  session.stopping=true;session.stopReason=reason;root.clearTimeout(session.connectionTimer);
  emit(session,reason==='time-limit'?'本次已达到3分钟，正在结束语音并保留文字…':'正在结束语音并保留文字…','stopping');
  session.stopTimer=root.setTimeout(()=>{
   if(finish(session,'语音已结束，文字已保留；请核对后再整理。',reason))try{session.recognition.abort();}catch{}
  },3000);
  try{session.recognition.stop();}catch{
   finish(session,'语音已结束，文字已保留；请核对后再整理。',reason);
   try{session.recognition.abort();}catch{}
  }
  return true;
 }
 function start(options={}){
  const area=options.area;
  if(!area||typeof area.value!=='string'||area.isConnected===false)return failStart(options,'请先打开需要语音输入的复盘文字框。','invalid-area');
  if(active?.area===area)return true;
  if(area.disabled||area.readOnly)return failStart(options,'此文字框当前不可编辑，请等待数据载入或结束当前操作后重试。','readonly');
  const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition;
  if(!Recognition)return failStart(options,'此浏览器不支持网页语音输入。'+fallback,'unsupported');
  if(!root.isSecureContext)return failStart(options,'请通过HTTPS打开工作台后使用语音输入。'+fallback,'insecure');
  if(active)reset('field-change');
  let recognition;try{recognition=new Recognition();}catch{return failStart(options,'浏览器语音识别无法启动。'+fallback,'unavailable');}
  const session={...options,area,recognition,base:area.value,lastWritten:area.value,originalReadOnly:area.readOnly,heard:false,stopping:false};
  active=session;area.readOnly=true;area.focus?.();
  emit(session,'正在连接语音识别，请允许麦克风；识别成功后文字将直接进入当前输入框。','connecting');
  recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
  recognition.onstart=()=>{if(active!==session)return;root.clearTimeout(session.connectionTimer);emit(session,'正在听你说话，文字直接进入当前输入框；说完点击“结束语音”。','listening');};
  recognition.onresult=event=>{
   if(active!==session)return;
   if(area.isConnected===false){reset('detached');return;}
   if(area.value!==session.lastWritten){finish(session,'输入框内容已发生修改，语音已结束；现有文字保留。','content-change');try{recognition.abort();}catch{}return;}
   // results is the complete current session, including revised interim segments.
   // Rebuild from that list instead of appending on every recognition event.
   const segments=Array.from(event.results||[]).map(result=>String(result?.[0]?.transcript??''));
   const transcript=segments.join('');if(!transcript.trim())return;
   session.heard=true;
   area.value=session.base+(session.base&&!/[\s\n]$/.test(session.base)?'\n':'')+transcript;
   session.lastWritten=area.value;
   if(root.Event&&area.dispatchEvent)area.dispatchEvent(new root.Event('input',{bubbles:true}));
   area.scrollTop=area.scrollHeight;
   call(session.onChange,area.value,{area,final:Array.from(event.results||[]).every(result=>result.isFinal===true)});
   if(active===session&&!session.stopping)emit(session,'语音文字已进入当前框，正在继续识别；说完点击“结束语音”，再一键整理。','transcribing');
  };
  recognition.onerror=event=>{
   if(active!==session)return;
   if(session.stopping&&event.error==='aborted'){finish(session,'语音已结束，文字已保留；请核对后再整理。',session.stopReason||'stopped');return;}
   const messages={network:'浏览器语音识别服务连接失败。','not-allowed':'麦克风或语音识别未获授权，请检查地址栏权限。','service-not-allowed':'浏览器未允许语音识别服务。','no-speech':'未识别到说话，请检查麦克风后重试。','audio-capture':'无法取得麦克风声音，请检查输入设备是否被占用。','language-not-supported':'当前语音识别服务不支持中文。',aborted:'本次语音识别已中断。'};
   finish(session,(messages[event.error]||'语音识别已中断。')+'已转出的文字保留。'+fallback,'error:'+String(event.error||'unknown'),'error');
   try{recognition.abort();}catch{}
  };
  recognition.onend=()=>{
   if(active!==session)return;
   finish(session,session.heard?'语音已结束，文字已保留；核对后可一键整理。':'本次没有生成语音文字。'+fallback,session.stopping?session.stopReason||'stopped':'ended');
  };
  session.connectionTimer=root.setTimeout(()=>{
   if(active!==session||session.heard)return;
   finish(session,'语音服务连接超时，未生成文字。'+fallback,'timeout','error');try{recognition.abort();}catch{}
  },15000);
  session.limitTimer=root.setTimeout(()=>stop('time-limit'),180000);
  if(root.MutationObserver&&root.document?.documentElement){session.observer=new root.MutationObserver(()=>{if(active===session&&area.isConnected===false)reset('detached');});session.observer.observe(root.document.documentElement,{childList:true,subtree:true});}
  try{recognition.start();return true;}catch{finish(session,'语音识别无法启动。'+fallback,'start-error','error');try{recognition.abort();}catch{}return false;}
 }
 root.document?.addEventListener('click',event=>{if(event.target?.closest?.('[data-view-mode]'))reset('view-change');},true);
 root.document?.addEventListener('change',event=>{
  if(['year-filter','month-filter','region-filter','store-filter'].includes(event.target?.id)||event.target?.dataset?.srControl)reset('scope-change');
 });
 root.document?.addEventListener('toggle',event=>{const details=event.target;if(active&&details?.tagName==='DETAILS'&&!details.open&&details.contains?.(active.area))reset('section-closed');},true);
 root.addEventListener?.('pagehide',()=>reset('pagehide'));
 root.WBReviewVoice={start,stop,reset,get recording(){return !!active;},get activeArea(){return active?.area||null;}};
 if(typeof module==='object')module.exports=root.WBReviewVoice;
})(typeof window==='object'?window:globalThis);
