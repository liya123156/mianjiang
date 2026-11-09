/* November plan → scoped daily work → server-verified acceptance → weekly review. */
(function(root){
 'use strict';
 const MONTH='2026-11', C=root.WBCloud;
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const statuses={open:'待开展',in_progress:'推进中',blocked:'需要支持',submitted:'待验收',accepted:'已验收',rejected:'退回补充'};
 const strategies={'1':'目标共识','2':'物料与资源支持','3':'目标过程管理','4':'正反馈与标杆运营'};
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const monthDate=()=>today()<MONTH+'-01'?MONTH+'-01':today()>'2026-12-07'?'2026-12-07':today();
 const state={data:null,identity:'',loaded:false,loading:false,error:'',notice:'',date:monthDate(),week:monthDate(),status:'all',strategy:'all',overdue:true,view:null,tab:'daily',busy:false};
 const member=()=>C?.member;
 const whoKey=()=>JSON.stringify(member()?{id:member().user_id||member().id||member().email||member().display_name,role:member().role,region:member().region,store:member().store,stores:member().stores}:null);
 function resetIfChanged(){const key=whoKey();if(key!==state.identity){state.identity=key;state.data=null;state.loaded=false;state.loading=false;state.error='';state.notice='';const dialog=document.getElementById('pe-dialog');if(dialog){dialog.close();dialog.innerHTML='';}}}
 const sid=t=>String(t.strategyId||t.strategy||'').match(/^[1-4]$/)?.[0]||'cross';
 function strategyIds(t){if(sid(t)!=='cross')return [sid(t)];const ids=t.linkedActionIds||action(t).linkedActionIds||[];return [...new Set(ids.map(id=>String(id).split('.')[0]).filter(id=>strategies[id]))];}
 const strategyName=t=>sid(t)==='cross'?'联动：'+strategyIds(t).map(id=>({'1':'共识','2':'物料','3':'过程','4':'标杆'}[id])).join(' · '):strategies[sid(t)];
 const day=t=>String(t.dueDate||t.taskDate||'').slice(0,10);
 const dateLabel=d=>d?String(d).slice(5).replace('-','/'):'待排期';
 const timeLabel=d=>d?new Date(d).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 const scopeName=t=>t.store||t.region||'全司项目组';
 const currentScope=view=>({region:view?.region||'',store:view?.scope==='store'?(view.store||view.name):''});
 function inView(t,view){const s=currentScope(view);return (!s.region||t.region===s.region)&&(!s.store||t.store===s.store);}
 const allTasks=view=>(state.data?.tasks||[]).filter(t=>inView(t,view));
 const action=t=>t.actionSnapshot||(state.data?.actions||[]).find(a=>a.id===t.actionId)||root.WBNovemberPlan?.executionActions?.find(a=>a.id===t.actionId)||{};
 // Use the current planning guidance while keeping saved dates, permissions and task history intact.
 function configuredActions(){
  const saved=new Map((state.data?.actions||[]).map(a=>[a.id,a]));
  const result=(root.WBNovemberPlan?.executionActions||[]).map(local=>{
   const server=saved.get(local.id);saved.delete(local.id);
   const merged={...server,...local};
   if(server){for(const key of ['scope','ownerRole','frequency','startDate','endDate','dueDate','weekday','enabled','version'])if(Object.prototype.hasOwnProperty.call(server,key))merged[key]=server[key];}
   else delete merged.version;
   merged.pendingSchedule=merged.enabled===false&&!!local.pendingSchedule;
   return merged;
  });
  return result.concat([...saved.values()]);
 }
 function guidanceUpdate(t){
  const current=configuredActions().find(a=>a.id===t.actionId),original=action(t);
  if(!current||(current.how===original.how&&current.acceptance===original.acceptance))return '';
  return `<details class="pe-guidance-update"><summary>11月5日补充推进指引</summary><p>${E(current.how)}</p><p><strong>当前检核重点：</strong>${E(current.acceptance)}</p><small>本任务原排期和历史验收依据保留，补充指引用于后续推进。</small></details>`;
 }
 function pendingScheduleNotice(){
  const pending=configuredActions().filter(a=>a.pendingSchedule);
  if(!pending.length)return '';
  return `<div class="pe-notice pe-pending-schedule"><strong>${pending.length}项新增动作待确认排期</strong><p>${pending.map(a=>E(a.title)).join('；')}。</p><p>先确认培训时间、通关安排、跟店责任排班和首批门店，再启用对应任务；当前不计为逾期或已完成。</p>${member()?.role==='project'?'<button type="button" class="btn" data-ops="admin">确认新增动作排期</button>':''}</div>`;
 }
 function scheduleSummary(view){
  resetIfChanged();
  const loggedIn=!!member(),loaded=loggedIn&&state.loaded&&!state.error;
  const summary={loggedIn,loaded,loading:state.loading,error:!!state.error,asOf:today(),actions:[]};
  if(!loaded)return summary;
  const tasks=allTasks(view);
  summary.actions=configuredActions().map(a=>{
   const rows=tasks.filter(t=>t.actionId===a.id),due=rows.filter(t=>day(t)<=summary.asOf);
   const count=status=>due.filter(t=>t.status===status).length;
   return {id:a.id,linkedActionIds:[...(a.linkedActionIds||[a.id])],enabled:a.enabled!==false,frequency:a.frequency,startDate:a.startDate||null,endDate:a.endDate||null,dueDate:a.dueDate||null,weekday:a.weekday||null,pendingSchedule:!!a.pendingSchedule,total:rows.length,due:due.length,accepted:count('accepted'),submitted:count('submitted'),blocked:count('blocked'),rejected:count('rejected'),inProgress:count('in_progress'),open:count('open'),nextDueDate:rows.filter(t=>t.status!=='accepted').map(day).filter(Boolean).sort()[0]||null};
  });
  return summary;
 }
 function announceUpdate(){if(typeof root.dispatchEvent==='function'&&typeof root.Event==='function')root.dispatchEvent(new root.Event('wb-plan-execution-updated'));}

 const assignee=t=>(t.assignees||[]).map(x=>x.name).filter(Boolean).join('、')||'待分派';
 const isAssigned=t=>t.assignmentStatus==='assigned'||!!t.assignees?.length;
 const button=(label,act,attrs='',primary=false)=>`<button type="button" class="btn ${primary?'primary':''}" data-pe="${act}" ${attrs}>${label}</button>`;
 const badge=t=>`<span class="pe-badge pe-${E(t.status)}">${E(statuses[t.status]||'待开展')}</span>`;
 function banner(){return `${state.error?`<p class="pe-notice pe-warning" role="alert">${E(state.error)} ${button('重新同步','refresh')}</p>`:''}${state.notice?`<p class="pe-notice" role="status">${E(state.notice)}</p>`:''}`;}
 function login(){return `<div class="pe-empty"><h3>进入我的执行清单</h3><p>规划可共享查看。使用已授权工号进入后，按负责大区／门店查看本周动作、提交结果和验收记录。</p><button type="button" class="btn primary" data-ops="login">BP／管理入口</button></div>`;}
 function ensure(){resetIfChanged();if(member()&&!state.loaded&&!state.loading&&!state.error)Promise.resolve().then(()=>load()).catch(()=>{});}
 function repaint(){for(const name of ['daily','weekly','admin']){const host=document.getElementById('pe-'+name);if(host)host.innerHTML=body(name,state.view);}}
 async function load(force=false){
  resetIfChanged();if(!member()){state.data=null;state.loaded=false;repaint();return null;}
  if(state.loading||(!force&&state.loaded))return state.data;
  const key=state.identity;state.loading=true;state.error='';repaint();
  try{if(typeof C.plan!=='function')throw Error('任务服务正在连接，请稍后刷新');const data=await C.plan('load',{month:MONTH});if(whoKey()!==key)return null;state.data=data;state.loaded=true;return data;}
  catch(e){if(whoKey()===key)state.error=e.message||'任务读取失败，请重试';return null;}
  finally{if(whoKey()===key){state.loading=false;repaint();announceUpdate();}}
 }
 async function refresh(){return load(true);}
 function render(kind,view){state.view=view;state.tab=kind;ensure();return `<section id="pe-${kind}" class="pe-section">${body(kind,view)}</section>`;}
 function body(kind,view){
  if(kind==='daily')return daily(view);
  if(!member())return `<div class="pe-heading"><div><span class="pe-eyebrow">PLAN TO ACTION</span><h2>${kind==='weekly'?'本周执行复盘':'规划分派与责任范围'}</h2></div></div>${login()}`;
  if(state.loading&&!state.loaded)return '<div class="pe-empty" role="status">正在读取共享任务与验收记录…</div>';
  return kind==='weekly'?weekly(view):admin(view);
 }
 function statCards(items){return `<div class="pe-stats">${items.map(([label,value,note])=>`<div class="pe-stat"><span>${E(label)}</span><strong>${E(value)}</strong><small>${E(note||'')}</small></div>`).join('')}</div>`;}
 function filters(){return `<div class="pe-filters"><label>检核日期<input type="date" data-pe-filter="date" min="2026-11-01" max="2026-12-07" value="${E(state.date)}"></label><label>策略<select data-pe-filter="strategy"><option value="all">全部策略</option>${Object.entries(strategies).map(([id,name])=>`<option value="${id}" ${state.strategy===id?'selected':''}>${E(name)}</option>`).join('')}</select></label><label>状态<select data-pe-filter="status"><option value="all">全部状态</option>${Object.entries(statuses).map(([id,name])=>`<option value="${id}" ${state.status===id?'selected':''}>${E(name)}</option>`).join('')}<option value="unassigned" ${state.status==='unassigned'?'selected':''}>待分派</option></select></label><label class="pe-check"><input type="checkbox" data-pe-filter="overdue" ${state.overdue?'checked':''}>同时查看此前未验收</label>${button('同步最新结果','refresh')}</div>`;}
 function weekPlan(){return root.WBNovemberPlan?.week2Plan||null;}
 function weeklyActionCard(item){
 const bullets=items=>`<ul>${items.map(x=>`<li>${E(x)}</li>`).join('')}</ul>`;
 return `<article class="pe-task"><div class="pe-task-top"><span class="pe-kicker">策略 ${E(item.id)} · 本周核心动作</span><span class="pe-badge pe-in_progress">本周执行</span></div><h3>${E(item.title)}</h3><p class="pe-task-meta">${E(item.timing)}</p><div class="pe-latest"><b>怎么做</b>${bullets(item.actions)}</div><details class="pe-task-how" open><summary>角色分工与验收标准</summary><dl><dt>谁来承接</dt><dd>${E(item.owners)}</dd><dt>本周验收</dt><dd>${E(item.acceptance)}</dd></dl></details></article>`;
}
 function daily(view){
 const plan=weekPlan();
 if(!plan)return `<div class="pe-empty"><h3>本周动作正在更新</h3><p>请稍后刷新查看11月第二周目标与四项策略。</p></div>`;
 return `<div class="pe-heading"><div><span class="pe-eyebrow">PLAN TO ACTION · 11月感恩月</span><h2>本周动作与检核</h2><p>按四项策略集中呈现本周动作、角色分工与验收标准，不再按日拆成重复任务。</p></div><a class="btn" href="?month=2026-11&amp;tab=plan">查看项目规划</a></div>
 ${statCards([['本周周期',plan.period,'11月第二周'],['面见目标','至少70套','在售业主面见量'],['核心策略',plan.strategies.length+'项','目标、物料、进度、标杆'],['执行标准','面见必带礼物','贺卡线上或线下均为加分项']])}
 <div class="pe-notice"><strong>本周定性目标</strong><p>${E(plan.qualitativeGoal)}</p><p><strong>统一执行标准：</strong>${E(plan.executionStandard)}</p></div>
 <div class="pe-task-list">${plan.strategies.map(weeklyActionCard).join('')}</div>`;
}
 function emptyPlan(){return `<div class="pe-empty"><h3>本月任务尚未生成</h3><p>项目负责人在数据管理中确认门店范围并发布排期后，BP可在这里承接对应日期的任务。</p>${member()?.role==='project'?'<button type="button" class="btn primary" data-ops="admin">进入规划分派</button>':''}</div>`;}
 function canReview(t){if(typeof t.canReview==='boolean')return t.canReview;return t.status==='submitted'&&(member()?.role==='project'||member()?.role==='region'&&member().region===t.region);}
 function canSubmit(t){if(t.frequency!=='once'&&action(t).frequency!=='once'&&String(t.taskDate||day(t))>today())return false;if(typeof t.canSubmit==='boolean')return t.canSubmit;return t.status!=='accepted'&&t.status!=='submitted'&&(member()?.role==='project'||member()?.role==='region'&&member().region===t.region&&t.ownerRole!=='project'||member()?.role==='store'&&t.ownerRole==='store');}
 function taskCard(t){const a=action(t),late=day(t)<state.date&&t.status!=='accepted';return `<article class="pe-task ${t.status==='blocked'?'pe-attention':''}"><div class="pe-task-top"><span class="pe-kicker">${E(strategyName(t))} · ${E(scopeName(t))}</span>${badge(t)}</div><h3>${E(t.title)}</h3><p class="pe-task-meta">${E(dateLabel(day(t)))} 截止 · ${E(assignee(t))}${!isAssigned(t)?' <span class="pe-unassigned">需配置负责BP</span>':''}${late?' <span class="pe-late">此前未验收</span>':''}</p><details class="pe-task-how"><summary>查看做法与验收标准</summary><dl><dt>怎么干</dt><dd>${E(a.how||'参照项目规划中的对应动作。')}</dd><dt>验收看什么</dt><dd>${E(a.acceptance||'记录实际动作、结果及核实依据。')}</dd>${a.when?`<dt>时间节奏</dt><dd>${E(a.when)}</dd>`:''}${a.linkedActionIds?.length?`<dt>关联规划</dt><dd>${E(a.linkedActionIds.join('、'))}</dd>`:''}</dl></details>${guidanceUpdate(t)}${t.result?`<div class="pe-latest"><b>最新结果</b><p>${E(t.result)}</p>${t.issue?`<p class="pe-warning-text">需支持：${E(t.issue)}</p>`:''}${t.reviewNote?`<p>验收意见：${E(t.reviewNote)}</p>`:''}</div>`:''}${!canSubmit(t)&&t.status==='open'&&String(t.taskDate||day(t))>today()?'<p class="pe-caption">按排期预览，开始当日可更新实际结果。</p>':''}<div class="pe-actions">${canSubmit(t)?button(t.status==='open'?'更新执行结果':'补充推进结果','edit',`data-id="${E(t.id)}"`,true):''}${canReview(t)?button(t.status==='accepted'?'重新打开并退回':'验收／退回','review',`data-id="${E(t.id)}"`,true):''}${button('结果与记录','history',`data-id="${E(t.id)}"`)}</div></article>`;}
 function storeOverview(view,date){
  const stores=(state.data?.stores||[]).filter(s=>s.enabled!==false&&inView(s,view));
  if(!stores.length)return '';
  const tasks=allTasks(view).filter(t=>day(t)<=date);
  return `<div class="pe-subheading"><h3>单店检核总览</h3><p>截至 ${E(dateLabel(date))} 的累计应完成任务；点开门店查看四项策略。每日联动任务会计入相关策略，总计按任务去重；未回报不等于已确认未行动。</p></div><div class="pe-store-grid">${stores.map(s=>{const rows=tasks.filter(t=>t.store===s.store&&t.region===s.region),done=rows.filter(t=>t.status==='accepted').length;return `<details class="pe-store"><summary><span><b>${E(s.store)}</b><small>${E(s.region)}</small></span><span>${done}/${rows.length} 已验收</span></summary><div class="pe-store-body">${Object.entries(strategies).map(([id,name])=>{const r=rows.filter(t=>strategyIds(t).includes(id));return `<div class="pe-strategy-row"><span>${E(name)}</span><span>${r.filter(t=>t.status==='accepted').length}/${r.length}</span></div>`;}).join('')}<p>${rows.filter(t=>t.status==='submitted').length} 待验收 · ${rows.filter(t=>t.status==='blocked').length} 需支持 · ${rows.filter(t=>t.status==='open').length} 待回报</p>${rows.some(t=>!isAssigned(t))?'<p class="pe-unassigned">有任务待配置负责BP</p>':''}${button('查看本店任务','store',`data-store="${E(s.store)}" data-region="${E(s.region)}"`)}</div></details>`;}).join('')}</div>`;
 }
 function weekBounds(value){const d=new Date(value+'T00:00:00Z'),weekday=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-weekday+1);const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};}
 function weekly(view){
  const week=weekBounds(state.week),tasks=allTasks(view).filter(t=>day(t)>=week.start&&day(t)<=week.end),done=tasks.filter(t=>t.status==='accepted'),pending=tasks.filter(t=>t.status==='submitted'),risks=tasks.filter(t=>t.status==='blocked'||t.status==='rejected'||['open','in_progress'].includes(t.status)&&day(t)<=today());
  const cases=tasks.filter(t=>t.benchmark&&t.benchmark.trim()&&!/^(暂无|无|今日暂无|无标杆|暂无标杆)[。.!！\s]*$/.test(t.benchmark.trim()));
  const scopes=[...new Set(tasks.map(scopeName))];
  return `<div class="pe-heading"><div><span class="pe-eyebrow">WEEKLY REVIEW</span><h2>本周执行复盘</h2><p>把业务目标结果与执行进度一起复盘，明确下周继续做什么、调整什么。</p></div>${button('同步最新记录','refresh')}</div>${banner()}<div class="pe-filters"><label>选择本周任一天<input type="date" data-pe-filter="week" min="2026-11-01" max="2026-12-07" value="${E(state.week)}"></label><strong>${E(dateLabel(week.start))} — ${E(dateLabel(week.end))}</strong></div>${statCards([['本周计划',tasks.length+'项','以任务到期日归入本周'],['已验收',done.length+'项',tasks.length?(done.length/tasks.length*100).toFixed(0)+'% 验收率':'未生成本周计划'],['待验收',pending.length+'项','需管理者确认实际结果'],['需继续推动',risks.length+'项','到期未完成、受阻或被退回']])}<p class="pe-caption">验收率＝本周已验收任务／本周计划任务；尚未到期也计入计划分母。任务验收率与面见目标达成率分别核对。</p>${tasks.length?`<div class="pe-review-table" role="table" aria-label="本周各组织执行结果"><div class="pe-review-row pe-table-head" role="row"><span>组织</span><span>计划</span><span>已验收</span><span>待验收</span><span>需推动</span></div>${scopes.map(name=>{const rows=tasks.filter(t=>scopeName(t)===name);return `<div class="pe-review-row" role="row"><strong>${E(name)}</strong><span>${rows.length}</span><span>${rows.filter(t=>t.status==='accepted').length}</span><span>${rows.filter(t=>t.status==='submitted').length}</span><span>${rows.filter(t=>risks.includes(t)).length}</span></div>`;}).join('')}</div><div class="pe-review-columns"><div><h3>卡点与下步</h3>${risks.length?risks.map(t=>`<article class="pe-review-note"><b>${E(scopeName(t))} · ${E(t.title)}</b><p>${E(t.issue||t.reviewNote||(t.status==='in_progress'?'已在推进，仍需明确完成时间与验收结果。':'尚未回报实际结果，需核实是否已行动。'))}</p><p>下步：${E(t.nextAction||'待明确负责人、解决动作和完成日期。')}</p>${button('查看记录','history',`data-id="${E(t.id)}"`)}</article>`).join(''):'<p class="pe-caption">当前记录中暂无待推动事项。</p>'}</div><div><h3>BP发现的正反馈与标杆</h3>${cases.length?cases.map(t=>`<article class="pe-review-note"><b>${E(scopeName(t))} · ${E(dateLabel(day(t)))}</b><p>${E(t.benchmark)}</p><small>${t.status==='accepted'?'相关任务已验收':'BP已记录，传播前请核实事实与具体做法'}</small>${button('查看依据','history',`data-id="${E(t.id)}"`)}</article>`).join(''):'<p class="pe-caption">本周尚未记录标杆。BP可从数据变化、行为变化和顾客反馈中主动发现，如实记录。</p>'}</div></div>`:emptyPlan()}`;
 }
 function seedStores(){
  if(state.data?.stores?.length)return state.data.stores;
  const directory=root.WBOperations?.state?.cache?.[MONTH]?.directory||[];
  if(directory.length)return [...new Map(directory.filter(x=>x.region&&x.store).map(x=>[x.region+'|'+x.store,{region:x.region,store:x.store,enabled:true}])).values()];
  try{return (DATA.regions||[]).flatMap(r=>r.stores.map(s=>({region:r.name,store:s,enabled:true})));}catch{return [];}
 }
 function admin(){
  if(member()?.role!=='project')return `<div class="pe-heading"><h2>规划分派与责任范围</h2></div><p class="pe-caption">项目负责人维护门店范围和排期。BP按已授权的大区／门店承接站内任务。</p>`;
  const stores=seedStores(),tasks=state.data?.tasks||[],unassigned=new Set(tasks.filter(t=>t.store&&!isAssigned(t)).map(t=>t.region+'|'+t.store));
  const rows=[...stores];while(rows.length<21)rows.push({region:'',store:'',enabled:true});
  return `<div class="pe-heading"><div><span class="pe-eyebrow">PROJECT SETUP</span><h2>规划分派与责任范围</h2><p>确认本月门店，发布后按日期生成整个周期的站内任务；重复发布只补充缺项。</p></div>${button('同步设置','refresh')}</div>${banner()}${statCards([['项目覆盖目标','21店','以实际组织名册核对'],['当前配置',(state.data?.stores||[]).filter(s=>s.enabled!==false).length+'店','已保存到共享服务的范围'],['已生成',tasks.length+'项','单次／每日／每周排期'],['待分派',unassigned.size+'店','需补齐BP账号负责范围']])}<div class="pe-notice">任务负责人与可见范围依据已有账号授权。填写店名不会自动开通BP账号；未授权门店会保留“待分派”，实际结果保持待回报。</div><details class="pe-admin-help"><summary>从规划到日常，怎么使用</summary><ol><li>核对下方门店范围；同一门店的大区和名称需与业务底表一致。</li><li>发布规划：单次物料准备按节点生成；每天的共识、进度、标杆发现合并为一份门店回报，避免重复填写。</li><li>BP进入日常推动，按日提交实际动作、组别进展、依据和下一步。</li><li>大区BP或项目负责人进行验收／退回，周复盘自动汇总任务记录。</li></ol><p>发布规划会在站内建立任务，不会发送外部消息。若调整排期，已有执行和验收记录保留。</p></details>${pendingScheduleNotice()}${schedulePanel()}<form id="pe-roster-form"><div class="pe-roster-head"><h3>本月门店范围</h3><button class="btn" type="button" data-pe="add-store">增加门店行</button></div><div class="pe-roster-list">${rows.map((s,i)=>rosterRow(s,i)).join('')}</div><div class="pe-actions"><button class="btn" type="submit" name="intent" value="save">保存门店范围</button><button class="btn primary" type="submit" name="intent" value="publish">保存并发布日任务</button></div><p class="pe-caption">空白行不提交；已配置门店需要停用时取消勾选。停用保留历史任务与结果。</p></form>${tasks.length?`<p class="pe-caption">已生成任务：${tasks.filter(t=>t.scope==='company').length} 项项目组事项、${tasks.filter(t=>t.scope==='region').length} 项大区事项、${tasks.filter(t=>t.scope==='store').length} 项门店事项。</p>`:''}`;
 }
 function schedulePanel(){
  const actions=configuredActions();
  return `<details class="pe-schedule"><summary><span><b>动作排期 · 时间安排</b><small>${actions.length} 项执行安排，关联完整策略明细</small></span><span>展开编辑</span></summary><p class="pe-caption">日期按上海时间。首次生成任务前可调整建议日期；本周期已生成任务的动作锁定排期，避免重复任务和验收记录错位。</p><form id="pe-schedule-form"><div class="pe-schedule-list">${actions.map(a=>{const locked=(state.data?.tasks||[]).some(t=>t.actionId===a.id);return `<details class="pe-schedule-item" data-action-id="${E(a.id)}" data-version="${E(typeof a.version==='number'?a.version:'')}"><summary><span>${E(a.title)}</span><small>${E(({once:'单次',daily:'每日',weekly:'每周'}[a.frequency])||a.frequency)} · ${E(a.pendingSchedule?'待确认排期':a.dueDate||a.startDate||'待排期')}</small></summary><div class="pe-schedule-fields"><label class="pe-check"><input name="enabled" type="checkbox" ${locked?'disabled':''} ${a.enabled!==false?'checked':''}>启用</label><label>频次<select name="frequency" ${locked?'disabled':''}>${Object.entries({once:'单次',daily:'每日',weekly:'每周'}).map(([id,name])=>`<option value="${id}" ${a.frequency===id?'selected':''}>${name}</option>`).join('')}</select></label><label>单次截止日<input name="dueDate" type="date" ${locked?'disabled':''} min="2026-11-01" max="2026-12-07" value="${E(a.dueDate||'')}"></label><label>开始日<input name="startDate" type="date" ${locked?'disabled':''} min="2026-11-01" max="2026-12-07" value="${E(a.startDate||(a.pendingSchedule?'':'2026-11-05'))}"></label><label>结束日<input name="endDate" type="date" ${locked?'disabled':''} min="2026-11-01" max="2026-12-07" value="${E(a.endDate||(a.pendingSchedule?'':'2026-11-30'))}"></label><label>每周哪天<select name="weekday" ${locked?'disabled':''}>${['一','二','三','四','五','六','日'].map((d,i)=>`<option value="${i+1}" ${Number(a.weekday||1)===i+1?'selected':''}>星期${d}</option>`).join('')}</select></label></div><p class="pe-caption">${E(a.when||'参照规划中的时间节奏')} ${a.pendingSchedule?' · 待确认后填写日期并勾选启用；保存不会自动生成未启用事项。':''} · ${E(a.scope==='store'?'各店BP承接':a.scope==='region'?'大区BP承接':'项目负责人承接')}</p>${locked?'<p class="pe-caption">本周期任务已生成，排期已锁定；如需变更，请由项目负责人单独确认调整方式，原执行记录保留。</p>':''}</details>`;}).join('')}</div><p class="pe-caption">尚未生成任务的动作可编辑日期；已生成任务的动作保留原排期与执行记录。</p><div class="pe-actions"><button class="btn" type="submit" name="intent" value="save">保存排期</button><button class="btn primary" type="submit" name="intent" value="generate">保存并同步任务</button></div></form></details>`;
 }
 function rosterRow(s,i){return `<div class="pe-roster-row" data-roster-index="${i}" data-id="${E(s.id||'')}" data-version="${E(s.version||'')}"><label class="pe-check"><input type="checkbox" name="enabled" ${s.enabled!==false?'checked':''}>${i+1}</label><label><span class="pe-sr">大区</span><input name="region" value="${E(s.region||'')}" placeholder="大区名称" aria-label="第${i+1}行大区"></label><label><span class="pe-sr">门店</span><input name="store" value="${E(s.store||'')}" placeholder="门店名称" aria-label="第${i+1}行门店"></label></div>`;}
 function dialog(content){let el=document.getElementById('pe-dialog');if(!el){el=document.createElement('dialog');el.id='pe-dialog';el.className='pe-dialog';document.body.append(el);}el.innerHTML=`<div class="pe-dialog-close">${button('关闭','close')}</div>${content}`;if(!el.open)el.showModal();return el;}
 function getTask(id){const t=state.data?.tasks?.find(x=>String(x.id)===String(id));if(!t)throw Error('任务已变化，请同步最新记录后重试');return t;}
 function taskForm(t){const a=action(t);return `<form id="pe-result-form" data-id="${E(t.id)}" data-version="${E(t.version)}"><span class="pe-kicker">${E(scopeName(t))} · ${E(dateLabel(day(t)))}</span><h2>${E(t.title)}</h2><p class="pe-form-standard">验收标准：${E(a.acceptance||'实际动作、结果及核实依据清楚。')}</p>${guidanceUpdate(t)}<label>推进状态<select name="status">${['in_progress','blocked','submitted'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${E(statuses[s])}</option>`).join('')}</select></label><label>实际动作与结果 <span>必填</span><textarea name="result" required maxlength="8000" placeholder="具体做了什么、发生了什么变化；共识是否落到行为，物料是否可取用。">${E(t.result||'')}</textarea></label><label>核实依据／证据链接 <span>提交验收时必填</span><textarea name="evidence" maxlength="4000" placeholder="填写核实对象、现场记录或可供验收的链接。">${E(t.evidence||'')}</textarea></label><label>店内各组推进情况<textarea name="groupDetails" maxlength="6000" placeholder="哪些组已行动、哪些组尚未行动，分别卡在哪里。">${E(t.groupDetails||'')}</textarea></label><label>今日正反馈／标杆<textarea name="benchmark" maxlength="6000" placeholder="记录具体人、行为、变化及可复制做法；尚未发现可如实填写“今日暂无”。">${E(t.benchmark||'')}</textarea></label><div class="pe-form-grid"><label>需项目组支持的问题<textarea name="issue" maxlength="4000" placeholder="问题、影响和需要谁提供什么支持">${E(t.issue||'')}</textarea></label><label>下一步与完成时间<textarea name="nextAction" maxlength="4000" placeholder="谁、做什么、何时完成、如何再次检核">${E(t.nextAction||'')}</textarea></label></div><p class="pe-caption">填写事实即可。日常顾客邀约和服务由销售中心执行，BP记录支持与检核结果。</p><p id="pe-form-error" class="pe-warning-text" role="alert"></p><button class="btn primary" type="submit">保存结果并同步</button></form>`;}
 function reviewForm(t){return `<form id="pe-review-form" data-id="${E(t.id)}" data-version="${E(t.version)}"><span class="pe-kicker">${E(scopeName(t))}</span><h2>验收：${E(t.title)}</h2>${resultDetail(t)}<label>验收结论<select name="decision">${t.status==='accepted'?'':'<option value="accept">通过验收</option>'}<option value="reject">退回补充</option></select></label><label>验收依据／需补充内容<textarea name="note" required maxlength="4000" placeholder="对照验收标准说明依据；退回时写明差什么、由谁何时补齐。"></textarea></label><p id="pe-form-error" class="pe-warning-text" role="alert"></p><button class="btn primary" type="submit">确认验收结论</button></form>`;}
 function resultDetail(t){return `<dl class="pe-result-detail"><dt>验收标准</dt><dd>${E(action(t).acceptance||'实际动作、结果与核实依据清楚。')}</dd>${[['result','实际动作与结果'],['evidence','核实依据'],['groupDetails','各组推进'],['benchmark','正反馈／标杆'],['issue','需支持'],['nextAction','下一步'],['reviewNote','验收意见']].filter(([key])=>t[key]).map(([key,label])=>`<dt>${label}</dt><dd>${E(t[key])}</dd>`).join('')}</dl>`;}
 function historyView(t){
  const events=(state.data?.events||[]).filter(e=>String(e.taskId||e.task_id)===String(t.id)).sort((a,b)=>String(a.createdAt||a.created_at).localeCompare(String(b.createdAt||b.created_at)));
  const eventNames={in_progress:'更新推进',blocked:'反馈需支持',submitted:'提交验收',submit:'更新结果',review:'验收',accept:'通过验收',reject:'退回补充',generate:'生成任务'};
  return `<span class="pe-kicker">${E(scopeName(t))} · ${E(dateLabel(day(t)))}</span><h2>${E(t.title)}</h2><p>${badge(t)} ${E(assignee(t))}</p>${resultDetail(t)}<h3>提交与验收记录</h3><div class="pe-history">${events.map(e=>{const p=e.payload||e.detail||e.data||{},report=p.report||p,type=e.type||e.eventType||e.event_type||'更新',status=p.toStatus||e.status||p.status;return `<article><b>${E(e.actorName||e.actor_name||e.by||'已授权成员')} · ${E(eventNames[type]||type)}</b><time>${E(timeLabel(e.createdAt||e.created_at))}</time>${[['result','实际动作与结果'],['evidence','核实依据'],['groupDetails','各组推进'],['benchmark','正反馈／标杆'],['issue','需支持'],['nextAction','下一步']].filter(([key])=>report[key]).map(([key,label])=>`<p><strong>${label}：</strong>${E(report[key])}</p>`).join('')}${(e.note||p.note)?`<p><strong>验收意见：</strong>${E(e.note||p.note)}</p>`:''}${status?`<small>更新后：${E(statuses[status]||status)}</small>`:''}</article>`;}).join('')||'<p class="pe-caption">尚未提交实际执行记录。</p>'}</div>`;
 }
 async function mutate(actionName,args){if(state.busy)throw Error('正在保存，请稍候');state.busy=true;try{await C.plan(actionName,{month:MONTH,...args});await refresh();}finally{state.busy=false;}}
 async function click(event){const b=event.target.closest('[data-pe]');if(!b)return;try{
  const act=b.dataset.pe;
  if(act==='refresh'){state.notice='';await refresh();return;}
  if(act==='choose-date'){state.date=b.dataset.date;state.status='all';repaint();return;}
  if(act==='close'){document.getElementById('pe-dialog')?.close();return;}
  if(act==='add-store'){const list=document.querySelector('.pe-roster-list');if(list)list.insertAdjacentHTML('beforeend',rosterRow({enabled:true},list.children.length));return;}
  if(act==='store'){const region=document.getElementById('region-filter'),store=document.getElementById('store-filter');if(region&&store){region.value=b.dataset.region;region.dispatchEvent(new Event('change'));store.value=b.dataset.store;store.dispatchEvent(new Event('change'));document.getElementById('pe-daily')?.scrollIntoView({behavior:'smooth'});}return;}
  const t=getTask(b.dataset.id);
  if(act==='edit'){if(!canSubmit(t))throw Error('此任务当前不能提交结果，请同步最新状态');dialog(taskForm(t));}
  if(act==='review'){if(!canReview(t))throw Error('此任务当前不在可验收范围');dialog(reviewForm(t));}
  if(act==='history')dialog(historyView(t));
 }catch(e){state.error=e.message;repaint();}}
 function change(event){const el=event.target.closest('[data-pe-filter]');if(!el)return;const key=el.dataset.peFilter;if(['date','week'].includes(key)&&!/^2026-(11-(0[1-9]|[12]\d|30)|12-0[1-7])$/.test(el.value))return;state[key]=el.type==='checkbox'?el.checked:el.value;repaint();}
 async function submit(event){const form=event.target;if(!['pe-result-form','pe-review-form','pe-roster-form','pe-schedule-form'].includes(form.id))return;event.preventDefault();const controls=[...form.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);const error=form.querySelector('#pe-form-error');if(error)error.textContent='';try{
  if(form.id==='pe-schedule-form'){
   const current=new Map(configuredActions().map(a=>[a.id,a]));
   const actions=[...form.querySelectorAll('[data-action-id]')].map(row=>{const original=current.get(row.dataset.actionId);if((state.data?.tasks||[]).some(t=>t.actionId===original.id))return {...original,version:typeof original.version==='number'?original.version:undefined};return {...original,version:row.dataset.version?Number(row.dataset.version):undefined,enabled:row.querySelector('[name="enabled"]').checked,frequency:row.querySelector('[name="frequency"]').value,dueDate:row.querySelector('[name="dueDate"]').value||null,startDate:row.querySelector('[name="startDate"]').value||null,endDate:row.querySelector('[name="endDate"]').value||null,weekday:row.querySelector('[name="frequency"]').value==='weekly'?Number(row.querySelector('[name="weekday"]').value):null};});
   for(const a of actions){if(!a.enabled)continue;if(a.frequency==='once'&&!a.dueDate)throw Error(a.title+'：请填写单次截止日');if(a.frequency!=='once'&&(!a.startDate||!a.endDate||a.startDate>a.endDate))throw Error(a.title+'：请核对开始日和结束日');}
   if(state.busy)throw Error('正在保存，请稍候');state.busy=true;try{await C.plan('save-actions',{month:MONTH,actions});if(event.submitter?.value==='generate'){await C.plan('generate',{month:MONTH});state.notice='排期已保存并同步任务，已有执行记录继续保留。';}else state.notice='排期已保存；点击“保存并同步任务”应用到执行清单。';}finally{state.busy=false;}
   await refresh();return;
  }
  if(form.id==='pe-roster-form'){
   const stores=[...form.querySelectorAll('[data-roster-index]')].map(row=>({id:row.dataset.id||undefined,version:row.dataset.version?Number(row.dataset.version):undefined,region:row.querySelector('[name="region"]').value.trim(),store:row.querySelector('[name="store"]').value.trim(),enabled:row.querySelector('[name="enabled"]').checked})).filter(s=>s.region||s.store||s.id);
   if(stores.some(s=>!s.region||!s.store))throw Error('请将有内容的门店行补齐大区和店名；完全空白的行可保留。');
   if(new Set(stores.map(s=>s.region+'|'+s.store)).size!==stores.length)throw Error('门店范围有重复行，请核对后保存。');
   if(state.busy)throw Error('正在保存，请稍候');state.busy=true;
   try{await C.plan('save-stores',{month:MONTH,stores});if(event.submitter?.value==='publish'){
    const source=configuredActions();if(!source?.length)throw Error('规划动作尚未加载，请刷新页面后重试。门店范围已保存。');
    const current=new Map((state.data?.actions||[]).map(a=>[a.id,a]));
    const actions=source.map(a=>({...a,version:current.get(a.id)?.version,enabled:a.enabled!==false}));
    await C.plan('save-actions',{month:MONTH,actions});const generated=await C.plan('generate',{month:MONTH});state.notice='规划已发布，站内任务已按门店和日期生成；已有执行记录继续保留。';
   }else state.notice='门店范围已保存；新门店可通过“保存并发布日任务”补充排期。';
   }finally{state.busy=false;}
   await refresh();return;
  }
  const values=Object.fromEntries(new FormData(form));for(const key of Object.keys(values))values[key]=String(values[key]).trim();
  if(form.id==='pe-result-form'){
   if(!values.result)throw Error('请填写实际动作与结果。');
   if(values.status==='submitted'&&!values.evidence)throw Error('提交验收前，请补充核实依据或证据链接。');
   if(values.status==='blocked'&&!values.issue)throw Error('请说明当前卡点与需要的支持。');
   await mutate('submit',{taskId:form.dataset.id,expectedVersion:Number(form.dataset.version),...values});state.notice=values.status==='submitted'?'结果已提交，等待管理者验收。':'推进结果已保存并共享。';
  }else{if(!values.note)throw Error('请填写验收依据或需补充的内容。');await mutate('review',{taskId:form.dataset.id,expectedVersion:Number(form.dataset.version),...values});state.notice=values.decision==='accept'?'已通过验收，记录已进入本周复盘。':'已退回补充，请继续跟进到有结果。';}
  document.getElementById('pe-dialog')?.close();repaint();
 }catch(e){if(error)error.textContent=e.message;else{state.error=e.message;const banner=document.createElement('p');banner.className='pe-notice pe-warning';banner.setAttribute('role','alert');banner.textContent=e.message;form.prepend(banner);}}finally{controls.forEach(b=>b.disabled=false);}}
 function boot(){if(boot.done)return;boot.done=true;document.addEventListener('click',click);document.addEventListener('change',change);document.addEventListener('submit',submit);}
 root.WBPlanExecution={renderDaily:view=>render('daily',view),renderWeekly:view=>render('weekly',view),renderAdmin:view=>render('admin',view),load,refresh,boot,state,weekBounds,scheduleSummary,reset:()=>{state.identity='';resetIfChanged();}};
 boot();
})(window);
