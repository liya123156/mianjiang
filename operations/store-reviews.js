/* In-workbench regional reviews. One period, one store, one shared report. */
(function(root){
 'use strict';
 const R=()=>root.WBStoreReviewModel,M=()=>root.WBModel;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone=v=>JSON.parse(JSON.stringify(v));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const state={actor:null,context:null,cache:new Map(),pending:new Map(),drafts:new Map(),selection:new Map(),open:new Set(),urls:[],imageBlobs:[],saving:new Set()};
 const fieldsDefault=()=>({periodGoal:null,actions:'',execution:'',highlights:'',blockers:'',nextGoal:null,nextActions:'',owner:'',due:''});
 const catalog=()=>M().storeCatalog.filter(x=>x.ownerApplicable!==false);
 const reviewKey=(period,store)=>`${period.periodType}:${period.periodStart}:${period.periodEnd}:${store}`;
 const draftKey=(month,period,store)=>month+'|'+reviewKey(period,store);
 const stamp=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'';
 function options(ctx){
  const type=state.selection.get(ctx.month)?.type||'weekly';
  if(type==='monthly')return [{periodType:'monthly',periodStart:ctx.month+'-01',periodEnd:new Date(Date.UTC(Number(ctx.month.slice(0,4)),Number(ctx.month.slice(5)),0)).toISOString().slice(0,10),label:ctx.month+' 全月'}];
  return R().periods(ctx.month);
 }
 function selectedPeriod(ctx){
  const list=options(ctx),s=state.selection.get(ctx.month)||{};
  let result=list.find(x=>x.periodStart===s.start);
  if(!result){const asOf=state.cache.get(ctx.month)?.businessData?.imports?.[0]?.as_of||ctx.asOf||ctx.month+'-01';result=list.find(x=>asOf>=x.periodStart&&asOf<=x.periodEnd)||list[0];}
  return result;
 }
 function cached(ctx){return state.cache.get(ctx.month)||{items:[],businessData:null};}
 function existing(ctx,period,store){return cached(ctx).items.find(x=>x.store===store&&x.payload?.periodType===period.periodType&&x.payload?.periodStart===period.periodStart&&x.payload?.periodEnd===period.periodEnd)||null;}
 function monthlyGoals(ctx,business){return business?.items?.find(x=>x.kind==='goals'&&x.payload?.recordType!=='public-quality'&&x.key.endsWith('|monthly'))?.payload||ctx.goals||{};}
 function currentSnapshot(ctx,period,store){
  const business=cached(ctx).businessData||ctx.publicData||{housing:[],meetings:[],imports:[],items:[]};
  const quality=business.items?.find(x=>x.kind==='goals'&&x.payload?.recordType==='public-quality')?.payload;
  const qualitySummary=quality?.groups?.find(x=>x.scope==='store'&&x.store===store.store);
  return R().makeSnapshot({...period,month:ctx.month,region:store.region,store:store.store,housing:business.housing||[],meetings:business.meetings||[],goals:monthlyGoals(ctx,business),asOf:business.imports?.[0]?.as_of||ctx.asOf||'',sourceVersion:business.imports?.[0]?.created_at||'',qualitySummary:period.periodType==='monthly'?qualitySummary:null});
 }
 function draft(ctx,period,store){
  const key=draftKey(ctx.month,period,store.store);let d=state.drafts.get(key);if(d)return d;
  const row=existing(ctx,period,store.store),prior=[...cached(ctx).items,...(cached(ctx).previousItems||[])].filter(x=>x.store===store.store&&x.payload?.status==='confirmed'&&x.payload?.periodType===period.periodType&&x.payload?.periodEnd<period.periodStart).sort((a,b)=>b.payload.periodEnd.localeCompare(a.payload.periodEnd))[0];
  const snapshot=row?.payload?.snapshot||currentSnapshot(ctx,period,store),fields={...fieldsDefault(),...row?.payload?.fields};
  let carried=false;
  if(!row){
   if(period.periodType==='monthly')fields.periodGoal=snapshot.monthly.target;
   if(prior){const next=R().suggestNext(prior.payload.snapshot);if(next.periodStart===period.periodStart&&next.periodEnd===period.periodEnd){fields.periodGoal=prior.payload.fields.nextGoal??fields.periodGoal;fields.actions=prior.payload.fields.nextActions||'';carried=fields.periodGoal!=null||!!fields.actions;}}
  }
  d={row,snapshot:clone(snapshot),fields,status:row?.payload?.status||'draft',dirty:false,carried};state.drafts.set(key,d);return d;
 }
 function note(ctx,text){ctx.notify?.(text);const target=ctx.host?.querySelector('[data-sr-notice]');if(target)target.textContent=text;}
 function check(ctx){return !!ctx.cloud.member;}
 function storedStatus(d){return d.dirty?'有未保存修改':!d.row?'待填写':d.status==='confirmed'?'已确认':'已保存草稿';}
 const textField=(name,label,value,placeholder)=>`<label class="sr-field">${label}<textarea name="${name}" rows="3" maxlength="6000" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
 function metricsHtml(s,d){const p=s.period,m=s.monthly,goal=d.fields.periodGoal,completed=goal>0?((p.met/goal)*100).toFixed(2)+'%':goal===0?'目标为0套':'待确认';return `<div class="sr-metrics"><div><span>本期面见套数</span><strong>${p.met??'待核实'}<small>套</small></strong></div><div><span>本期面见次数</span><strong>${p.meetingCount??'待核实'}<small>次</small></strong></div><div><span>本期目标完成率</span><strong data-sr-completion>${esc(completed)}</strong></div><div><span>月度目标／累计面见</span><strong>${m.target??'待确认'} / ${m.met}<small>套</small></strong></div></div><p class="sr-source">底表截至${esc(s.asOf||'待导入')}；月度累计按该截止日展示。本期按面见日期去重统计，重复面见次数另列。</p>${s.notes?.length?`<p class="sr-warning">${s.notes.map(esc).join('；')}</p>`:''}`;}
 function analysisHtml(d){return R().analyze(d.snapshot,d.fields.periodGoal).map(x=>`<p>${esc(x)}</p>`).join('');}
 function storeHtml(ctx,period,store){
  const d=draft(ctx,period,store),s=d.snapshot,next=R().suggestNext(s),key=draftKey(ctx.month,period,store.store),open=ctx.view?.store===store.store||state.open.has(key),disabled=check(ctx)&&cached(ctx).businessData&&!cached(ctx).loading?'':'disabled';
  const f=d.fields,monthly=period.periodType==='monthly',nextLabel=monthly?'下月':'下周';
  return `<details class="sr-store" data-review-store="${esc(store.store)}" ${open?'open':''}><summary><span><b>${esc(store.store)}</b><small>本期面见${s.period.met??'待核实'}套 · 月累计${s.monthly.met}套</small></span><em data-sr-status>${esc(storedStatus(d))}</em></summary><form class="sr-form" data-review-store="${esc(store.store)}"><div class="sr-report-title"><h3>${esc(store.store)} · ${monthly?'月':'周'}复盘</h3><p>${esc(period.periodStart)}—${esc(period.periodEnd)} · ${esc(store.region)}</p></div>${conflictHtml(d)}${metricsHtml(s,d)}<fieldset ${disabled}><legend>一、目标达成与数据分析</legend><label class="sr-inline">${monthly?'本月':'本周'}确认目标（套）<input name="periodGoal" type="number" min="0" max="10000" step="1" value="${f.periodGoal??''}" placeholder="未确认则留空"></label>${d.carried?'<p class="sr-source">已承接上期与店总确认的目标和举措，可按实际共识调整。</p>':''}<div class="sr-analysis" data-sr-analysis>${analysisHtml(d)}</div></fieldset><fieldset ${disabled}><legend>二、核心动作与执行情况</legend>${textField('actions','原定核心动作',f.actions,'重点推动哪些店组、准备解决什么问题？')}${textField('execution','实际执行与结果',f.execution,'BP做了什么、店总或经理如何承接、落实到了哪一步、出现了什么变化？')}</fieldset><fieldset ${disabled}><legend>三、有效做法与标杆分享</legend>${textField('highlights','具体场景、关键动作与实际变化',f.highlights,'写清谁在什么场景做了什么、结果如何，哪些做法值得借鉴。')}</fieldset><fieldset ${disabled}><legend>四、未到位事项与卡点分析</legend>${textField('blockers','未落实事项、原因和所需支持',f.blockers,'区分未执行、执行不到位、已执行但效果不足；写清核实后的原因和所需支持。')}</fieldset><fieldset ${disabled}><legend>五、${nextLabel}目标与核心举措</legend><div class="sr-plan-head"><p>${esc(next.periodStart||'')}—${esc(next.periodEnd||'')}</p><button class="btn" type="button" data-sr="suggest">生成${nextLabel}建议</button></div><label class="sr-inline">${nextLabel}目标（套，可调高或调低）<input name="nextGoal" type="number" min="0" max="10000" step="1" value="${f.nextGoal??''}" placeholder="生成建议后由BP确认"></label><p class="sr-source" data-sr-suggestion>建议结合月度剩余差距、可执行时间和本店卡点确认；生成建议不会自动保存。</p>${textField('nextActions',nextLabel+'核心举措',f.nextActions,'聚焦1—3项，写清重点店组、具体动作及如何复查。')}<div class="sr-plan-grid"><label>承接人<input name="owner" maxlength="100" value="${esc(f.owner)}" placeholder="BP／店总／经理"></label><label>复查日期<input name="due" type="date" value="${esc(f.due)}"></label></div><label class="sr-confirm"><input name="confirmed" type="checkbox" ${d.status==='confirmed'?'checked':''}>已与店总共识本期结论和${nextLabel}安排</label></fieldset><div class="sr-controls"><button type="submit" class="btn primary" ${disabled}>保存复盘</button><button type="button" class="btn" data-sr="image" ${disabled}>复制本店复盘图片</button>${d.row?'<button type="button" class="btn" data-sr="latest" '+disabled+'>更新本期底表数据</button>':''}<span data-sr-save-note>${d.row?esc('最近保存：'+(d.row.payload.updatedBy||'BP')+' · '+stamp(d.row.updated_at)):'填写后直接保存，其他BP可在这里查看和修改。'}</span></div></form></details>`;
 }
 function conflictHtml(d){const labels={periodGoal:'本期目标',actions:'核心动作',execution:'执行情况',highlights:'有效做法',blockers:'卡点',nextGoal:'下期目标',nextActions:'下期举措',owner:'承接人',due:'复查日期',status:'共识状态'};return Object.entries(d.conflicts||{}).length?`<div class="sr-warning"><p>其他BP也修改了以下内容。未冲突字段已合并，请逐项选择，再保存。</p>${Object.entries(d.conflicts).map(([field,value])=>`<div class="sr-conflict"><b>${labels[field]||field}</b><p>最新共享填写：${esc(value??'留空')}</p><button type="button" class="btn" data-sr="resolve" data-field="${field}" data-choice="remote">采用最新填写</button><button type="button" class="btn" data-sr="resolve" data-field="${field}" data-choice="local">保留我的填写</button></div>`).join('')}</div>`:'';}
 function mergeRemote(d,row){
  const base=d.row?.payload||{},remote=row.payload,conflicts={};
  for(const field of Object.keys(fieldsDefault())){const before=base.fields?.[field]??fieldsDefault()[field],local=d.fields[field],latest=remote.fields?.[field]??fieldsDefault()[field];if(equal(local,before))d.fields[field]=latest;else if(!equal(latest,before)&&!equal(local,latest))conflicts[field]=latest;}
  const before=base.status||'draft';if(d.status===before)d.status=remote.status;else if(remote.status!==before&&remote.status!==d.status)conflicts.status=remote.status;
  if(!equal(base.snapshot,remote.snapshot))d.snapshot=clone(remote.snapshot);
  d.row=row;d.conflicts=conflicts;
 }
 function reportData(d){return R().report({snapshot:d.snapshot,fields:d.fields,status:d.dirty?'draft':d.status,updatedBy:d.row?.payload?.updatedBy||'',updatedAt:d.row?.updated_at||''});}
 function synthesis(ctx,period,stores){
  const all=stores.map(store=>({store,d:draft(ctx,period,store)})),known=all.filter(x=>x.d.row?.payload?.status==='confirmed'&&!x.d.dirty),valid=all.filter(x=>x.d.snapshot.monthly.stock>0&&x.d.snapshot.period.pendingDateCount===0&&x.d.snapshot.asOf>=period.periodStart),versions=new Set(all.map(x=>x.d.snapshot.sourceVersion));
  let ranked='';
  if(valid.length===all.length&&valid.length>1&&versions.size===1){
   const score=x=>valid.filter(y=>y.d.snapshot.period.met>x.d.snapshot.period.met).length+valid.filter(y=>y.d.snapshot.period.met*x.d.snapshot.monthly.stock>x.d.snapshot.period.met*y.d.snapshot.monthly.stock).length;
   const scores=valid.map(score),low=Math.min(...scores),high=Math.max(...scores),bench=valid.filter((x,i)=>scores[i]===low&&x.d.snapshot.period.met>0),remind=valid.filter((x,i)=>scores[i]===high);
   const cards=(rows,label,field)=>rows.map(({store,d})=>`<article><span>${label}</span><h4>${esc(store.store)} · 本期面见${d.snapshot.period.met}套</h4><p>${field==='highlights'?'可借鉴做法':'改进与支持'}：${esc(d.fields[field]||'待BP补充并核实具体执行情况')}</p><p>下期安排：${esc(d.fields.nextActions||'待BP补充')}</p><small>${esc(storedStatus(d))}</small></article>`).join('');
   ranked=`<div class="sr-synthesis-list">${cards(bench,'标杆门店','highlights')}${cards(remind,'重点提醒门店','blockers')}</div><p class="sr-source">按本期已登记面见套数及相对当前在售基数的覆盖率等权综合，只展示首末并保留并列；执行原因以BP核实为准。</p>`;
  }else if(all.length>1)ranked='<p class="sr-source">各店数据截止版本或日期明细尚未对齐，暂不进行本期首末比较；可逐店核实后再提炼。</p>';
  return `<details class="sr-synthesis"><summary>本期复盘汇总 · 已确认${known.length}/${stores.length}店</summary>${ranked}${known.length?`<details><summary>查看各店已确认做法与改进安排</summary><div class="sr-synthesis-list">${known.map(({store,d})=>`<article><h4>${esc(store.store)} · 本期面见${d.snapshot.period.met??'待核实'}套</h4><p><b>有效做法：</b>${esc(d.fields.highlights||'待BP补充')}</p><p><b>改进与支持：</b>${esc(d.fields.blockers||'待BP补充')}</p><p><b>下期安排：</b>${esc(d.fields.nextActions||'待BP补充')}</p></article>`).join('')}</div></details>`:'<p>各店保存并确认复盘后，在这里汇总有效做法、卡点和下期安排。</p>'}</details>`;
 }

 function paint(ctx){
  if(!ctx.host.isConnected)return;const sel=state.selection.get(ctx.month)||{},period=selectedPeriod(ctx),list=options(ctx),cache=cached(ctx),regions=M().unique(catalog().map(s=>s.region)),stores=catalog().filter(x=>(!ctx.view?.region||x.region===ctx.view.region)&&(!ctx.view?.store||x.store===ctx.view.store));
  ctx.host.innerHTML=`<div class="sr-intro"><p>展开大区和单店，在报告中直接补充执行、做法与卡点；目标和数据分析自动带入。保存后共享，历史周期独立留存。</p><div class="sr-period-bar"><label>复盘类型<select data-sr-control="type" aria-label="大区复盘类型"><option value="weekly" ${sel.type!=='monthly'?'selected':''}>周复盘</option><option value="monthly" ${sel.type==='monthly'?'selected':''}>月复盘</option></select></label><label>复盘周期<select data-sr-control="period" aria-label="大区复盘周期">${list.map(p=>`<option value="${p.periodStart}" ${p.periodStart===period.periodStart?'selected':''}>${esc(p.label||p.periodStart+'—'+p.periodEnd)}</option>`).join('')}</select></label><button class="btn" type="button" data-sr="reload">刷新已保存复盘</button></div><p data-sr-notice class="sr-status" role="status">${esc(cache.error||(!check(ctx)?'进入BP／管理入口后，可查看、填写和共享各店复盘。':cache.loading?'正在读取共享复盘…':'按原始底表自动计算；原因与执行结论由BP核实。'))}</p>${!check(ctx)?'<button class="btn primary" data-ops="login">BP／管理入口</button>':''}</div><div data-sr-synthesis>${synthesis(ctx,period,stores)}</div><div class="sr-regions">${regions.map(region=>{const ss=stores.filter(x=>x.region===region);if(!ss.length)return '';const opened=ctx.view?.region===region||state.open.has(ctx.month+'|'+region);return `<details class="sr-region" data-review-region="${esc(region)}" ${opened?'open':''}><summary><span>${esc(region)}</span><small>${ss.length}家门店 · 直接填写与复制报告</small></summary><div class="sr-region-content">${ss.map(s=>storeHtml(ctx,period,s)).join('')}</div></details>`;}).join('')}</div>`;
 }
 function readForm(form,ctx){const store=catalog().find(s=>s.store===form.dataset.reviewStore),period=selectedPeriod(ctx),d=draft(ctx,period,store);for(const name of Object.keys(fieldsDefault())){const el=form.elements[name];if(!el)continue;d.fields[name]=['periodGoal','nextGoal'].includes(name)?el.value===''?null:Number(el.value):el.value;}d.status=form.elements.confirmed.checked?'confirmed':'draft';return {store,period,d};}
 function dirty(form,ctx){const {d}=readForm(form,ctx);d.dirty=true;const status=form.closest('details').querySelector('[data-sr-status]');if(status)status.textContent=storedStatus(d);if(form.querySelector('[data-sr-analysis]'))form.querySelector('[data-sr-analysis]').innerHTML=analysisHtml(d);const complete=form.querySelector('[data-sr-completion]');if(complete)complete.textContent=d.fields.periodGoal>0?((d.snapshot.period.met/d.fields.periodGoal)*100).toFixed(2)+'%':d.fields.periodGoal===0?'目标为0套':'待确认';}
 async function load(ctx,force=false){
  if(!check(ctx))return;if(state.pending.has(ctx.month))return state.pending.get(ctx.month);
  if(state.cache.has(ctx.month)&&!force)return;
  const actor=state.actor;const previous=cached(ctx);state.cache.set(ctx.month,{...previous,loading:true});
  const p=(async()=>{try{const loaded=await ctx.cloud.storeReview('load',{month:ctx.month});if(state.actor!==actor)return;state.cache.set(ctx.month,{...loaded,loading:false,error:''});for(const [key,d] of state.drafts)if(key.startsWith(ctx.month+'|')){if(!d.dirty)state.drafts.delete(key);else{const row=(loaded.items||[]).find(x=>x.key===d.row?.key||(!d.row&&x.store===d.snapshot.store&&x.payload?.periodType===d.snapshot.periodType&&x.payload?.periodStart===d.snapshot.periodStart&&x.payload?.periodEnd===d.snapshot.periodEnd));if(row&&row.updated_at!==d.row?.updated_at)mergeRemote(d,row);else if(!row&&!d.row){const store=catalog().find(s=>s.store===d.snapshot.store);d.snapshot=currentSnapshot(ctx,d.snapshot,store);}}}}catch(e){if(state.actor===actor)state.cache.set(ctx.month,{...previous,loading:false,error:e.message});}finally{state.pending.delete(ctx.month);if(state.context===ctx)paint(ctx);}})();state.pending.set(ctx.month,p);return p;
 }
 async function save(form,ctx){
  if(!form.reportValidity())return;const {store,period,d}=readForm(form,ctx),key=draftKey(ctx.month,period,store.store);if(state.saving.has(key))return;if(!check(ctx))throw Error('请先进入BP／管理入口');if(!cached(ctx).businessData)throw Error('共享数据尚未读取完成，请稍后保存');if(Object.keys(d.conflicts||{}).length)throw Error('请先处理上方同时修改的内容，再保存复盘');
  for(const name of ['periodGoal','nextGoal'])if(d.fields[name]!=null&&(!Number.isInteger(d.fields[name])||d.fields[name]<0||d.fields[name]>10000))throw Error('目标须为0—10000的整数，未确认可留空');
  const button=form.querySelector('[type="submit"]');state.saving.add(key);button.disabled=true;const sent=JSON.stringify({fields:d.fields,status:d.status,snapshot:d.snapshot});
  try{const row=await ctx.cloud.storeReview('save',{month:ctx.month,periodType:period.periodType,periodStart:period.periodStart,periodEnd:period.periodEnd,region:store.region,store:store.store,payload:JSON.parse(sent),expectedUpdatedAt:d.row?.updated_at||null});const c=cached(ctx);c.items=[...c.items.filter(x=>x.key!==row.key),row];d.row=row;d.dirty=sent!==JSON.stringify({fields:d.fields,status:d.status,snapshot:d.snapshot});const report=form.closest('details');report.querySelector('[data-sr-status]').textContent=storedStatus(d);form.querySelector('[data-sr-save-note]').textContent=`已共享保存 · ${row.payload.updatedBy||'BP'} · ${stamp(row.updated_at)}`;const summary=ctx.host.querySelector('[data-sr-synthesis]');if(summary)summary.innerHTML=synthesis(ctx,period,catalog().filter(s=>(!ctx.view?.region||s.region===ctx.view.region)&&(!ctx.view?.store||s.store===ctx.view.store)));note(ctx,d.dirty?'已保存提交时的版本；仍有后续修改待保存。':'已保存本店复盘，其他BP可在本模块查看和修改。');}
  catch(e){note(ctx,/其他|更新|冲突/.test(e.message)?e.message+'。当前填写已保留，请先复制报告，刷新后合并修改。':e.message);}
  finally{state.saving.delete(key);if(button.isConnected)button.disabled=false;}
 }
 async function image(form,ctx){const {d}=readForm(form,ctx),button=form.querySelector('[data-sr="image"]');button.disabled=true;try{const blobs=await R().images(reportData(d));if(blobs.length===1&&navigator.clipboard?.write&&root.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blobs[0]})]);note(ctx,'本店完整复盘图片已复制，可直接粘贴到微信。');return;}catch{}}showImages(blobs,d,ctx);}finally{if(button.isConnected)button.disabled=false;}}
 function showImages(blobs,d,ctx){for(const url of state.urls)URL.revokeObjectURL(url);state.imageBlobs=blobs;state.urls=blobs.map(b=>URL.createObjectURL(b));let dialog=document.getElementById('store-review-image-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='store-review-image-dialog';dialog.className='ops-dialog sr-image-dialog';document.body.append(dialog);}dialog.innerHTML=`<button type="button" class="btn" data-sr="close-image">关闭</button><h2>${esc(d.snapshot.store)} · 复盘图片</h2><p>${blobs.length>1?'完整报告已分为'+blobs.length+'页，全部内容保留。':'图片已生成，可复制或下载。'}</p>${state.urls.map((url,i)=>`<div class="sr-image-page"><button type="button" class="btn" data-sr="copy-page" data-page="${i}">复制第${i+1}页</button><a class="btn primary" href="${url}" download="${esc(d.snapshot.store+'_'+d.snapshot.periodStart+'_复盘_'+(i+1)+'.png')}">下载第${i+1}页</a><img src="${url}" alt="${esc(d.snapshot.store)}复盘第${i+1}页"></div>`).join('')}`;dialog.showModal();note(ctx,'复盘图片已生成。');}
 function text(){const ctx=state.context;if(!ctx)return '';const period=selectedPeriod(ctx),stores=catalog().filter(s=>(!ctx.view?.region||s.region===ctx.view.region)&&(!ctx.view?.store||s.store===ctx.view.store));return `大区${period.periodType==='monthly'?'月':'周'}复盘｜${period.periodStart}—${period.periodEnd}\n\n`+stores.map(s=>{const report=reportData(draft(ctx,period,s));return [report.title,report.subtitle,...report.sections.flatMap(x=>[x.title,...x.lines])].join('\n');}).join('\n\n');}
 function mount(ctx){
  if(!ctx.host)return;const actor=ctx.cloud.member?.login_id||ctx.cloud.member?.display_name||'guest';if(state.actor!==actor){state.actor=actor;state.cache.clear();state.pending.clear();state.drafts.clear();state.open.clear();}
  state.context=ctx;paint(ctx);const cachedVersion=cached(ctx).businessData?.imports?.[0]?.created_at;load(ctx,Boolean(cachedVersion&&ctx.sourceVersion&&cachedVersion!==ctx.sourceVersion));
 }
 document.addEventListener('toggle',e=>{const el=e.target,ctx=state.context;if(!ctx||!(el instanceof HTMLElement))return;const key=el.dataset.reviewRegion?ctx.month+'|'+el.dataset.reviewRegion:el.dataset.reviewStore?draftKey(ctx.month,selectedPeriod(ctx),el.dataset.reviewStore):null;if(key)el.open?state.open.add(key):state.open.delete(key);},true);
 document.addEventListener('input',e=>{const ctx=state.context,form=e.target.closest('.sr-form');if(ctx&&form)dirty(form,ctx);});
 document.addEventListener('change',e=>{const ctx=state.context;if(!ctx)return;const control=e.target.dataset.srControl;if(control){const old=state.selection.get(ctx.month)||{};state.selection.set(ctx.month,control==='type'?{type:e.target.value,start:null}:{...old,start:e.target.value});paint(ctx);}else if(e.target.closest('.sr-form'))dirty(e.target.closest('.sr-form'),ctx);});
 document.addEventListener('submit',e=>{if(!e.target.matches('.sr-form'))return;e.preventDefault();const ctx=state.context;if(ctx)save(e.target,ctx).catch(err=>note(ctx,err.message));});
 document.addEventListener('click',async e=>{const button=e.target.closest('[data-sr]'),ctx=state.context;if(!button||!ctx)return;const action=button.dataset.sr,form=button.closest('.sr-form');try{
  if(action==='reload'){await load(ctx,true);note(ctx,'已刷新已保存复盘；当前未保存填写继续保留。');return;}
  if(action==='close-image'){document.getElementById('store-review-image-dialog').close();return;}
  if(action==='copy-page'){const blob=state.imageBlobs[Number(button.dataset.page)];await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);note(ctx,'该页复盘图片已复制。');return;}
  if(!form)return;const {d}=readForm(form,ctx);
  if(action==='resolve'){const field=button.dataset.field;if(button.dataset.choice==='remote'){if(field==='status')d.status=d.conflicts[field];else d.fields[field]=d.conflicts[field];}delete d.conflicts[field];d.dirty=true;paint(ctx);return;}
  if(action==='suggest'){const next=R().suggestNext(d.snapshot);form.elements.nextGoal.value=next.goal??'';const userText=form.elements.nextActions.value.trim();if(!userText)form.elements.nextActions.value=next.actions||'';form.querySelector('[data-sr-suggestion]').textContent=next.explanation+(userText?' 已保留BP填写的举措，请结合建议自行调整。':'');dirty(form,ctx);return;}
  if(action==='latest'){const {store,period}=readForm(form,ctx);await load(ctx,true);if(cached(ctx).error)throw Error(cached(ctx).error);const latest=draft(ctx,period,store);latest.snapshot=currentSnapshot(ctx,period,store);latest.dirty=true;paint(ctx);note(ctx,'已带入最新底表；填写内容保留，点击保存后才更新共享报告。');return;}
  if(action==='image')await image(form,ctx);
 }catch(err){note(ctx,err.message||'操作暂未完成，请重试');}});
 root.addEventListener?.('beforeunload',e=>{if([...state.drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
 root.WBStoreReviews={mount,text,state,selectedPeriod};
})(window);
