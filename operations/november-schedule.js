/* Read-only monthly planning schedule; no task assignment or execution service. */
(function(root){
  'use strict';
  const E=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lines=value=>E(value).replace(/\n/g,'<br>');
  const cadence={once:'单次节点',daily:'每日跟进',weekly:'每周复盘'};
  const state={view:{},strategy:'all',frequency:'all',open:false};
  const actionAnchor=id=>'#nov-action-'+String(id).replace('.','-');
  const plan=()=>root.WBNovemberPlan||{actions:[],executionActions:[],strategies:[]};
  function rows(){
    return (plan().actions||[]).map(action=>{
      const execution=(plan().executionActions||[]).find(item=>item.id===action.id||(item.linkedActionIds||[]).includes(action.id))||{};
      const pending=execution.enabled===false&&(execution.pendingSchedule||action.pendingSchedule||!execution.dueDate);
      const frequency=execution.frequency||action.frequency;
      const date=pending?'':execution.dueDate||(frequency==='once'?action.date:execution.startDate||action.startDate)||'';
      return {action,execution,pending,frequency,date};
    }).sort((a,b)=>{
      const group=row=>row.pending?3:row.frequency==='once'?0:row.frequency==='daily'?1:2;
      return group(a)-group(b)||a.date.localeCompare(b.date)||a.action.id.localeCompare(b.action.id,undefined,{numeric:true});
    });
  }
  function dateText(row){
    if(row.pending)return '待确认排期';
    const a=row.action,x=row.execution;
    if(row.frequency==='daily')return `每日 · ${(x.startDate||a.startDate||'待确认').slice(5)}—${(x.endDate||a.endDate||'待确认').slice(5)}`;
    if(row.frequency==='weekly')return `每周${['','一','二','三','四','五','六','日'][Number(x.weekday||a.weekdays?.[0])]||'待定'}`;
    return row.date||'待确认日期';
  }
  function prerequisite(row){
    const a=row.action;
    if(a.prerequisites)return Array.isArray(a.prerequisites)?a.prerequisites.join('；'):a.prerequisites;
    if(a.preconditions)return a.preconditions;
    if(a.trigger)return a.trigger;
    const ids=a.predecessorIds||a.dependencies||[];
    if(Array.isArray(ids)&&ids.length)return ids.map(id=>plan().actions.find(item=>item.id===id)?.title||id).join('；');
    if(row.pending)return '先确认具体负责人、组织方式和执行日期。';
    return '按动作说明确认承接条件；需要支持的问题及时反馈。';
  }
  function nextText(row){
    if(row.pending)return row.action.nextStep||'先与相关人员确认排期和承接安排，再按实际情况推进。';
    return row.action.nextStep||'结合实际推进情况复查结果，明确后续动作、负责人和时间。';
  }
  function detailRow(row){
    const a=row.action;
    return `<tr class="${row.pending?'ns-pending-row':''}"><td data-label="时间／截止日"><strong>${E(dateText(row))}</strong><small>${E(cadence[row.frequency]||row.frequency||'待安排')}</small><details class="ns-cell-detail"><summary>时间说明</summary><p>${lines(a.when)}</p><p>${E(a.scheduleBasis||'')}</p></details></td><th scope="row" data-label="关联动作"><a href="${E(actionAnchor(a.id))}" data-ns-action="${E(a.id)}"><span>动作 ${E(a.id)}</span>${E(a.title)}</a></th><td data-label="主责／协作">${E(a.owner)}<small>${E(a.collaborators||'')}</small></td><td data-label="前置条件">${E(prerequisite(row))}</td><td data-label="本次交付与验收"><details class="ns-cell-detail"><summary>查看做法与验收</summary><p><b>做法：</b>${E(a.how)}</p><p><b>验收：</b>${E(a.acceptance)}</p></details></td><td data-label="下一步／复查">${E(nextText(row))}</td></tr>`;
  }
  function inner(view){
    const all=rows(),pending=all.filter(row=>row.pending),visible=all.filter(row=>(state.strategy==='all'||String(row.action.strategy)===state.strategy)&&(state.frequency==='all'||(state.frequency==='pending'?row.pending:!row.pending&&row.frequency===state.frequency)));
    const stateNote='本表为规划排期，展示动作、时间与复查依据；实际完成情况结合业务数据和沟通记录核对。';
    return `<div class="ns-heading"><div><span class="ns-eyebrow">MONTHLY EXECUTION</span><h3>整月规划排期</h3><p>将四项策略放到同一张排期中，查看负责人、前置条件、交付和复查安排。</p></div><span class="ns-count">${all.length} 项动作${pending.length?' · '+pending.length+' 项待确认排期':''}</span></div><div class="ns-dependency"><strong>关键衔接</strong><p>报告定稿后，预计11月12日全员培训，当晚全司店总会同步培训、通关标准及配套物料；随后由门店承接通关、补训与复查，具体日期与店总确认。印刷配送同步推进，使用报告服务前确认伙伴已掌握。门店共识后落实周目标、物料和邀约安排，每日跟进实际变化，每周调整后续动作。</p></div>${pending.length?`<div class="ns-pending"><h4>优先确认这些承接安排</h4><div class="ns-pending-grid">${pending.map(row=>`<article><span>动作 ${E(row.action.id)} · 待排期</span><a href="${E(actionAnchor(row.action.id))}" data-ns-action="${E(row.action.id)}">${E(row.action.title)}</a><p>${E(row.action.owner)}</p><small>${lines(row.action.when)}</small></article>`).join('')}</div><p class="ns-caption">上列动作已纳入规划。确定具体负责人和日期后，按实际安排推进并复查结果。</p></div>`:''}<details class="ns-full" ${state.open?'open':''}><summary><span>展开完整执行排期</span><small>${all.length} 项动作 · 供日常推动参考</small></summary><div class="ns-controls"><label>策略<select data-ns-filter="strategy"><option value="all">四项策略</option>${(plan().strategies||[]).map(s=>`<option value="${E(s.id)}" ${state.strategy===String(s.id)?'selected':''}>${E(s.title)}</option>`).join('')}</select></label><label>节奏<select data-ns-filter="frequency">${[['all','全部节奏'],['once','单次节点'],['daily','每日跟进'],['weekly','每周复盘'],['pending','待确认排期']].map(([value,label])=>`<option value="${value}" ${state.frequency===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="ns-caption">当前显示 ${visible.length} 项</p></div><p class="ns-state-note">${E(stateNote)}</p><div class="ns-table-wrap"><table class="ns-table"><caption class="ns-sr">11月四项策略执行总排期</caption><thead><tr>${['时间／截止日','关联动作','主责／协作','前置条件','本次交付与验收','下一步／复查'].map(label=>'<th scope="col">'+label+'</th>').join('')}</tr></thead><tbody>${visible.length?visible.map(row=>detailRow(row)).join(''):'<tr><td colspan="6" class="ns-empty">当前筛选下没有动作，请切换策略或节奏。</td></tr>'}</tbody></table></div></details><details class="ns-handover"><summary>接手人使用说明与入口</summary><ol><li><b>先看规划和待确认项：</b>在本排期查看动作、时间与前置条件；需要调整时与相关人员确认。</li><li><b>每日更新：</b>在日常推动查看数据与重点对象，结合沟通了解实际动作、卡点和下一步。</li><li><b>每周复盘：</b>结合业务数据和已核实的推动情况，回看目标差距、未解决问题与标杆做法，明确下周动作和复查日。</li><li><b>交接资源：</b>使用固定行动包入口；业务底表由项目负责人在数据管理按月更新，费用仍在费用核销承接。资源或执行问题由BP与项目负责人沟通协调。</li></ol><div class="ns-links"><a class="btn" href="https://liya123156.github.io/gan-en-yue/" target="_blank" rel="noopener">打开感恩月行动包</a><button type="button" class="btn primary" data-plan-mode="daily">进入日常推动</button><button type="button" class="btn" data-plan-mode="review">查看周复盘</button><button type="button" class="btn" data-plan-mode="admin">更新业务数据</button></div></details>`;
  }
  function render(view={}){
    state.view=view;
    return `<section id="november-master-schedule" class="ns-master" aria-label="整月规划排期">${inner(view)}</section>`;
  }
  function repaint(){
    const host=typeof document!=='undefined'&&document.getElementById('november-master-schedule');
    if(!host)return;
    state.open=!!host.querySelector('.ns-full')?.open;
    host.innerHTML=inner(state.view);
  }
  function exportText(){
    // Planning and business completion are separate; no task-service lookup is performed.
    return ['','整月规划排期','报告培训与通关、印刷配送并行承接；待确认动作先落实负责人和日期。',...rows().flatMap(row=>['',row.action.id+' '+row.action.title,'排期：'+dateText(row)+'；'+row.action.when,'主责／协作：'+row.action.owner+'；'+(row.action.collaborators||''),'前置条件：'+prerequisite(row),'交付与验收：'+row.action.acceptance,'复查：'+nextText(row)]),'','接手说明：使用行动包固定入口；日常推动结合业务数据和沟通核对进展、卡点与下一步；周月复盘沿用已核实信息。'].join('\n');
  }
  if(typeof document!=='undefined'){
    document.addEventListener('change',event=>{
      const input=event.target.closest('[data-ns-filter]');
      if(!input)return;
      state[input.dataset.nsFilter]=input.value;
      repaint();
    });
    document.addEventListener('click',event=>{
      const link=event.target.closest('[data-ns-action]');
      if(!link)return;
      const id=link.dataset.nsAction;
      const strategy=document.getElementById('nov-strategy-'+id.split('.')[0]);
      if(strategy)strategy.open=true;
      const action=document.getElementById('nov-action-'+id.replace('.','-'));
      if(action){event.preventDefault();action.scrollIntoView({behavior:'smooth',block:'start'});}
    });
  }
  root.WBNovemberSchedule={render,exportText,rows,dateText};
})(window);
