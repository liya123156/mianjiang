/* Shared company weekly planning in the existing workbench. */
(function(root){
 'use strict';
 const M=()=>root.WBModel,R=()=>root.WBStoreReviewModel;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clone=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),dayMs=86400000;
 const state={actor:null,ctx:null,cache:new Map(),pending:new Map(),drafts:new Map(),selection:new Map(),sourceHints:new Map(),generation:0,ai:null};
 const chinaToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const shift=(day,n)=>new Date(new Date(day+'T00:00:00Z').valueOf()+n*dayMs).toISOString().slice(0,10);
 function monthEnd(month){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('计划月份不正确');return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);}
 const count=v=>v!==null&&v!==undefined&&v!==''&&Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null;
 function periods(month){return R().periods(month).map(p=>({periodStart:p.periodStart,periodEnd:p.periodEnd,label:p.label}));}
 function defaultPeriod(month,today=chinaToday()){
  const list=periods(month),date=R().isoDate(today)||month+'-01';
  return list.find(p=>date>=p.periodStart&&date<=p.periodEnd)||(date<month+'-01'?list[0]:list.at(-1));
 }
 const key=(month,p)=>month+'|'+p.periodStart+'|'+p.periodEnd;
 const sourceVersion=business=>String(business?.imports?.[0]?.created_at||'');
 const privateReader=ctx=>ctx.cloud.project===true&&!!ctx.cloud.member;
 const currentCache=ctx=>state.cache.get(ctx.month)||{items:[],businessData:ctx.businessData||null,regionalReviews:ctx.regionalReviews||[],loaded:false};
 const period=ctx=>periods(ctx.month).find(p=>p.periodStart===state.selection.get(ctx.month))||defaultPeriod(ctx.month,ctx.today||chinaToday());
 function ownerHousing(business){const owners=new Set(M().storeCatalog.filter(s=>s.ownerApplicable!==false).map(s=>s.store));return (business?.housing||[]).filter(h=>owners.has(M().canonicalStore(h['门店'])));}
 function publicBusinessData(business){
  if(!business)return null;const catalog=M().storeCatalog.filter(s=>s.ownerApplicable!==false),known=new Map(catalog.map(s=>[s.store,s]));
  const housing=(business.housing||[]).flatMap(h=>{const store=M().canonicalStore(h['门店']),entry=known.get(store);return entry?[{'大区':entry.region,'门店':store,'细分在售户数':h['细分在售户数']??h['在售户数'],'本月是否面见':h['本月是否面见']}]:[];});
  const items=(business.items||[]).filter(row=>row.kind==='goals'&&row.key?.endsWith('|monthly')&&row.payload?.recordType!=='public-quality').map(row=>({kind:'goals',key:row.key,updated_at:row.updated_at,payload:Object.fromEntries(catalog.map(s=>[s.store,count(row.payload?.[s.store])]))}));
  return {housing,meetings:[],items,imports:(business.imports||[]).map(row=>({as_of:row.as_of,created_at:row.created_at}))};
 }
 function goalMap(business){return [...(business?.items||[])].filter(x=>x.kind==='goals'&&x.payload?.recordType!=='public-quality'&&x.key?.endsWith('|monthly')).sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0]?.payload||{};}
 function allocationBasis(business){
  const goals=goalMap(business),housing=ownerHousing(business);return M().storeCatalog.filter(s=>s.ownerApplicable!==false).map(s=>({region:s.region,store:s.store,monthlyTarget:count(goals[s.store]),monthlyMet:M().metrics(M().inScope(housing,{region:s.region,store:s.store}),business?.meetings||[]).met}));
 }
 // Largest-remainder allocation uses integer gaps. It never rewrites source rows,
 // invents a missing monthly goal, or assigns more than a store's remaining gap.
 function allocateTargets(rows,totalTarget){
  const requestedTarget=count(totalTarget);if(requestedTarget===null)throw Error('周目标须为非负整数');if(!Array.isArray(rows)||!rows.length)throw Error('门店目标分解基数尚未完整');
  const seen=new Set(),stores=rows.map((row,index)=>{const monthlyTarget=count(row.monthlyTarget),monthlyMet=count(row.monthlyMet),store=String(row.store||''),region=String(row.region||'');if(!store||!region||seen.has(store)||monthlyTarget===null||monthlyMet===null)throw Error('门店月目标或面见数据不完整，请先刷新目标与底表');seen.add(store);return {region,store,monthlyTarget,monthlyMet,remainingGap:Math.max(0,monthlyTarget-monthlyMet),weeklyTarget:0,index};});
  const totalRemainingGap=stores.reduce((n,s)=>n+s.remainingGap,0),allocatedTarget=Math.min(requestedTarget,totalRemainingGap);
  if(totalRemainingGap>0){for(const s of stores){const numerator=allocatedTarget*s.remainingGap;s.weeklyTarget=Math.floor(numerator/totalRemainingGap);s.remainder=numerator%totalRemainingGap;}let remaining=allocatedTarget-stores.reduce((n,s)=>n+s.weeklyTarget,0);for(const s of [...stores].sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){if(!remaining)break;if(s.weeklyTarget<s.remainingGap){s.weeklyTarget++;remaining--;}}}
  const regions=[];for(const s of stores){let region=regions.find(r=>r.region===s.region);if(!region){region={region:s.region,monthlyTarget:0,monthlyMet:0,remainingGap:0,weeklyTarget:0};regions.push(region);}for(const field of ['monthlyTarget','monthlyMet','remainingGap','weeklyTarget'])region[field]+=s[field];delete s.index;delete s.remainder;}
  return {requestedTarget,allocatedTarget,unallocatedTarget:requestedTarget-allocatedTarget,totalRemainingGap,stores,regions};
 }
 function allocate(business,totalTarget){return allocateTargets(allocationBasis(business),totalTarget);}
 function allocationPayload(plan){return {version:1,stores:plan.stores.map(s=>({region:s.region,store:s.store,monthlyTarget:s.monthlyTarget,monthlyMet:s.monthlyMet,remainingGap:s.remainingGap,weeklyTarget:s.weeklyTarget}))};}
 function summarizeAllocation(stores,totalTarget){
  const regions=[];for(const s of stores){let region=regions.find(r=>r.region===s.region);if(!region){region={region:s.region,monthlyTarget:0,monthlyMet:0,remainingGap:0,weeklyTarget:0};regions.push(region);}for(const field of ['monthlyTarget','monthlyMet','remainingGap','weeklyTarget'])region[field]+=s[field];}
  return {requestedTarget:totalTarget,allocatedTarget:totalTarget,unallocatedTarget:0,totalRemainingGap:stores.reduce((n,s)=>n+s.remainingGap,0),stores,regions};
 }
 function validateAllocation(value,totalTarget,calculation){
  const keys=(object,expected)=>!!object&&typeof object==='object'&&!Array.isArray(object)&&equal(Object.keys(object).sort(),[...expected].sort()),integer=(value,max=10000000)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max;
  if(!keys(value,['version','stores'])||value.version!==1||!Array.isArray(value.stores)||!integer(totalTarget,10000))return null;
  const catalog=M().storeCatalog.filter(s=>s.ownerApplicable!==false),known=new Map(catalog.map(s=>[s.store,s])),found=new Map();if(value.stores.length!==catalog.length)return null;
  for(const row of value.stores){if(!keys(row,['region','store','monthlyTarget','monthlyMet','remainingGap','weeklyTarget']))return null;const entry=known.get(row.store);if(!entry||row.region!==entry.region||found.has(row.store)||!integer(row.monthlyTarget,10000)||!integer(row.monthlyMet)||!integer(row.remainingGap)||!integer(row.weeklyTarget,10000)||row.remainingGap!==Math.max(0,row.monthlyTarget-row.monthlyMet)||row.weeklyTarget>row.remainingGap)return null;found.set(row.store,{...row});}
  const stores=catalog.map(s=>found.get(s.store));if(stores.reduce((n,s)=>n+s.weeklyTarget,0)!==totalTarget)return null;
  if(calculation&&(stores.reduce((n,s)=>n+s.monthlyTarget,0)!==calculation.monthlyTarget||stores.reduce((n,s)=>n+s.monthlyMet,0)!==calculation.monthlyMet))return null;
  return summarizeAllocation(stores,totalTarget);
 }
 function parseAllocation(strategyText,totalTarget){
  const catalog=M().storeCatalog.filter(s=>s.ownerApplicable!==false),known=new Map(catalog.map(s=>[s.store,s])),found=[];
  for(const line of String(strategyText||'').split(/\r?\n/)){const match=line.trim().match(/^([^：]+)：本周(\d+)套｜月目标(\d+)套｜已面见(\d+)套｜月余(\d+)套$/);if(!match)continue;const [,store,weekly,monthly,met,gap]=match,entry=known.get(store);if(!entry)return null;found.push({region:entry.region,store,weeklyTarget:Number(weekly),monthlyTarget:Number(monthly),monthlyMet:Number(met),remainingGap:Number(gap)});}
  const target=totalTarget===undefined?found.reduce((n,s)=>n+s.weeklyTarget,0):totalTarget;return validateAllocation({version:1,stores:found},target);
 }
 function stripAllocationBlocks(strategyText){
  const lines=String(strategyText||'').split(/\r?\n/),out=[];let skip=false;
  const allocationHeading=/^(?:[一二三四五六七八九十\d]+[、.．]\s*)?(?:五大区承接|本周目标分解|18家门店(?:周)?目标分解)/,sectionHeading=/^(?:[一二三四五六七八九十]+[、.．]|\d+[、.．])/,storeLine=/^[^：]+：本周\d+套｜月目标\d+套｜已面见\d+套｜月余\d+套$/;
  for(const line of lines){const clean=line.trim();if(allocationHeading.test(clean)){skip=true;continue;}if(skip&&sectionHeading.test(clean))skip=false;if(skip||storeLine.test(clean))continue;out.push(line);}
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
 }
 function hydrate(payload){
  const legacy=parseAllocation(payload.strategyText,payload.target),migrated=legacy&&validateAllocation(allocationPayload(legacy),payload.target,payload.calculation),allocation=Object.hasOwn(payload,'allocation')?clone(payload.allocation):migrated?allocationPayload(migrated):null;
  return {allocation,strategyText:migrated||validateAllocation(allocation,payload.target,payload.calculation)?stripAllocationBlocks(payload.strategyText):String(payload.strategyText||'')};
 }
 function suggestedAllocation(business,target,calculation){try{const plan=allocate(business,target),payload=allocationPayload(plan);return validateAllocation(payload,target,calculation)?payload:null;}catch{return null;}}
 function allocationForDraft(ctx,d){
  const plan=validateAllocation(d.allocation,d.target,d.calculation);if(plan)return {plan,frozen:true};
  try{return {plan:allocate(currentCache(ctx).businessData,d.target),frozen:false};}catch{return null;}
 }
 function updateTarget(ctx,d,target){
  if(target!==d.target&&count(target)!==null){const allocationTarget=d.allocation?.stores?.reduce((n,s)=>n+s.weeklyTarget,0),previous=validateAllocation(d.allocation,allocationTarget,d.calculation);if(previous){const next=allocateTargets(previous.stores,target),payload=allocationPayload(next);d.allocation=validateAllocation(payload,target,d.calculation)?payload:null;}else d.allocation=suggestedAllocation(currentCache(ctx).businessData,target,d.calculation);}
  d.target=target;
 }
 function allocationHtml(ctx,d,report=false){
  const frozenPlan=report?validateAllocation(d.allocation,d.target,d.calculation):null,prepared=report?(frozenPlan?{plan:frozenPlan,frozen:true}:null):allocationForDraft(ctx,d);if(!prepared)return '<p class="cwp-source">'+(report?'该计划未保存门店目标分解。':'周目标或门店数据尚未完整，暂不展示目标分解。')+'</p>';const {plan,frozen}=prepared;
  const table=(rows,field,label)=>'<div class="table-wrap"><table aria-label="'+label+'"><thead><tr><th>'+field+'</th><th>月度目标</th><th>累计面见</th><th>月度剩余差距</th><th>本周目标</th></tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+esc(field==='大区'?r.region:r.store)+'</th><td>'+r.monthlyTarget+'套</td><td>'+r.monthlyMet+'套</td><td>'+r.remainingGap+'套</td><td><strong>'+r.weeklyTarget+'套</strong></td></tr>').join('')+'<tr><th scope="row">全司合计</th><td>'+rows.reduce((n,r)=>n+r.monthlyTarget,0)+'套</td><td>'+rows.reduce((n,r)=>n+r.monthlyMet,0)+'套</td><td>'+plan.totalRemainingGap+'套</td><td><strong>'+plan.allocatedTarget+'套</strong></td></tr></tbody></table></div>';
  return '<h4>本周目标分解 · 全司'+plan.allocatedTarget+'套</h4><p class="cwp-source">'+(frozen?'分解依据：本周计划固定分解。':'分解依据：最新底表建议，按月度剩余差距比例以最大余数法取整。')+(report?'大区目标由门店汇总，按本周已保存目标呈现。':'大区目标由门店汇总。单店复盘目标仍由BP调整确认。')+'</p>'+(plan.unallocatedTarget?'<p class="cwp-warning">本周计划目标高于门店剩余差距，最多可分配'+plan.allocatedTarget+'套，另有'+plan.unallocatedTarget+'套待项目负责人调整确认。</p>':'')+table(plan.regions,'大区','五大区周目标分解')+'<details'+(report?' open':'')+'><summary>查看18家门店周目标分解</summary>'+table(plan.stores,'门店','18家门店周目标分解')+'</details>';
 }
 function calculate(business,p){
  const owners=M().storeCatalog.filter(s=>s.ownerApplicable!==false),goals=goalMap(business),allKnown=owners.every(s=>count(goals[s.store])!==null),monthlyTarget=allKnown?owners.reduce((n,s)=>n+count(goals[s.store]),0):null;
  const housing=ownerHousing(business),monthlyMet=M().metrics(housing,business?.meetings||[]).met,asOf=R().isoDate(business?.imports?.[0]?.as_of),sourceVersion=String(business?.imports?.[0]?.created_at||''),month=p.periodStart.slice(0,7),last=monthEnd(month),sameMonth=!!asOf&&asOf.slice(0,7)===month;
  const remainingGap=monthlyTarget===null?null:Math.max(0,monthlyTarget-monthlyMet),remainingDays=sameMonth?Math.max(0,(new Date(last+'T00:00:00Z')-new Date(asOf+'T00:00:00Z'))/dayMs):0;
  const effectiveStart=sameMonth&&asOf>=p.periodStart?shift(asOf,1):p.periodStart,periodDays=(new Date(p.periodEnd+'T00:00:00Z')-new Date(p.periodStart+'T00:00:00Z'))/dayMs+1,effectiveDays=effectiveStart>p.periodEnd?0:(new Date(p.periodEnd+'T00:00:00Z')-new Date(effectiveStart+'T00:00:00Z'))/dayMs+1;
  const suggestedTarget=monthlyTarget===null||!sameMonth||!sourceVersion||!housing.length||effectiveDays===0?null:remainingGap===0?0:remainingDays>0?Math.min(remainingGap,Math.ceil(remainingGap*Math.min(effectiveDays,remainingDays)/remainingDays)):null;
  return {sourceAsOf:asOf,sourceVersion,calculation:{monthlyTarget,monthlyMet,remainingGap,remainingDays,periodDays,suggestedTarget}};
 }
 function draft(ctx,p){
  const id=key(ctx.month,p);if(state.drafts.has(id))return state.drafts.get(id);
  const row=currentCache(ctx).items.find(i=>i.payload?.periodStart===p.periodStart&&i.payload?.periodEnd===p.periodEnd),computed=calculate(currentCache(ctx).businessData,p),saved=row?.payload;
  const restored=saved?hydrate(saved):null;const d={row:row||null,allocation:restored?restored.allocation:null,target:saved?saved.target:null,strategyText:restored?.strategyText||'',status:saved?.status||'draft',sourceAsOf:saved?.sourceAsOf||computed.sourceAsOf,sourceVersion:saved?.sourceVersion||computed.sourceVersion,calculation:clone(saved?.calculation||computed.calculation),dirty:false,preview:null,restore:null,remote:null,error:'',notice:''};
  state.drafts.set(id,d);return d;
 }
 const editable=ctx=>privateReader(ctx)&&currentCache(ctx).access==='private'&&currentCache(ctx).loaded&&!currentCache(ctx).loading;
 const stamp=v=>v?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'';
 function say(ctx,text){ctx.notify?.(text);const el=ctx.host.querySelector('[data-cwp-status]');if(el)el.textContent=text;}
 function formula(d,p){const c=d.calculation;if(c.suggestedTarget===null)return p.periodEnd<=d.sourceAsOf?'该周期已结束，按已保存计划回看，不再自动补写目标。':'目标或底表尚未完整，周建议量待核实。';const effectiveStart=d.sourceAsOf>=p.periodStart?shift(d.sourceAsOf,1):p.periodStart,effectiveDays=Math.max(0,(new Date(p.periodEnd+'T00:00:00Z')-new Date(effectiveStart+'T00:00:00Z'))/dayMs+1);return `月度剩余差距${c.remainingGap}套 ÷ 截至${d.sourceAsOf}后的剩余${c.remainingDays}天 × 计划周期有效${effectiveDays}天，向上取整，建议${c.suggestedTarget}套。`;} 
 function previewHtml(d){if(!d.preview)return '';return `<div class="cwp-preview"><h4>AI策略草稿 · 待项目负责人核实</h4><details><summary>查看生成前的原稿</summary><pre>${esc(d.preview.original||'原稿为空')}</pre></details><label>可修改的策略草稿<textarea name="aiPreview" maxlength="6000" rows="7">${esc(d.preview.text)}</textarea></label>${d.preview.warnings?.length?`<p class="cwp-warning">${d.preview.warnings.map(esc).join('；')}</p>`:''}<div class="cwp-actions"><button type="button" class="btn primary" data-cwp="apply-ai">采用草稿</button><button type="button" class="btn" data-cwp="discard-ai">保留当前填写</button></div></div>`;}
 function periodSelect(ctx,p){return `<label>计划周期<select aria-label="全司周计划周期" data-cwp-control="period">${periods(ctx.month).map(x=>`<option value="${x.periodStart}" ${x.periodStart===p.periodStart?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label>`;}
 function renderReport(ctx,p,d,cache){
  const toolbar='<div class="cwp-toolbar">'+periodSelect(ctx,p)+'</div>';
  if(cache.loading||!cache.loaded){ctx.host.innerHTML='<section class="cwp-panel cwp-report">'+toolbar+'<p role="status">'+esc(cache.error||'正在读取本周目标与策略…')+'</p></section>';return;}
  if(!d.row){ctx.host.innerHTML='<section class="cwp-panel cwp-report">'+toolbar+'<p>该周期暂无已保存目标与策略。</p></section>';return;}
  const business=cache.businessData,live=calculate(business,p),covered=new Set(ownerHousing(business).map(h=>M().canonicalStore(h['门店']))),complete=live.calculation.monthlyTarget!==null&&M().storeCatalog.filter(s=>s.ownerApplicable!==false).every(s=>covered.has(s.store)),c=complete?live.calculation:d.calculation,asOf=complete?live.sourceAsOf:d.sourceAsOf,strategy=d.strategyText.trim();
  const paragraphs=strategy?strategy.split(/\n\s*\n|\n(?=(?:[一二三四五六七八九十]+[、.．]|\d+[、.．]))/).filter(Boolean).map(part=>{const lines=part.trim().split('\n'),heading=/^(?:[一二三四五六七八九十]+[、.．]|\d+[、.．])/.test(lines[0]);return heading&&lines.length>1?'<section class="cwp-strategy-point"><h4>'+esc(lines.shift())+'</h4><p>'+esc(lines.join('\n')).replace(/\n/g,'<br>')+'</p></section>':'<p>'+esc(part).replace(/\n/g,'<br>')+'</p>';}).join(''):'<p>该计划尚未填写核心策略。</p>';
  ctx.host.innerHTML='<section class="cwp-panel cwp-report">'+toolbar+'<h3>全司本周目标与核心策略</h3><div class="cwp-metrics"><article><span>月度面见目标</span><strong>'+esc(c.monthlyTarget??'未填写')+'<small>套</small></strong></article><article><span>月度累计面见</span><strong>'+esc(c.monthlyMet)+'<small>套</small></strong></article><article><span>月度剩余差距</span><strong>'+esc(c.remainingGap??'未填写')+'<small>套</small></strong></article><article data-cwp-primary><span>本周执行目标</span><strong data-cwp-week-target>'+esc(d.target??'未填写')+'<small>套</small></strong></article></div><p class="cwp-source">月度数据截至'+esc(asOf||'未提供')+'。本周目标与门店分解按所选计划呈现。</p><section class="cwp-allocation">'+allocationHtml(ctx,d,true)+'</section><section class="cwp-strategy-report"><h4>本周核心策略</h4>'+paragraphs+'</section></section>';
 }
 function render(ctx){
  if(!ctx.host?.isConnected)return;if(!privateReader(ctx)){const p=period(ctx),cache=currentCache(ctx);renderReport(ctx,p,draft(ctx,p),cache);return;}if(root.WBReviewVoice?.activeArea&&ctx.host.contains(root.WBReviewVoice.activeArea))root.WBReviewVoice.reset();const p=period(ctx),d=draft(ctx,p),c=d.calculation,can=editable(ctx),disabled=can?'':'disabled',busy=!!state.ai&&state.ai.key===key(ctx.month,p),cache=currentCache(ctx);
  const age=d.sourceAsOf&&d.sourceAsOf<shift(p.periodStart,-1)?`底表尚未更新至计划周前一天（${shift(p.periodStart,-1)}），建议量依据当前已知数据测算，请项目负责人审核。`:'';
  const progress=busy?state.ai.progress:'';
  ctx.host.innerHTML=`<div class="cwp-panel"><div class="cwp-toolbar"><label>计划周期<select aria-label="全司周计划周期" data-cwp-control="period">${periods(ctx.month).map(x=>`<option value="${x.periodStart}" ${x.periodStart===p.periodStart?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label><button type="button" class="btn" data-cwp="refresh">刷新已保存计划</button><span class="cwp-badge">${d.dirty?'有未保存修改':d.row?d.status==='confirmed'?'已确认':'已保存草稿':'待项目负责人确认'}</span></div><div class="cwp-metrics"><article><span>月度面见目标</span><strong>${c.monthlyTarget??'待确认'}<small>套</small></strong></article><article><span>月度累计面见</span><strong>${c.monthlyMet}<small>套</small></strong></article><article><span>月度剩余差距</span><strong>${c.remainingGap??'待确认'}<small>套</small></strong></article><article data-cwp-primary><span>本周执行目标</span><strong data-cwp-week-target>${d.target??'待设定'}<small>套</small></strong></article></div><p class="cwp-source">业主数据截至${esc(d.sourceAsOf||'待导入')}。测算参考（不替代执行目标）：${esc(formula(d,p))}</p>${age?`<p class="cwp-warning">${esc(age)}</p>`:''}${d.row?'<p class="cwp-source">已保存计划保留当时的数据与判断。需要调整时，由项目负责人重新测算后保存。</p>':''}${d.remote?`<div class="cwp-warning"><p>其他窗口已更新这份计划。当前填写已保留，请选择合并方式。</p><button class="btn" type="button" data-cwp="remote">采用最新共享版本</button><button class="btn" type="button" data-cwp="local">以当前填写为准</button></div>`:''}<form data-cwp-form="plan"><fieldset ${disabled}><legend>定量目标</legend><label class="cwp-target">本周计划面见量（套，可调整）<input name="target" aria-label="全司周目标（套）" type="number" min="0" max="10000" step="1" value="${d.target??''}" placeholder="项目负责人确认"></label><button type="button" class="btn" data-cwp="recalculate">按最新底表重新测算</button></fieldset><section class="cwp-allocation" data-cwp-allocation>${allocationHtml(ctx,d)}</section><fieldset ${disabled}><legend>核心策略与执行重点</legend><div class="cwp-actions"><button type="button" class="btn" data-cwp="voice" ${busy?'disabled':''}>语音输入</button><button type="button" class="btn" data-cwp="voice-stop" ${busy?'disabled':''}>结束语音</button></div><label class="cwp-strategy-label">全司核心策略<textarea name="strategyText" aria-label="全司核心策略" rows="8" maxlength="6000" placeholder="仅填写三条核心策略；目标数字在上方表格查看。">${esc(d.strategyText)}</textarea></label><label class="cwp-confirm"><input type="checkbox" name="confirmed" ${d.status==='confirmed'?'checked':''}>项目负责人已确认本周目标与核心策略</label></fieldset><div class="cwp-save"><button class="btn primary" type="submit" ${disabled||busy?'disabled':''}>保存全司周计划</button><span>${d.row?esc('最近保存：'+(d.row.payload.updatedBy||'项目负责人')+' · '+stamp(d.row.updated_at)):can?'保存后同步到免登录汇报页，各大区BP可查看。':'由项目负责人修改和保存，各大区BP共享查看。'}</span></div></form><p class="cwp-status" role="status" data-cwp-status>${esc(progress||d.error||d.notice||cache.error||(!ctx.cloud.member?'进入BP／管理入口后查看共享计划。':cache.loading?'正在读取全司计划…':'周目标由数据测算，核心策略由项目负责人填写并确认。'))}</p></div>`;
 }
 function read(ctx){const form=ctx.host.querySelector('[data-cwp-form]');const d=draft(ctx,period(ctx));if(!form)return d;updateTarget(ctx,d,form.elements.target.value===''?null:Number(form.elements.target.value));d.strategyText=form.elements.strategyText.value;d.status=form.elements.confirmed.checked?'confirmed':'draft';if(d.preview&&form.elements.aiPreview)d.preview.text=form.elements.aiPreview.value;return d;}
 function sync(ctx){const d=read(ctx);d.dirty=true;const badge=ctx.host.querySelector('.cwp-badge');if(badge)badge.textContent='有未保存修改';const allocation=ctx.host.querySelector('[data-cwp-allocation]');if(allocation)allocation.innerHTML=allocationHtml(ctx,d);const primary=ctx.host.querySelector('[data-cwp-week-target]');if(primary)primary.innerHTML=esc(d.target??'待设定')+'<small>套</small>';return d;}
 async function load(ctx,force=false){
  const access=privateReader(ctx)?'private':'public',actor=state.actor,member=ctx.cloud.member,month=ctx.month;
  const valid=()=>ctx.month===month&&state.actor===actor&&ctx.cloud.member===member&&(privateReader(ctx)?'private':'public')===access;
  if(state.pending.has(month)){const pending=state.pending.get(month);if(!force)return pending;await pending;if(!valid())return;if(sourceVersion(currentCache(ctx).businessData)===sourceVersion(ctx.businessData))return;return load(ctx,true);}if(currentCache(ctx).loaded&&currentCache(ctx).access===access&&!force)return;
  const previous=currentCache(ctx);state.cache.set(month,{...previous,access,loading:true});
  const promise=(async()=>{await Promise.resolve();try{
   let source,plans;if(access==='private'){[source,plans]=await Promise.all([ctx.cloud.storeReview('load',{month}),ctx.cloud.companyWeekPlan('load',{month})]);}else{if(!ctx.cloud.publicCompanyWeekPlans)throw Error('本周目标与策略暂时无法读取，请稍后刷新。');plans=await ctx.cloud.publicCompanyWeekPlans('load',{month});source={businessData:publicBusinessData(ctx.businessData),items:[]};}
   if(!valid())return;if(plans.month&&plans.month!==month)throw Error('读取的计划月份不一致，请刷新后重试');const items=(plans.items||[]).filter(row=>row.payload?.recordType==='company-week-plan'||access==='private');state.cache.set(month,{items,businessData:source.businessData,regionalReviews:source.items||[],access,loaded:true,loading:false,error:''});
   for(const [id,d] of state.drafts){if(!id.startsWith(month+'|'))continue;const row=items.find(x=>key(month,x.payload)===id);if(!d.dirty)state.drafts.delete(id);else if(row&&row.updated_at!==d.row?.updated_at)d.remote=row;else if(!d.row&&access==='private'){const [month,start,end]=id.split('|'),computed=calculate(source.businessData,{periodStart:start,periodEnd:end}),oldSuggestion=d.calculation.suggestedTarget;d.sourceAsOf=computed.sourceAsOf;d.sourceVersion=computed.sourceVersion;d.calculation=computed.calculation;if(d.target!==null&&d.target===oldSuggestion)d.target=computed.calculation.suggestedTarget;d.allocation=suggestedAllocation(source.businessData,d.target,d.calculation);}}
  }catch(e){if(valid())state.cache.set(month,{...previous,access,loading:false,error:e.message});}finally{if(state.pending.get(month)===promise)state.pending.delete(month);if(valid()&&state.ctx?.month===month)render(state.ctx);}})();state.pending.set(month,promise);return promise;
 }
 function buildAIContext(ctx,p,d){
  const cache=currentCache(ctx),business=cache.businessData||{},goals=goalMap(business),housing=ownerHousing(business),storeRows=M().storeCatalog.filter(s=>s.ownerApplicable!==false).map(s=>{const m=M().metrics(M().inScope(housing,{region:s.region,store:s.store}),business.meetings||[]);return {region:s.region,store:s.store,target:count(goals[s.store]),met:m.met,stock:m.stock,storeTopMet:m.store_top_met,storeTopStock:m.store_top_stock,unitTopMet:m.unit_top_met,unitTopStock:m.unit_top_stock};});
  const regions=M().unique(storeRows.map(s=>s.region)).map(region=>{const rows=storeRows.filter(s=>s.region===region);return {region,target:rows.every(s=>s.target!==null)?rows.reduce((n,s)=>n+s.target,0):null,met:rows.reduce((n,s)=>n+s.met,0),stock:rows.reduce((n,s)=>n+s.stock,0)};});
  const latest=new Map();for(const row of cache.regionalReviews||[]){const x=row.payload;if(x?.status!=='confirmed'||x.periodEnd>=p.periodStart)continue;const old=latest.get(row.store);if(!old||old.payload.periodEnd<x.periodEnd)latest.set(row.store,row);}
  const excerpt=(value,max)=>{const chars=Array.from(String(value||''));return chars.length>max?chars.slice(0,max).join('')+'…（摘要，完整原报告保留）':chars.join('');};
  const rankedReviews=[...latest.values()].sort((a,b)=>{const gap=row=>{const metrics=storeRows.find(s=>s.store===row.store);return metrics?.target==null?0:Math.max(0,metrics.target-metrics.met);};return gap(b)-gap(a);});
  const reviews=rankedReviews.map(row=>({region:row.region,store:row.store,periodStart:row.payload.periodStart,periodEnd:row.payload.periodEnd,highlights:excerpt(row.payload.fields?.highlights,220),blockers:excerpt(row.payload.fields?.blockers,200),nextActions:excerpt(row.payload.fields?.nextActions,220),note:'供AI参考的已确认复盘摘要，完整原报告保留'}));
  const context={task:'基于以下真实数据提出未来一周可执行的全司核心策略草稿；不要把建议写成已经发生的事实。',month:ctx.month,periodStart:p.periodStart,periodEnd:p.periodEnd,sourceAsOf:d.sourceAsOf,quantitativeGoal:d.target,calculation:clone(d.calculation),regions,stores:storeRows,confirmedReviews:[],reviewExcerptNote:'以下为供AI生成策略的摘要，优先纳入月度差距较大的门店；完整原报告继续保留。'};
  for(const review of reviews){context.confirmedReviews.push(review);if(JSON.stringify(context).length>15000){context.confirmedReviews.pop();break;}}
  context.reviewExcerptNote+=` 已纳入${context.confirmedReviews.length}/${reviews.length}家已确认复盘。`;
  return context;
 }
 function cancelAI(){state.generation++;if(state.ai)state.ai.controller.abort();state.ai=null;}
 async function generate(ctx){
  if(!editable(ctx))throw Error('仅项目负责人可生成和修改全司策略');if(root.WBReviewVoice?.recording&&ctx.host.contains(root.WBReviewVoice.activeArea))throw Error('请先结束语音并核对文字，再生成AI草稿');if(!root.WBReviewAI?.organize)throw Error('AI整理功能尚未就绪，请稍后刷新');
  const p=period(ctx),d=read(ctx);if(d.strategyText.length>6000)throw Error('原稿超过6000字，请按重点分段整理；全文保留，不会截断。');const businessVersion=currentCache(ctx).businessData?.imports?.[0]?.created_at||'';if(d.sourceVersion!==businessVersion)throw Error('计划使用的是已保存的旧底表，请先按最新底表重新测算，再生成AI策略');const id=key(ctx.month,p),original=d.strategyText,originalTarget=d.target,sourceBefore=JSON.stringify({sourceVersion:d.sourceVersion,sourceAsOf:d.sourceAsOf,calculation:d.calculation,businessVersion}),token=++state.generation,controller=new AbortController();if(state.ai)state.ai.controller.abort();state.ai={key:id,controller,progress:'正在准备本机AI…'};d.error='';render(ctx);
  try{const result=await root.WBReviewAI.organize({kind:'companyStrategy',text:original,context:buildAIContext(ctx,p,d),signal:controller.signal,onProgress:progress=>{if(token!==state.generation||state.ctx!==ctx)return;state.ai.progress=typeof progress==='string'?progress:progress.message||'AI正在生成策略草稿…';say(ctx,state.ai.progress);}});
   if(token!==state.generation||state.ctx!==ctx||key(ctx.month,period(ctx))!==id)return;read(ctx);if(d.strategyText!==original||d.target!==originalTarget||sourceBefore!==JSON.stringify({sourceVersion:d.sourceVersion,sourceAsOf:d.sourceAsOf,calculation:d.calculation,businessVersion:currentCache(ctx).businessData?.imports?.[0]?.created_at||''})){d.notice='生成期间原稿、周目标或底表测算有修改，已保留当前填写；请按最新内容重新生成。';return;}
   if(result.method!=='local-model'||!String(result.text||'').trim()||String(result.text).length>6000)throw Error('未收到有效的本机AI草稿，原稿已保留');d.preview={original,target:originalTarget,text:String(result.text),warnings:result.warnings||[]};d.error='';d.notice='AI草稿已生成。核实并修改后，点击“采用草稿”，再保存。';
  }catch(e){if(token===state.generation){d.error=e.name==='AbortError'?'AI整理已取消，原稿保留。':e.message||'AI整理未完成，原稿保留。';}}
  finally{if(token===state.generation){state.ai=null;if(state.ctx===ctx)render(ctx);}}
 }
 function adoptRemote(d){const row=d.remote,restored=hydrate(row.payload);d.row=row;for(const name of ['target','sourceAsOf','sourceVersion','calculation','status'])d[name]=clone(row.payload[name]);d.strategyText=restored.strategyText;d.allocation=restored.allocation;d.remote=null;d.dirty=false;d.preview=null;d.restore=null;}
 async function save(ctx,form){
  if(!editable(ctx))throw Error('仅项目负责人可保存全司周计划');if(root.WBReviewVoice?.recording&&ctx.host.contains(root.WBReviewVoice.activeArea))throw Error('请先结束语音并核对文字，再保存');if(!form.reportValidity())return;const p=period(ctx),d=read(ctx),actor=state.actor,member=ctx.cloud.member,month=ctx.month;if(d.saving)return;if(d.remote)throw Error('请先处理其他窗口对本计划的更新');if(d.target===null||!Number.isInteger(d.target)||d.target<0||d.target>10000)throw Error('请确认0—10000套的整数周目标');if(!d.sourceAsOf||!d.sourceVersion||d.calculation.monthlyTarget===null||!ownerHousing(currentCache(ctx).businessData).length)throw Error('底表或月度目标不完整，请先刷新数据');if(d.strategyText.length>6000)throw Error('策略文字最多6000字，请按重点分段整理；当前原稿保留。');
  if(d.allocation!==null&&!validateAllocation(d.allocation,d.target,d.calculation))throw Error('门店分解与本周目标或测算基数不一致，请重新测算后保存');
  const sent=payloadForDraft(d),button=form.querySelector('[type="submit"]');button.disabled=true;d.saving=true;
  try{const row=await ctx.cloud.companyWeekPlan('save',{month:ctx.month,periodStart:p.periodStart,periodEnd:p.periodEnd,payload:sent,expectedUpdatedAt:d.row?.updated_at||null});if(ctx.month!==month||state.actor!==actor||ctx.cloud.member!==member||state.ctx?.cloud.member!==member)return;const cache=currentCache(ctx);cache.items=[...cache.items.filter(x=>x.key!==row.key),row];d.row=row;read(ctx);d.dirty=!equal(sent,payloadForDraft(d));d.error='';d.notice=d.dirty?'已保存提交时的版本；后续修改仍待保存。':'全司周目标与核心策略已保存并同步汇报页，各大区BP可查看。';}
  catch(e){if(ctx.month===month&&state.actor===actor&&ctx.cloud.member===member&&state.ctx?.cloud.member===member)d.error=e.message||'本次保存未完成，当前填写保留。';}
  finally{d.saving=false;if(ctx.month===month&&state.ctx===ctx&&state.actor===actor&&ctx.cloud.member===member)render(ctx);}
 }
 function payloadForDraft(d){const payload={target:d.target,strategyText:d.strategyText,sourceAsOf:d.sourceAsOf,sourceVersion:d.sourceVersion,calculation:clone(d.calculation),status:d.status};if(d.allocation!==null&&d.allocation!==undefined)payload.allocation=clone(d.allocation);return payload;}
 function text(){
  const ctx=state.ctx;if(!ctx)return '';const p=period(ctx),d=draft(ctx,p);if(!privateReader(ctx)&&!d.row)return `全司本周核心策略\n计划周期：${p.periodStart}—${p.periodEnd}\n${currentCache(ctx).loading||!currentCache(ctx).loaded?'正在读取本周目标与策略…':'该周期暂无已保存目标与策略。'}`;
  return `全司本周核心策略\n计划周期：${p.periodStart}—${p.periodEnd}\n本周执行目标：${d.target??'待设定'}套\n\n核心策略：\n${d.strategyText||'核心策略尚未填写'}`;
 }
 function mount(ctx){
  if(!ctx.host)return;const actor=(ctx.cloud.member?.login_id||ctx.cloud.member?.display_name||'guest')+'|'+(privateReader(ctx)?'private':'public');if(state.actor!==actor){cancelAI();state.actor=actor;state.cache.clear();state.pending.clear();state.drafts.clear();state.selection.clear();state.sourceHints.clear();}
  const version=sourceVersion(ctx.businessData),previousHint=state.sourceHints.get(ctx.month),sourceChanged=!!version&&((previousHint!==undefined&&version!==previousHint)||(currentCache(ctx).loaded&&version!==sourceVersion(currentCache(ctx).businessData)));if(version)state.sourceHints.set(ctx.month,version);
  if(state.ctx?.month!==ctx.month||(state.ctx&&state.ctx.host!==ctx.host)||sourceChanged)cancelAI();state.ctx=ctx;render(ctx);load(ctx,sourceChanged);
 }
 root.document?.addEventListener('input',event=>{const ctx=state.ctx;if(!ctx?.host.contains(event.target))return;if(event.target.name==='aiPreview'){read(ctx);return;}if(event.target.closest('[data-cwp-form]'))sync(ctx);});
 root.document?.addEventListener('change',event=>{const ctx=state.ctx;if(!ctx?.host.contains(event.target))return;if(event.target.dataset.cwpControl==='period'){read(ctx);cancelAI();if(root.WBReviewVoice?.activeArea&&ctx.host.contains(root.WBReviewVoice.activeArea))root.WBReviewVoice.reset();state.selection.set(ctx.month,event.target.value);render(ctx);}else if(event.target.closest('[data-cwp-form]'))sync(ctx);});
 root.document?.addEventListener('submit',event=>{if(!event.target.matches?.('[data-cwp-form]'))return;event.preventDefault();const ctx=state.ctx;if(ctx)save(ctx,event.target).catch(e=>say(ctx,e.message));});
 root.document?.addEventListener('click',async event=>{const b=event.target.closest?.('[data-cwp]'),ctx=state.ctx;if(!b||!ctx?.host.contains(b))return;const action=b.dataset.cwp;try{const d=read(ctx);
  if(action==='refresh'){await load(ctx,true);return;}
  if(action==='cancel-ai'){cancelAI();d.notice='AI整理已取消，原稿保留。';render(ctx);return;}
  if(action==='generate'){await generate(ctx);return;}
  if(!editable(ctx))throw Error('仅项目负责人可修改全司计划');
  if(action==='apply-ai'){if(!d.preview)return;if(d.strategyText!==d.preview.original||d.target!==d.preview.target)throw Error('当前原稿或目标已修改，请重新生成草稿后再采用');d.restore={original:d.preview.original,appliedText:d.preview.text};d.strategyText=d.preview.text;d.preview=null;d.dirty=true;d.notice='已采用策略草稿，仍可修改；点击保存后共享。';render(ctx);return;}
  if(action==='discard-ai'){d.preview=null;render(ctx);return;}
  if(action==='restore-ai'){if(d.restore!==null){if(d.strategyText!==d.restore.appliedText)throw Error('采用草稿后又补充了文字，已保留当前内容；请手动合并原稿，避免覆盖新输入。');d.strategyText=d.restore.original;d.restore=null;d.dirty=true;render(ctx);}return;}
  if(action==='remote'){cancelAI();adoptRemote(d);render(ctx);return;}
  if(action==='local'){d.row=d.remote;d.remote=null;d.dirty=true;render(ctx);return;}
  if(action==='recalculate'){await load(ctx,true);if(currentCache(ctx).error)throw Error(currentCache(ctx).error);const p=period(ctx),latest=draft(ctx,p),oldSuggestion=latest.calculation.suggestedTarget,computed=calculate(currentCache(ctx).businessData,p);latest.sourceAsOf=computed.sourceAsOf;latest.sourceVersion=computed.sourceVersion;latest.calculation=computed.calculation;if(latest.target!==null&&latest.target===oldSuggestion)latest.target=computed.calculation.suggestedTarget;latest.allocation=suggestedAllocation(currentCache(ctx).businessData,latest.target,latest.calculation);latest.dirty=true;latest.error='';latest.notice='已按最新底表重算；人工调整过的目标和策略文字保留，保存后生效。';render(ctx);return;}
  if(action==='voice'){const area=ctx.host.querySelector('[name="strategyText"]');if(!root.WBReviewVoice?.start)throw Error('语音输入尚未就绪，可在输入框使用Win+H');root.WBReviewVoice.start({area,onStatus:message=>say(ctx,message),onChange:()=>sync(ctx)});return;}
  if(action==='voice-stop'){root.WBReviewVoice?.stop();return;}
 }catch(e){say(ctx,e.message||'操作未完成，填写内容保留。');}});
 root.addEventListener?.('pagehide',cancelAI);
 root.addEventListener?.('beforeunload',event=>{if([...state.drafts.values()].some(d=>d.dirty)){event.preventDefault();event.returnValue='';}});
 root.WBCompanyWeekPlan={mount,text,periods,defaultPeriod,calculate,allocateTargets,allocate,allocationPayload,validateAllocation,parseAllocation,stripAllocationBlocks,buildAIContext,state};
 if(typeof module==='object')module.exports=root.WBCompanyWeekPlan;
})(typeof window==='object'?window:globalThis);

