/* Microphone recording works independently of the browser's speech service. */
(function(root){
 'use strict';
 let active=null,clipUrl=null,sequence=0;
 const get=id=>document.getElementById(id);
 function status(message){const el=get('ops-voice-status');if(el)el.textContent=message;}
 function controls(recording,pending=false){const start=document.querySelector('[data-ops="voice"]'),stop=document.querySelector('[data-ops="voice-stop"]');if(start){start.disabled=recording||pending;start.textContent=pending?'正在申请麦克风…':'语音补充';}if(stop){stop.hidden=!recording;stop.disabled=pending;}}
 function release(s){clearInterval(s.timer);clearTimeout(s.limit);clearTimeout(s.recognitionTimer);if(s.stream&&!s.released){s.stream.getTracks().forEach(t=>t.stop());s.released=true;}}
 function reset(){sequence++;const s=active;active=null;if(s){s.cancelled=true;try{s.recognition?.abort();}catch{}try{if(s.recorder?.state!=='inactive')s.recorder?.stop();}catch{}release(s);}if(clipUrl){URL.revokeObjectURL(clipUrl);clipUrl=null;}}
 function note(s){const elapsed=Math.floor((Date.now()-s.started)/1000),time=Math.floor(elapsed/60)+':'+String(elapsed%60).padStart(2,'0');status('● 正在录音 '+time+' · '+(s.speechNote||'正在连接转文字服务…')+'。说完请点“停止录音”。');}
 function field(){return `<div class="ops-voice-panel"><p id="ops-voice-status" role="status" aria-live="polite">点击“语音补充”并允许麦克风，开始后会显示录音时间。</p><p id="ops-voice-interim" class="ops-muted" aria-live="off"></p><div id="ops-voice-playback"></div><p class="ops-muted">录音仅在当前页面回听／下载，不自动上传或共享；转文字使用浏览器语音服务，可能受网络或浏览器支持影响。无法转写时，可在上方输入框使用输入法语音（Windows：Win+H）。切换页面前请先保存文字或下载录音。</p></div>`;}
 function startRecognition(s){
  const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition;
  if(!Recognition){s.speechNote='此浏览器不支持自动转文字，录音仍可继续';note(s);return;}
  const r=new Recognition();s.recognition=r;r.lang='zh-CN';r.continuous=true;r.interimResults=true;
  r.onstart=()=>{if(active!==s)return;clearTimeout(s.recognitionTimer);s.speechNote='可边说边转文字';note(s);};
  r.onresult=event=>{if(active!==s)return;let final='',interim='';for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i];if(result.isFinal)final+=result[0].transcript;else interim+=result[0].transcript;}if(final&&s.area.isConnected){s.area.value+=(s.area.value&&!/[\s\n]$/.test(s.area.value)?'\n':'')+final;s.area.dispatchEvent(new Event('input',{bubbles:true}));s.words+=final.length;}const el=get('ops-voice-interim');if(el)el.textContent=interim?'识别中：'+interim:'';};
  r.onerror=event=>{if(active!==s)return;clearTimeout(s.recognitionTimer);s.speechError=true;const messages={network:'转文字服务连接失败，录音仍在继续',notAllowed:'转文字未获授权，录音仍在继续','not-allowed':'转文字未获授权，录音仍在继续','service-not-allowed':'浏览器不允许转写，录音仍在继续','no-speech':'暂未识别到说话，录音仍在继续','audio-capture':'转写未取得声音，录音仍在继续','language-not-supported':'转写暂不支持中文，录音仍在继续'};s.speechNote=messages[event.error]||'转文字暂不可用，录音仍在继续';note(s);};
  r.onend=()=>{if(active!==s||s.stopping||s.speechError)return;clearTimeout(s.recognitionTimer);s.speechNote='转写已结束，录音仍在继续';note(s);};
  try{r.start();s.recognitionTimer=setTimeout(()=>{if(active===s&&!s.words){s.speechNote='转文字连接较慢，录音仍在继续';note(s);}},10000);}catch{s.speechNote='转文字无法启动，录音仍在继续';note(s);}
 }
 async function start(){
  if(active)return;
  if(!root.isSecureContext||!navigator.mediaDevices?.getUserMedia){status('当前浏览器无法取得麦克风，请在Chrome或Edge中通过HTTPS打开工作台。');return;}
  if(!root.MediaRecorder){status('当前浏览器不支持录音，请改用Chrome／Edge，或直接使用输入法语音输入。');return;}
  const area=get('ops-scene');if(!area)return;
  if(clipUrl){status('请先下载或清除上一段录音，再开始新的录音。');return;}
  const s={id:++sequence,area,chunks:[],words:0,started:Date.now(),cancelled:false};active=s;controls(false,true);status('等待麦克风授权；允许后自动开始录音。');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});s.stream=stream;
   if(active!==s||s.cancelled||!area.isConnected){release(s);return;}
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>root.MediaRecorder.isTypeSupported?.(t));
   const recorder=mime?new root.MediaRecorder(stream,{mimeType:mime}):new root.MediaRecorder(stream);s.recorder=recorder;s.started=Date.now();
   recorder.ondataavailable=e=>{if(e.data?.size)s.chunks.push(e.data);};
   recorder.onerror=()=>{if(active===s){s.recordError=true;stop();}};
   recorder.onstop=()=>{
    release(s);if(s.cancelled||s.id!==sequence)return;
    if(active===s)active=null;controls(false);const interim=get('ops-voice-interim');if(interim)interim.textContent='';
    const blob=new Blob(s.chunks,{type:recorder.mimeType||s.chunks[0]?.type||'audio/webm'});
    if(!blob.size){status('未取得录音，请检查麦克风输入设备后重试。');return;}
    clipUrl=URL.createObjectURL(blob);const panel=get('ops-voice-playback');if(panel){panel.replaceChildren();const audio=document.createElement('audio');audio.controls=true;audio.src=clipUrl;audio.setAttribute('aria-label','本次录音回听');const link=document.createElement('a');link.className='btn';link.href=clipUrl;link.download='面见现场补充_'+Date.now()+(blob.type.includes('mp4')?'.m4a':'.webm');link.textContent='下载录音';const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.dataset.ops='voice-clear';remove.textContent='清除录音';panel.append(audio,link,remove);}
    status((s.recordError?'录音异常结束，已保留可用片段。':'录音已结束，可回听或下载。')+(s.words?'已转文字请核对，并点击“保存本店补充”。':'本次未生成文字，可用输入法语音补充；录音不会代替文字保存。'));
   };
   recorder.start(500);controls(true);note(s);s.timer=setInterval(()=>note(s),1000);s.limit=setTimeout(()=>{if(active===s)stop();},180000);startRecognition(s);
  }catch(e){if(active!==s){release(s);return;}active=null;release(s);controls(false);const messages={NotAllowedError:'麦克风未获授权，请点击地址栏麦克风图标允许此网站使用麦克风。',NotFoundError:'没有找到麦克风，请连接输入设备后重试。',NotReadableError:'麦克风不可用或被其他程序占用，请检查输入设备。',SecurityError:'浏览器限制了麦克风使用，请用Chrome或Edge打开工作台。'};status(messages[e.name]||'录音启动失败，请检查麦克风设备和浏览器权限后重试。');}
 }
 function stop(){const s=active;if(!s)return;s.stopping=true;clearInterval(s.timer);clearTimeout(s.limit);clearTimeout(s.recognitionTimer);controls(true,true);status('正在结束录音…');try{s.recognition?.stop();}catch{}if(s.recorder&&s.recorder.state!=='inactive')s.recorder.stop();else{release(s);active=null;controls(false);}}
 function clear(){if(active)return;if(clipUrl){URL.revokeObjectURL(clipUrl);clipUrl=null;}get('ops-voice-playback')?.replaceChildren();status('录音已清除，文字补充保留，可重新录音。');}
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-view-mode]'))reset();},true);
 document.addEventListener('change',event=>{if(['year-filter','month-filter','region-filter','store-filter'].includes(event.target.id))reset();});
 root.addEventListener('pagehide',reset);
 root.WBVoice={field,start,stop,clear,reset,get recording(){return !!active;}};
})(window);
