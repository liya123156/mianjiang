/* Browser speech-to-text writes interim and final words into the source textarea. */
(function(root){
 'use strict';let active=null;
 const get=id=>document.getElementById(id);
 function status(text){const el=get('ops-voice-status');if(el)el.textContent=text;}
 function controls(on){const start=document.querySelector('[data-ops="voice"]'),stop=document.querySelector('[data-ops="voice-stop"]');if(start){start.disabled=on;start.textContent='语音转文字';}if(stop){stop.hidden=!on;stop.disabled=false;stop.textContent='结束语音';}}
 function finish(s,text){if(active!==s)return;clearTimeout(s.timeout);clearTimeout(s.limit);s.area.readOnly=false;active=null;controls(false);if(text)status(text);}
 function reset(){const s=active;if(s){finish(s);try{s.recognition.abort();}catch{}}}
 function field(){return `<div class="ops-voice-panel"><p id="ops-voice-status" role="status" aria-live="polite">①语音转文字／直接输入 → ②核对原文 → ③整理并预览 → ④确认并同步。文字会直接显示在上方输入框。</p><p class="ops-muted">语音使用浏览器识别服务，连接失败时不能自动转写；可点击上方输入框，使用输入法语音（Windows：Win+H）。整理采用原文分类与缺项提示，尚未接入大模型；不补写原文没有的人名、时间和原因。共享保存需登录并筛选单店。</p></div>`;}
 async function start(){
  if(active)return;const area=get('ops-scene');if(!area)return;
  const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition;
  if(!Recognition){status('此浏览器不支持网页语音转文字。请在上方输入框使用输入法语音输入（Windows：Win+H）。');return;}
  if(!root.isSecureContext){status('语音转文字需要通过HTTPS打开工作台。');return;}
  const r=new Recognition(),s={area,base:area.value,recognition:r,heard:false,failed:false,stopping:false};active=s;area.readOnly=true;controls(true);status('正在连接语音识别，请允许麦克风；连接成功后说话，文字将直接进入输入框。');
  r.lang='zh-CN';r.continuous=true;r.interimResults=true;
  r.onstart=()=>{if(active!==s)return;clearTimeout(s.timeout);status('正在听你说话，文字直接进入上方输入框。说完点击“结束语音”，再核对文字。');};
  r.onresult=event=>{
   if(active!==s||!area.isConnected)return;
   const text=Array.from(event.results).map(x=>x[0]?.transcript||'').join('');if(!text)return;s.heard=true;
   area.value=s.base+(s.base&&!/[\s\n]$/.test(s.base)?'\n':'')+text;area.dispatchEvent(new Event('input',{bubbles:true}));area.scrollTop=area.scrollHeight;
   status('文字已进入输入框；正在继续识别。说完点击“结束语音”，然后“整理并预览”。');
  };
  r.onerror=event=>{if(active!==s)return;s.failed=true;const messages={network:'无法连接浏览器语音识别服务。允许麦克风并不能保证转写连接成功；请改用输入法语音（Win+H）。','not-allowed':'语音识别未获授权，请检查地址栏麦克风权限。','service-not-allowed':'浏览器不允许语音识别服务，请改用输入法语音（Win+H）。','no-speech':'没有识别到说话，请检查麦克风输入设备后重试。','audio-capture':'无法取得麦克风声音，请检查设备是否被占用。','language-not-supported':'此浏览器的识别服务不支持中文，请改用输入法语音。'};finish(s,messages[event.error]||'语音识别已中断，已转出的文字保留；可继续手动修改。');try{r.abort();}catch{}};
  r.onend=()=>{if(active!==s)return;finish(s,s.heard?'语音已结束，原文已留在输入框。核对后点击“整理并预览”。':'本次没有生成文字，请检查麦克风或使用输入法语音（Win+H）。');};
  try{r.start();s.timeout=setTimeout(()=>{if(active!==s||s.heard)return;finish(s,'语音服务连接超时，未生成文字。可在上方输入框使用输入法语音（Win+H）。');try{r.abort();}catch{}},15000);s.limit=setTimeout(stop,180000);}catch{finish(s,'语音识别无法启动，请重试或使用输入法语音（Win+H）。');}
 }
 function stop(){const s=active;if(!s)return;s.stopping=true;status('正在结束语音并保留文字…');try{s.recognition.stop();s.timeout=setTimeout(()=>finish(s,'语音已结束，文字已保留，请核对并整理。'),3000);}catch{finish(s,'语音已结束，文字已保留。');}}
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-view-mode]'))reset();},true);
 document.addEventListener('change',event=>{if(['year-filter','month-filter','region-filter','store-filter'].includes(event.target.id))reset();});
 root.addEventListener('pagehide',reset);
 root.WBVoice={field,start,stop,reset,get recording(){return !!active;}};
})(window);
