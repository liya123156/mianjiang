/* Mocked recognition lifecycle only. Never records audio or requests microphone access. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../operations/review-voice.js',import.meta.url),'utf8');
function environment({supported=true,secure=true,webkit=false}={}){
 let seq=0;const timers=new Map(),listeners=new Map(),rootListeners=new Map(),instances=[],observers=[];
 class Recognition{constructor(){instances.push(this);this.started=0;this.stopped=0;this.aborted=0;}start(){this.started++;if(this.throwStart)throw Error('start');}stop(){this.stopped++;if(this.throwStop)throw Error('stop');}abort(){this.aborted++;}}
 class MutationObserver{constructor(fn){this.fn=fn;observers.push(this);}observe(){this.observing=true;}disconnect(){this.observing=false;}}
 const document={documentElement:{},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
 const x={document,console,isSecureContext:secure,MutationObserver,Event:class{constructor(type,options){this.type=type;this.bubbles=options?.bubbles;}},setTimeout(fn,delay){const id=++seq;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){rootListeners.set(type,fn);}};
 if(supported)x[webkit?'webkitSpeechRecognition':'SpeechRecognition']=Recognition;x.window=x;
 vm.createContext(x);vm.runInContext(source,x);
 const runTimer=delay=>{const timer=[...timers].find(([,v])=>v.delay===delay);assert.ok(timer,'timer '+delay+' exists');timers.delete(timer[0]);timer[1].fn();};
 return {voice:x.WBReviewVoice,x,instances,timers,observers,runTimer,fire(type,event){for(const fn of listeners.get(type)||[])fn(event);},pagehide(){rootListeners.get('pagehide')();}};
}
function area(value=''){return {value,readOnly:false,disabled:false,isConnected:true,scrollTop:0,scrollHeight:31,events:[],focus(){this.focused=true;},dispatchEvent(e){this.events.push(e);}};}
function callbacks(a){const statuses=[],changes=[],ends=[];return {options:{area:a,onStatus:(message,meta)=>statuses.push({message,...meta}),onChange:(text,meta)=>changes.push({text,...meta}),onEnd:e=>ends.push(e)},statuses,changes,ends};}
const results=(...parts)=>parts.map(([transcript,isFinal=false])=>Object.assign([{transcript}],{isFinal}));

// Unsupported or insecure browsers explain the free input-method fallback.
for(const settings of [{supported:false},{secure:false}]){const e=environment(settings),a=area('原有内容'),c=callbacks(a);assert.equal(e.voice.start(c.options),false);assert.equal(a.value,'原有内容');assert.equal(a.readOnly,false);assert.match(c.statuses.at(-1).message,/Win\+H/);assert.equal(e.instances.length,0);assert.equal(e.voice.recording,false);assert.equal(c.ends.length,1);}
{
 const e=environment({webkit:true}),a=area('原有内容'),c=callbacks(a);assert.equal(e.voice.start(c.options),true);const r=e.instances[0];assert.equal(r.lang,'zh-CN');assert.equal(r.continuous,true);assert.equal(r.interimResults,true);assert.equal(a.readOnly,true);assert.equal(e.voice.activeArea,a);
 r.onstart();assert.ok(![...e.timers.values()].some(t=>t.delay===15000));assert.equal(c.statuses.at(-1).state,'listening');
 r.onresult({results:results(['今天',true],['联系了',false])});assert.equal(a.value,'原有内容\n今天联系了');
 r.onresult({results:results(['今天',true],['联系了经理',false])});assert.equal(a.value,'原有内容\n今天联系了经理','revised interim segment replaces previous interim');
 r.onresult({results:results(['今天',true],['联系了经理',true],['，确定邀约。',false])});assert.equal(a.value,'原有内容\n今天联系了经理，确定邀约。','final and interim segments appear once');assert.equal(a.events.length,3);assert.ok(a.events.every(x=>x.type==='input'&&x.bubbles));assert.equal(c.changes.length,3);assert.equal(a.scrollTop,31);
 e.voice.stop();assert.equal(r.stopped,1);assert.equal(c.statuses.at(-1).state,'stopping');assert.equal(e.voice.recording,true);r.onend();assert.equal(a.readOnly,false);assert.equal(e.voice.recording,false);assert.equal(e.voice.activeArea,null);assert.equal(c.ends.length,1);assert.equal(c.ends[0].text,a.value);assert.equal(e.timers.size,0);assert.equal(e.observers[0].observing,false);
}

// Switching textareas aborts the previous recognizer; late callbacks cannot write.
{
 const e=environment(),a=area('A'),b=area('B'),ca=callbacks(a),cb=callbacks(b);e.voice.start(ca.options);const first=e.instances[0],lateResult=first.onresult,lateEnd=first.onend;e.voice.start(cb.options);assert.equal(first.aborted,1);assert.equal(a.readOnly,false);assert.equal(b.readOnly,true);assert.equal(ca.ends[0].reason,'field-change');lateResult({results:results(['迟到结果',true])});lateEnd();assert.equal(a.value,'A');assert.equal(b.value,'B');assert.equal(e.voice.activeArea,b);assert.equal(e.voice.start(cb.options),true);assert.equal(e.instances.length,2,'same active textarea does not start another session');e.voice.reset();assert.equal(b.readOnly,false);assert.equal(e.voice.recording,false);
}

// Failed services, connect timeout, stop fallback and duration limits restore editing.
{
 const e=environment(),a=area('原文'),c=callbacks(a);e.voice.start(c.options);e.runTimer(15000);assert.equal(a.readOnly,false);assert.equal(a.value,'原文');assert.match(c.statuses.at(-1).message,/超时.*Win\+H/);assert.equal(c.ends[0].reason,'timeout');assert.equal(e.instances[0].aborted,1);
}
for(const error of ['network','not-allowed','no-speech','audio-capture','language-not-supported']){const e=environment(),a=area('原文'),c=callbacks(a);e.voice.start(c.options);e.instances[0].onresult({results:results(['已转文字',true])});e.instances[0].onerror({error});assert.equal(a.value,'原文\n已转文字');assert.equal(a.readOnly,false);assert.equal(e.voice.recording,false);assert.match(c.statuses.at(-1).message,/Win\+H/);assert.equal(c.ends[0].reason,'error:'+error);}
{
 const e=environment(),a=area(),c=callbacks(a);e.voice.start(c.options);e.runTimer(180000);assert.equal(e.instances[0].stopped,1);assert.match(c.statuses.at(-1).message,/3分钟/);e.runTimer(3000);assert.equal(e.voice.recording,false);assert.equal(a.readOnly,false);assert.equal(c.ends[0].reason,'time-limit');assert.equal(e.instances[0].aborted,1);
}

// Scope changes, disconnected render targets, collapsed sections and page exit stop dictation.
for(const id of ['year-filter','month-filter','region-filter','store-filter']){const e=environment(),a=area();e.voice.start({area:a});e.fire('change',{target:{id}});assert.equal(e.voice.recording,false);assert.equal(a.readOnly,false);}
for(const srControl of ['type','period']){const e=environment(),a=area();e.voice.start({area:a});e.fire('change',{target:{dataset:{srControl}}});assert.equal(e.voice.recording,false);}
{
 const e=environment(),a=area(),c=callbacks(a);e.voice.start(c.options);a.isConnected=false;e.observers[0].fn();assert.equal(c.ends[0].reason,'detached');assert.equal(a.readOnly,false);
}
{
 const e=environment(),a=area(),c=callbacks(a);e.voice.start(c.options);a.isConnected=false;e.instances[0].onresult({results:results(['不应写入',true])});assert.equal(a.value,'');assert.equal(c.ends[0].reason,'detached');
}
{
 const e=environment(),a=area(),c=callbacks(a);e.voice.start(c.options);e.fire('toggle',{target:{tagName:'DETAILS',open:false,contains:node=>node===a}});assert.equal(c.ends[0].reason,'section-closed');
}
{
 const e=environment(),a=area();e.voice.start({area:a});e.fire('click',{target:{closest:selector=>selector==='[data-view-mode]'?{}:null}});assert.equal(e.voice.recording,false);e.voice.start({area:a});e.pagehide();assert.equal(e.voice.recording,false);
}

// External text changes are preserved; disabled/read-only fields never start recognition.
{
 const e=environment(),a=area('原始'),c=callbacks(a);e.voice.start(c.options);a.value='外部更新';e.instances[0].onresult({results:results(['迟到识别',true])});assert.equal(a.value,'外部更新');assert.equal(c.ends[0].reason,'content-change');assert.equal(a.readOnly,false);
}
for(const property of ['readOnly','disabled']){const e=environment(),a=area();a[property]=true;assert.equal(e.voice.start({area:a}),false);assert.equal(e.instances.length,0);assert.equal(a[property],true);}
assert.ok(!/requestSubmit|\.submit\(|fetch\(/.test(source),'voice controller never saves, submits or uploads a report');
console.log('PASS: mocked dictation lifecycle, interim replacement, original text preservation, field switching, late-event guards, failures, timers, scope changes and no auto-submit. Real audio and microphone access were not tested.');
