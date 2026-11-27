/* One workbench: daily progress, persistent actions, monthly finance and administrator imports. */
(function(root){
 'use strict';
 const M=root.WBModel,C=root.WBCloud,Q=root.WBQuality,W=root.WBWorkflow,F=root.WBFeedback,E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={cache:{},refreshSerial:{},goalCommits:{},loading:false,exporting:false,savingSendConfig:false,error:'',preview:null,customerPreview:null,scene:'',sceneDrafts:{},sceneAnalyses:{},scenePlans:{},expenseFilter:'todo',qualityFilters:{},reviewNotesReaders:new Map(),selectedExpense:null,expenseContext:null,archiveNotice:''};
 const isMode=mode=>['daily','expense','admin'].includes(mode)||(mode==='review'&&new URL(location.href).searchParams.get('review')!=='archive'), cents=value=>Math.round(Number(value||0)*100),money=value=>(Number(value||0)/100).toFixed(2);
 const chinaToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const yesterday=()=>{const d=new Date(chinaToday()+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
 const title=scope=>scope.store||scope.region||'全司', scope=()=>({region:currentView?.region||'',store:currentView?.scope==='store'?(currentView.store||currentView.name):''});
 const data=()=>state.cache[currentMonth], item=(kind,id,store)=>data()?.items.find(x=>x.key===currentMonth+'|'+kind+'|'+(store||'@@company')+'|'+id);
 const payload=(kind,id,store)=>item(kind,id,store)?.payload||{};
 const canonicalStore=value=>M.canonicalStore?M.canonicalStore(value):String(value||'');
 const noOwnerStore=store=>['徐汇一店','Hmall中心店','Hmall旗舰店'].includes(canonicalStore(store));
  const hiddenCustomerStores=new Set(['徐汇一店','Hmall中心店','Hmall旗舰店'].map(canonicalStore));
  const customerOptions=()=>({showCustomer:false});
 const customerValue=row=>row?.customer_count==='—'?'—':typeof row?.customer_count==='number'?row.customer_count+'次':'待导入';
 const meetingValue=row=>M.meetingCountValue?M.meetingCountValue(row,'met_count'):row.met_count;
 const meetingLabel=row=>(M.meetingCountLabel?M.meetingCountLabel(row,'met_count'):'')||(meetingValue(row)+'次');
 function sceneKey(view=currentView){return currentMonth+'|'+viewKey(view);}
 function sceneRaw(view=currentView){const store=view.scope==='store'?(view.store||view.name):null;return state.sceneDrafts[sceneKey(view)]??payload('scene','daily',store).text??'';}
 function sceneAnalysis(view=currentView){const raw=sceneRaw(view),draft=state.sceneAnalyses[sceneKey(view)],store=view.scope==='store'?(view.store||view.name):null,saved=payload('scene','daily',store);if(draft?.source===raw)return draft;const extracted=WBScene.analyze(raw);if(saved.text===raw&&typeof saved.analysisText==='string')extracted.text=saved.analysisText;return extracted;}
 function analysisPanel(view){const a=sceneAnalysis(view);return `<details class="ops-scene-analysis" ${a.source?'open':''}><summary>整理后的推动重点（可修改）</summary><p class="ops-muted">按原文分类，待核对；保留上方原文，不推测原因或补写事实。</p><textarea id="ops-scene-analysis" aria-label="整理后的推动重点" placeholder="输入现场信息后，点击整理并更新话术">${E(a.text)}</textarea>${a.checks.length?'<p class="ops-muted">规则检核，请核对：'+E(a.checks.join(' '))+'</p>':''}</details>`;}
 function updateMessagePreview(){const p=currentView.sections[0]?.blocks[0],m=p?.rows.find(r=>r._level===currentView.scope);if(m)document.getElementById('ops-message').value=makeMessage(currentView,p,m,m._target??(typeof m.target==='number'?m.target:null),DATA.meta.cutoff,state.messageContext?.risks||[],state.messageContext?.praises||[]);}
 function readPlanEdits(){const plan=state.scenePlans[sceneKey()];if(!plan)return;document.querySelectorAll('[data-plan-index]').forEach(el=>{const x=plan.candidates[Number(el.dataset.planIndex)];if(!x)return;for(const name of ['owner','due','action','houseId'])x[name]=el.querySelector('[name="'+name+'"]')?.value||'';x.title=x.action;x.confirmed=!!el.querySelector('[name="confirmed"]')?.checked;});}
 function planPanel(view){const plan=state.scenePlans[sceneKey(view)];if(!plan||!plan.candidates.length)return '<p class="ops-muted">整理后，有后续安排的原文会在这里形成待确认动作；已经做完的事情保留在反馈中。</p>';return `<div class="ops-plan-list"><p>以下为原文提取的待确认动作。勾选并补齐负责人、日期后，与本次反馈一起保存。</p>${plan.candidates.map((t,i)=>`<article class="ops-plan-row" data-plan-index="${i}"><label class="ops-check"><input type="checkbox" name="confirmed" ${t.confirmed?'checked':''}>纳入动作追踪</label><div class="ops-form"><label class="wide">具体动作<textarea name="action">${E(t.action)}</textarea></label><label>负责人<input name="owner" value="${E(t.owner)}" placeholder="原文未明确则补充"></label><label>计划日期<input type="date" name="due" value="${E(t.due)}"></label><label>关联房源<select name="houseId"><option value="">门店事项／暂不关联</option>${M.inScope(data()?.housing||[],{store:view.store||view.name}).filter(h=>M.flag(h['细分在售户数']??h['在售户数'])).map(h=>`<option value="${E(h['房源编号'])}" ${t.houseId===h['房源编号']?'selected':''}>${E((h['分盘']||h['总盘']||'')+' · '+(h['房间号']||h['房源编号']))}</option>`).join('')}</select></label></div></article>`).join('')}</div>`;}
 async function organizeAndUpdate(button,commit=false){
  if(WBVoice.recording)throw Error('请先结束语音并核对输入框里的文字');
  readPlanEdits();const view=currentView,key=sceneKey(view),raw=document.getElementById('ops-scene').value;state.sceneDrafts[key]=raw;const analysis=sceneAnalysis(view);state.sceneAnalyses[key]=analysis;
  const panel=document.getElementById('ops-scene-analysis');if(panel)panel.value=analysis.text;panel?.closest('details')?.setAttribute('open','');updateMessagePreview();
  const was=state.scenePlans[key];if(!was||was.source!==raw){const houses=M.inScope(data()?.housing||[],{store:view.store||view.name});state.scenePlans[key]={source:raw,candidates:W.candidates(raw,chinaToday(),houses,[...M.unique(houses.map(h=>h['维护人姓名'])),...(data()?.directory||[]).filter(x=>x.store===(view.store||view.name)).flatMap(x=>[x.payload.storeHead,x.payload.regionHead])])};const host=document.getElementById('ops-plan-preview');if(host)host.innerHTML=planPanel(view);if(commit&&state.scenePlans[key].candidates.length){notify('已提取待确认动作，请核对勾选后再确认同步');return;}}
  if(!commit){notify('话术与待确认动作已更新，请核对后确认同步');return;}
  if(!C.member||view.scope!=='store'){notify('当前为预览；共享保存需使用已授权工号进入并筛选单店');return;}
  const month=currentMonth,store=view.store||view.name,region=view.region,existing=item('scene','daily',store),old=existing?.payload||{},now=new Date().toISOString();button.disabled=true;
  try{const tasks=W.mergeTasks(old.tasks,state.scenePlans[key].candidates,now,M.uuid),history=[...(old.history||[])];if(old.text&&old.text!==raw)history.push({text:old.text,analysisText:old.analysisText||'',updatedOn:old.updatedOn||existing.updated_at});const body={...old,text:raw,analysisText:analysis.text,analysisMethod:analysis.method,tasks,history,updatedOn:now};if(JSON.stringify(body).length>180000)throw Error('本店本月记录较多，请联系项目负责人归档后继续补充');await C.saveItem(month,'scene','daily',region,store,body,existing?.updated_at);delete state.sceneDrafts[key];delete state.sceneAnalyses[key];delete state.scenePlans[key];if(currentMonth===month&&sceneKey(currentView)===key)await refresh();else delete state.cache[month];notify('已同步：现场反馈、推动话术、确认动作及复盘记录');}finally{if(button.isConnected)button.disabled=false;}
 }
 function qualityData(view=currentView){const loaded=data(),d=loaded?.housing?.length?loaded:loaded?.companyProgress,s={region:view.region||'',store:view.scope==='store'?(view.store||view.name):''};if(!d?.housing.length)return null;
  if(C.member&&loaded?.housing?.length){const all=Q.records(d.housing,d.meetings,d.items,currentMonth,d.imports[0]?.as_of),records=Q.scoped(all,s);return {summary:Q.summary(records),records,groups:Q.publicSummary(all,d.imports[0]?.as_of,d.imports[0]?.created_at).groups,asOf:d.imports[0]?.as_of,private:true};}
  const publicItem=d.items.find(x=>x.kind==='goals'&&x.payload.recordType==='public-quality'),pub=publicItem?.payload;
  if(d.meetings?.length){const all=Q.records(d.housing,d.meetings,d.items,currentMonth,d.imports[0]?.as_of),records=Q.scoped(all,s);return {summary:Q.summary(records),records,groups:Q.publicSummary(all,d.imports[0]?.as_of,d.imports[0]?.created_at).groups,asOf:d.imports[0]?.as_of,private:true};}
  if(!pub)return {summary:Q.summary([]),asOf:d.imports[0]?.as_of||'',generatedAt:'',private:false};
  const wantedStore=view.scope==='store'?(view.store||view.name):'';
  const exact=pub.groups.find(x=>x.scope===view.scope&&x.region===(view.region||'')&&x.store===wantedStore);
  const byStore=view.scope==='store'&&wantedStore?pub.groups.find(x=>x.scope==='store'&&x.store===wantedStore):null;
  const summary=exact||byStore||pub.groups.find(x=>x.scope===view.scope&&x.region===(view.region||''))||Q.summary([]);return {summary,groups:pub.groups,asOf:pub.asOf,generatedAt:publicItem.updated_at,private:false};
 }
 function qualityText(q=qualityData()){if(!q||q.pending)return '面见质量概览待同步';const t=q.summary;const items=Object.entries(Q.labels).map(([k,v])=>({label:v,count:Number(t.counts?.[k]||0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);return `面见质量｜截至${q.asOf}\n本月面见带来的业务反馈结构（按数量从高到低）：\n${items.map(x=>`${x.label}：${x.count}套（${M.pct(x.count,t.total)}）`).join('\n')||'暂无已归类反馈'}${Number(t.counts?.U||0)>0?`\n其中原文待补${Number(t.missing||0)}套，已有原文但结果待明确${Number(t.unclear||0)}套。`:''}`;}
 function novemberQualityMessage(q){
  if(!q||q.pending)return '面见质量概览待同步';
  const items=Object.entries(Q.labels).filter(([key])=>key!=='U').map(([key,label])=>({key,label,count:Number(q.summary.counts?.[key]||0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
  return items.map(x=>`${x.label}：${x.count}套`).join('\n')||'暂无已归类反馈';
 }
 function qualityStandards(){const standards=Q.standards||[];if(!standards.length)return '';return `<details class="quality-classification quality-standards"><summary>查看面见质量识别标准</summary><p class="ops-muted">依据原文中已获取的信息与已开展的维护沟通归类；价格不变、不急卖等真实现状同样计入。计划、待询问事项不视为已取得结果。每套房源只计一个主要结果，主题标签可重复。</p><div class="review-table-scroll"><table class="review-tier-table" aria-label="面见质量识别标准"><thead><tr><th scope="col">主要结果</th><th scope="col">计入标准</th><th scope="col">不直接计入</th><th scope="col">原文示例</th></tr></thead><tbody>${standards.map(x=>`<tr><th scope="row" style="white-space:normal;text-align:left">${E(Q.labels[x.code]||x.code)}</th><td style="white-space:normal;text-align:left">${E(x.accept)}</td><td style="white-space:normal;text-align:left">${E(x.exclude)}</td><td style="white-space:normal;text-align:left">${E(x.example)}</td></tr>`).join('')}</tbody></table></div><p class="ops-muted">反馈结果待明确表示原文缺失或记录尚不足以支持归类，不直接等同于面见没有收获。</p></details>`;}
 function qualitySelection(view=currentView,q=qualityData(view)){const key=currentMonth+'|'+viewKey(view),filter=state.qualityFilters[key]||={topic:'all',sort:'latest',page:0},rows=q?.private?F.select(q.records,filter.topic,filter.sort):[],pages=Math.max(1,Math.ceil(rows.length/6));filter.page=Math.min(filter.page,pages-1);return {filter,rows,pageRows:rows.slice(filter.page*6,filter.page*6+6),pages};}
 function qualityPanel(view){const q=qualityData(view);if(!q){const old=ARCHIVE.months[currentMonth]?.views[viewKey(view)]?.sections.find(x=>x.id==='quality');return old?`<div id="ops-quality-content"><p class="ops-muted">以下为已归档复盘质量，截止时间以原复盘为准。</p>${old.blocks.map(renderBlock).join('')}</div>`:'<div class="ops-notice" id="ops-quality-content">导入本月底表与面见明细后生成真实反馈。</div>';}
  if(!q.private&&!q.pending){const t=q.summary,rows=Object.entries(Q.labels).filter(([k])=>Number(t.counts?.[k]||0)>0).map(([k,label])=>`<div class="quality-public-row"><span>${E(label)}</span><b>${t.counts[k]}套</b><em>${M.pct(t.counts[k],t.total)}</em></div>`).join('')||'<p class="ops-muted">暂无已归类反馈</p>';return `<div id="ops-quality-content" class="quality-feed"><header class="quality-feed-hero"><div><h3>业主面见 · 真实反馈</h3><p>${currentMonth.slice(0,4)}年${Number(currentMonth.slice(5))}月 | ${E(view.name)}</p></div></header><div class="quality-feed-body"><p class="quality-scope-note">已面见${t.total}套 · 有原文${t.feedback}套 · 原文待补${t.missing}套</p><div class="quality-public-list">${rows}</div><div class="ops-actions"><button class="btn primary" data-ops="quality-image">复制概览图片</button><button class="btn" data-ops="copy-quality">复制概览文字</button></div>${Number(t.counts?.U||0)>0?`<p class="ops-muted">反馈结果待明确中：原文待补${Number(t.missing||0)}套，已有原文但结果待明确${Number(t.unclear||0)}套。</p>`:''}${qualityStandards()}</div></div>`;}
  const header=`<header class="quality-feed-hero"><div><h3>业主面见 · 真实反馈</h3><p>${currentMonth.slice(0,4)}年${Number(currentMonth.slice(5))}月 | ${E(view.name)} | 同一房源多次面见，按时间连续呈现</p><span>关系在一次次真实沟通中建立，机会在持续经营中被发现</span></div></header>`;
  if(q.pending)return `<div id="ops-quality-content">${header}<div class="ops-notice">本次质量概览待同步。负责人刷新共享数据后发布；已授权成员可进入本范围查看反馈原文。</div></div>`;
  const t=q.summary,sel=qualitySelection(view,q),topics=q.private?F.counts(q.records):(t.topics||{}),chips=Object.entries(F.labels).filter(([k])=>topics[k]>0),range=q.private?`${sel.rows.length?sel.filter.page*6+1:0}—${Math.min((sel.filter.page+1)*6,sel.rows.length)} / ${sel.rows.length}套`:'';
  return `<div id="ops-quality-content" class="quality-feed">${header}<div class="quality-feed-body"><div class="quality-topic-chips">${q.private?`<button class="quality-chip ${sel.filter.topic==='all'?'selected':''}" data-ops="quality-topic" data-topic="all">全部 · ${t.total}套</button>`:''}${chips.map(([k,label])=>q.private?`<button class="quality-chip ${sel.filter.topic===k?'selected':''}" data-ops="quality-topic" data-topic="${k}">${label} · ${topics[k]}套</button>`:`<span class="quality-chip">${label} · ${topics[k]}套</span>`).join('')}</div><p class="quality-scope-note">数据截至${E(q.asOf)} · 已面见${t.total}套 · 有原文${t.feedback}套 · 原文待补${t.missing}套。主题按房源去重，可重复计入多个话题，不等同于质量评级。</p><div class="quality-feed-toolbar"><div class="ops-actions"><button class="btn primary" data-ops="quality-image">${q.private?'复制本页图片':'复制概览图片'}</button><button class="btn" data-ops="copy-quality">${q.private?'复制本页原文':'复制概览文字'}</button></div>${q.private?`<label>卡片排序<select id="quality-sort" aria-label="反馈卡片排序"><option value="latest" ${sel.filter.sort==='latest'?'selected':''}>最近反馈优先</option><option value="project" ${sel.filter.sort==='project'?'selected':''}>按楼盘排列</select></label>`:''}</div>${q.private?`<div class="quality-stories">${sel.pageRows.map(F.card).join('')||'<p class="ops-notice">当前主题下暂无反馈记录。</p>'}</div><div class="quality-pagination"><span>当前展示${range} · 每页6套，图片保留本页全部原文</span><div><button class="btn" data-ops="quality-page" data-direction="-1" ${sel.filter.page===0?'disabled':''}>上一页</button><span> ${sel.filter.page+1} / ${sel.pages} </span><button class="btn" data-ops="quality-page" data-direction="1" ${sel.filter.page===sel.pages-1?'disabled':''}>下一页</button></div></div>`:`<div class="quality-access"><h4>当前筛选范围面见质量</h4><p>已显示该单店的面见反馈分类、数量和占比；筛选单店后会同步更新。</p></div>`}<details class="quality-classification"><summary>查看主要结果分类汇总</summary><p class="ops-muted">主分类一套只计一次；与上方可重复计数的主题标签口径不同。分类包含现状及阻力信息，不等同于高质量率。</p><div class="quality-primary-list">${Object.entries(Q.labels).map(([k,label])=>`<button data-ops="quality-detail" data-category="${k}" ${q.private?'':'disabled'}><span>${E(label)}</span><b>${t.counts[k]}套 · ${M.pct(t.counts[k],t.total)}</b></button>`).join('')}</div><p class="ops-muted">反馈结果待明确中：原文待补${t.missing}套，已有原文但结果待明确${t.unclear}套。</p></details>${qualityStandards()}</div></div>`;
 }
 function updateQualityPanel(){const panel=document.getElementById('ops-quality-content');if(panel)panel.outerHTML=qualityPanel(currentView);}
 function feedbackCopyText(){const q=qualityData();if(!q?.private)return qualityText();const sel=qualitySelection(currentView,q);return `业主面见 · 真实反馈\n${currentMonth} | ${currentView.name} | 同一房源多次面见，按时间连续呈现\n本页${sel.pageRows.length}套，第${sel.filter.page+1}/${sel.pages}页\n\n`+F.text(sel.pageRows)+'\n\n主题标签表示原文涉及话题，可重复计数。';}
 async function publishQuality(d,month){if(!C.project||!d.housing.length)return;const rows=Q.records(d.housing,d.meetings,d.items,month,d.imports[0]?.as_of),payload=Q.publicSummary(rows,d.imports[0]?.as_of,d.imports[0]?.created_at),old=d.items.find(x=>x.key===month+'|goals|@@company|quality-summary-v1');if(old&&Q.canonical(old.payload)===Q.canonical(payload))return;const saved=await C.saveItem(month,'goals','quality-summary-v1',null,null,payload,old?.updated_at);d.items=d.items.filter(x=>x.key!==saved.key).concat(saved);}
 function taskList(view){return W.ordered(W.allTasks(data()?.items||[],{region:view.region||'',store:view.scope==='store'?(view.store||view.name):''}),chinaToday());}
 function taskCards(view){const tasks=taskList(view).map(t=>{const h=data()?.housing.find(h=>h['房源编号']===t.houseId);return {...t,house:h?[(h['分盘']||h['总盘']),h['房间号']].filter(Boolean).join(' · '):t.house,meetingCheck:h?(M.flag(h['本月是否面见'])?'底表已登记本月面见'+(h['面见时间']?'（'+String(h['面见时间']).slice(0,10)+'）':''):'底表暂无本月面见登记'):''};});return tasks.map(t=>`<article class="ops-task"><div><b>${E(t.title||t.action)}</b><span class="ops-task-status">${W.stateOf(t,chinaToday())}</span></div><p>${E(t.store)} · ${E(t.owner||'负责人待明确')} · ${E(t.due||'时间待明确')}</p>${t.houseId||t.house?`<p>关联房源：${E(t.house||t.houseId)}</p>`:''}<p>${E(t.action)}</p>${t.meetingCheck?`<p class="ops-muted">${E(t.meetingCheck)}；任务是否完成仍需核对实际结果。</p>`:''}<p>最新结果：${E(t.result||'待反馈')}</p><div class="ops-actions"><button class="btn" data-ops="task-result" data-key="${E(t.key)}">更新安排与结果</button></div></article>`).join('')||'<p class="ops-muted">确认现场反馈中的动作后，这里会自动形成跟进记录。</p>';}
 function priorityFacts(view,children){const d=data(),asOf=d?.imports[0]?.as_of||'',days=asOf?new Date(Number(asOf.slice(0,4)),Number(asOf.slice(5,7)),0).getDate():0,elapsed=Number(asOf.slice(8,10)),risks=[];
  for(const t of taskList(view).filter(x=>!W.done(x)).slice(0,3))risks.push(`${t.store}｜${W.stateOf(t,chinaToday())}：${t.action}（${t.owner||'负责人待明确'}，${t.due||'时间待明确'}）`);
  const ranked=children.map(r=>({...r,gap:r._target==null?null:Math.max(0,r._target-r.met)})).sort((a,b)=>(b.gap||0)-(a.gap||0));
  for(const r of ranked){const name=r._level==='group'?r.group:r.store!=='/'?r.store:r.region;if(r._target>0&&days&&r.met/r._target<elapsed/days)risks.push(`${name}：已见${r.met}/${r._target}套，差${r.gap}套，低于自然月时间进度参考；请结合实际排期确认机会。`);else if(r.stock&&r.met===0)risks.push(`${name}：${r.stock}套在售中暂无面见登记，请核实首套机会和邀约卡点。`);}
  const q=qualityData(view);if(q&&!q.pending){if(q.summary.missing)risks.push(`有${q.summary.missing}套已见房源未补反馈，请先补原文。`);if(q.summary.unclear)risks.push(`有${q.summary.unclear}套反馈结果待明确，请核实具体收获及后续动作。`);}
  return risks;
 }
 const REVIEW_FACTS={'2026-10':{
  benchmark:['御翠园店','星河湾店','新天地一店'],
  reminders:['碧云店','仁恒河滨城店','陆家嘴旗舰店','新天地二店','浦东别墅旗舰店'],
  benchmarkReasons:{'御翠园店':'全盘面见率与户型TOP面见率均处于较好水平。','星河湾店':'门店TOP覆盖突出，重点房源经营形成明显结果。','新天地一店':'全盘与户型TOP推进相对均衡，且伴手礼覆盖较高。'},
  reminderReasons:{'碧云店':'全盘与双TOP覆盖均偏低。','仁恒河滨城店':'全盘覆盖偏低，门店TOP与户型TOP均未形成足够覆盖。','陆家嘴旗舰店':'全盘覆盖偏低，门店TOP已有推进，但户型TOP明显不足。','新天地二店':'全盘面见率和户型TOP覆盖仍偏低。','浦东别墅旗舰店':'门店TOP已有推进，但全盘与户型TOP覆盖不足。'},
  opportunity:{septemberMet:205,stillListed:192,continued:50,continuedRate:'26.04%',unmet:142,unmetRate:'73.96%',anyTop:57,topRate:'40.14%',storeTop:20,unitTop:37,offMarket:13,
   regions:[['陆家嘴大区',70,22,6,16],['徐汇大区',27,14,6,8],['黄浦大区',23,10,2,8],['花木大区',14,8,5,3],['滨江古北大区',8,3,1,2]],
   stores:[['星河湾店',21,6,0,6],['陆家嘴旗舰店',18,5,0,5],['徐汇滨江店',14,7,3,4],['陆家嘴金融中心店',14,3,1,2],['尚海湾店',10,4,2,2],['顶级豪宅部',9,3,1,2],['黄浦滨江店',9,1,0,1],['陆家嘴滨江店',8,5,4,1],['复兴香园店',8,5,2,3],['融创滨江壹号院店',7,2,0,2],['御翠园店',4,4,3,1],['浦东别墅旗舰店',4,1,0,1],['碧云店',4,2,1,1],['嘉御庭公馆店',3,3,1,2],['新天地一店',3,2,0,2],['新天地二店',3,2,0,2],['仁恒河滨城店',2,1,1,0],['长宁古北店',1,1,1,0]]},
  november:{
	   company:{marketBaseline:15,storeStretch:26,september:269,target:300},
	   materialPack:'https://liya123156.github.io/gan-en-yue/',
	   qualitative:{
	    goal:'以11月感恩月为契机，把“感恩利他、顾客至上”从文化认知转化为面向全量顾客的主动服务行动；通过多层共识、分层连接、线上感恩表达、在售业主线下面见、伴手礼与专业服务、持续跟进和正向故事运营，让顾客在不同服务阶段感受到丽兹行伙伴的主动、专业与温度，进而深化关系与信任、沉淀可复制的优质服务方式，最终支撑顾客认可、委托、转介绍、市占与成交结果。',
	    online:'全量线上感恩表达100%',whole:'在售业主全盘面见率不低于20%',top:'门店TOP与户型TOP面见率均不低于40%',value:'让顾客持续感受到被记得、被理解和被认真服务'
	   },
	   regions:[['花木大区',4,41,52],['黄浦大区',9,48,63],['陆家嘴大区',7,126,125],['滨江古北大区',2,18,21],['徐汇大区',4,36,39]],
   stores:[
	    ['花木大区','碧云店',1,7,8,'全盘20%／双TOP40%校准'],['花木大区','浦东别墅旗舰店',1,15,16,'全盘20%／双TOP40%校准'],['花木大区','仁恒河滨城店',1,8,15,'全盘20%／双TOP40%校准'],['花木大区','御翠园店',1,11,13,'覆盖线校准＋承接能力'],
	    ['黄浦大区','复兴香园店',3,19,18,'全盘20%／双TOP40%校准'],['黄浦大区','黄浦滨江店',2,15,18,'全盘20%／双TOP40%校准'],['黄浦大区','新天地二店',2,8,14,'全盘20%／双TOP40%校准'],['黄浦大区','新天地一店',2,6,13,'全盘20%／双TOP40%校准'],
	    ['陆家嘴大区','陆家嘴滨江店',2,21,21,'全盘20%／双TOP40%校准'],['陆家嘴大区','陆家嘴金融中心店',1,23,23,'9月峰值＋双TOP40%校准'],['陆家嘴大区','陆家嘴旗舰店',1,24,28,'全盘20%／双TOP40%校准'],['陆家嘴大区','顶级豪宅部',1,22,22,'9月峰值＋双TOP40%校准'],['陆家嘴大区','星河湾店',2,36,31,'覆盖线校准＋承接能力'],
	    ['滨江古北大区','长宁古北店',1,3,5,'全盘20%／双TOP40%校准'],['滨江古北大区','融创滨江壹号院店',1,15,16,'双TOP40%校准＋承接能力'],
	    ['徐汇大区','嘉御庭公馆店',1,4,9,'全盘20%／双TOP40%校准'],['徐汇大区','尚海湾店',2,13,14,'全盘20%／双TOP40%校准'],['徐汇大区','徐汇滨江店',1,19,16,'全盘20%／双TOP40%校准']
   ],
	   strategyActions:[
	    ['目标共识与分层启动',['11月3日全司月会播放感恩月视频，讲清项目价值、行动对象与工具入口。','在店总会、经理会中对齐目标口径、角色责任和支持资源。','单店开展文化研讨，结合真实服务经历形成店面行动共识。','将300套、全盘面见率≥20%、门店TOP与户型TOP面见率≥40%的目标拆到大区、门店、店组、伙伴及具体房源。']],
	    ['日级推动与逐套管理',['每日更新线上感恩覆盖、全盘面见、双TOP面见及礼物触达进度。','按大区、门店、店组公示差距，优先推动TOP房源及未面见业主。','打开到逐套机会池，明确邀约卡点、下一步动作、责任人和完成时间。','面见后及时补录真实反馈，围绕价格、心态、看房条件、委托机会等业务变化持续服务。']],
	    ['物料支持及正反馈收集传播',['发布“感恩相连”服务物料包，统一提供感谢信、电子贺卡、邀约话术、专业资料、礼品库和采购入口。','支持伙伴结合顾客关系与服务阶段个性化选用物料，推动单店完成礼物采购、领用与触达。','全月征集真实服务故事和顾客正向反馈，每周精选传播，形成学习与激励。','月末汇总面见、礼物、反馈及业务变化，完成费用凭证收口并沉淀优秀案例。']]
	   ]
  }
 },
 '2026-11':{
  benchmark:['御翠园店','顶级豪宅部'],
  benchmarkReasons:{
   '御翠园店':'面见规模、目标进度与门店TOP覆盖均处于当前全司前列，说明目标已转化为重点房源面见行动。',
   '顶级豪宅部':'面见量位列全司第二；单店启动较早，店总在启动会上即完成目标共识，并带动形成在售房源邀约面见氛围。'
  }
 }
 };
 const managerName=row=>['company','region','store'].includes(row?._level)?'—':root.WBManagerDirectory?.lookup(row)||'待补充';
 const reviewNumber=value=>Number(value||0).toLocaleString('zh-CN');
 function reviewRowName(row){return row._level==='company'?'全司':row._level==='region'?row.region:row._level==='store'?row.store:row._level==='group'?row.group:row.name;}
 function reviewLevelName(level){return {company:'全司',region:'大区',store:'门店',group:'店组',advisor:'顾问'}[level]||level;}
 function reviewCompletion(row){return row?row._target>0?M.pct(row.met,row._target):'—':'—';}
 function reviewGap(row){return row?row._target>0?Math.max(0,row._target-row.met):null:null;}
 function reviewRoot(progress,view){return progress.rows.find(row=>row._level===view.scope)||progress.rows[0];}
 function reviewChildren(progress,view){if(view.scope==='company')return {primary:progress.rows.filter(x=>x._level==='region'),secondary:progress.rows.filter(x=>x._level==='store')};if(view.scope==='region')return {primary:progress.rows.filter(x=>x._level==='store'),secondary:progress.rows.filter(x=>x._level==='group')};return {primary:progress.rows.filter(x=>x._level==='group'),secondary:[]};}
 function reviewMetricTable(title,rows,kind='progress'){
  if(!rows.length)return '';
  const withManager=rows.some(row=>['group','advisor'].includes(row._level)),full=kind==='progress',headers=full?['层级','组织','目标','面见量','完成率','差距','在售','全盘面见率','面见次数','门店TOP','户型TOP','送礼覆盖']:['层级','组织','面见量','送礼登记','送礼覆盖率'];
  const cells=row=>full?[reviewLevelName(row._level),reviewRowName(row),row._target??'—',row.met,reviewCompletion(row),reviewGap(row)??'—',row.stock,row.met_rate,meetingValue(row),`${row.store_top_met}/${row.store_top_stock} · ${row.store_top_rate}`,`${row.unit_top_met}/${row.unit_top_stock} · ${row.unit_top_rate}`,`${row.gift}/${row.met} · ${row.gift_rate}`]:[reviewLevelName(row._level),reviewRowName(row),row.met,row.gift,row.gift_rate];
  if(withManager)headers.splice(2,0,'经理');
  const displayCells=row=>{const values=cells(row);if(withManager)values.splice(2,0,managerName(row));return values;};
  return `<div class="review-table-card"><h3>${E(title)}</h3><div class="review-table-scroll"><table class="review-tier-table"><thead><tr>${headers.map(x=>`<th>${E(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="review-row-${E(row._level)}">${displayCells(row).map((value,i)=>`<td class="${String(value).includes('%')?'review-percent':''} ${i===1?'review-org-name':''}">${E(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
 }
 // All organizational comparisons use the exact monthly whole-inventory meeting rate.
 // Counts and repeat visits break rate ties; organization names stabilize display only.
 function reviewMonthlyRate(row){const stock=Number(row?.stock),met=Number(row?.met);return Number.isFinite(stock)&&stock>0&&Number.isFinite(met)&&met>=0?met/stock:null;}
 function reviewOrganizationCompare(a,b,descending=true){
  const direction=descending?-1:1,rate=reviewMonthlyRate(a)-reviewMonthlyRate(b);
  return direction*rate||direction*(Number(a.met||0)-Number(b.met||0))||direction*(Number(meetingValue(a)||0)-Number(meetingValue(b)||0))||M.compareRegion(a.region,b.region)||M.compareStore(a.store,b.store)||M.compareGroup(a.group,b.group)||M.compareText(a.name,b.name);
 }
 function reviewOrganizationEqual(a,b){return reviewMonthlyRate(a)===reviewMonthlyRate(b)&&Number(a.met||0)===Number(b.met||0)&&Number(meetingValue(a)||0)===Number(meetingValue(b)||0);}
 function reviewOrganizationRank(rows,limit=3,descending=true,positiveOnly=false){
  const sorted=rows.filter(row=>reviewMonthlyRate(row)!==null&&(!positiveOnly||Number(row.met)>0&&(row._level!=='group'||Number(row.met)>=M.groupBenchmarkMinimum))).sort((a,b)=>reviewOrganizationCompare(a,b,descending));
  let priorRank=0;return sorted.map((row,i)=>{const rank=i&&reviewOrganizationEqual(row,sorted[i-1])?priorRank:i+1;priorRank=rank;return {...row,reviewRank:rank};}).filter(row=>row.reviewRank<=limit);
 }
 // Weekly review approved from dated meeting records, frozen snapshots and Liya's management review.
 // Only aggregate facts are published, and the edition is hidden if the source cohort changes.
 const REVIEW_REGION_WEEKLY={
  asOf:'2026-11-22',periodStart:'2026-11-16',periodEnd:'2026-11-22',region:'陆家嘴大区',met:36,count:43,previousMet:22,
  cohort:[['花木大区',225,36],['陆家嘴大区',524,69],['徐汇大区',189,24],['滨江古北大区',74,22],['黄浦大区',296,36]],
  stores:[['陆家嘴旗舰店',5,13],['陆家嘴滨江店',8,15],['顶级豪宅部',12,18],['陆家嘴金融中心店',4,8],['星河湾店',12,15]],
  groups:[['陆家嘴滨江店A组',0,5],['陆家嘴旗舰店A组',1,5],['陆家嘴旗舰店C组',1,3],['陆家嘴金融中心店A组',0,4],['顶级豪宅部B组',0,3]]
 };
 function reviewRegionAnalysis(rows,asOf='',stores=[]){
  const eligible=rows.filter(row=>reviewMonthlyRate(row)!==null);if(!eligible.length)return null;
  const totalMet=eligible.reduce((n,r)=>n+Number(r.met),0),targetOf=row=>row._target!==null&&row._target!==undefined&&Number.isFinite(Number(row._target))&&Number(row._target)>=0?Number(row._target):null;
  const date=/^20\d{2}-\d{2}-\d{2}$/.test(asOf)?new Date(asOf+'T00:00:00Z'):null,validDate=date&&Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===asOf,pace=validDate?date.getUTCDate()/new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate():null;
  const regions=eligible.map(row=>{const target=targetOf(row),stock=Number(row.stock),met=Number(row.met);return {...row,assessmentTarget:target,targetCoverage:target===null?'待确认':M.pct(target,stock),contribution:M.pct(met,totalMet),completionValue:target>0?met/target:null,remainingGap:target===null?null:Math.max(0,target-met)};}).sort((a,b)=>M.compareRegion(a.region,b.region));
  const allTargetsKnown=regions.every(r=>r.assessmentTarget!==null),totalGap=allTargetsKnown?regions.reduce((n,r)=>n+r.remainingGap,0):null;
  const weekly=asOf===REVIEW_REGION_WEEKLY.asOf&&regions.length===REVIEW_REGION_WEEKLY.cohort.length&&REVIEW_REGION_WEEKLY.cohort.every(([name,stock,met])=>regions.some(r=>r.region===name&&r.stock===stock&&r.met===met))?REVIEW_REGION_WEEKLY:null,observations=[];
  if(weekly){
   observations.push('上周提升：11月16—22日，陆家嘴大区面见'+weekly.met+'套、'+weekly.count+'次，较前一周'+weekly.previousMet+'套增加'+(weekly.met-weekly.previousMet)+'套（'+M.pct(weekly.met-weekly.previousMet,weekly.previousMet)+'）；月累计由41套增至69套，净增28套。');
   observations.push('主要提升门店：'+weekly.stores.map(([store,before,after])=>store+'月累计'+before+'→'+after+'套（增加'+(after-before)+'套）').join('；')+'。');
   observations.push('主要提升店组：'+weekly.groups.map(([name,before,after])=>name+'单周'+before+'→'+after+'套').join('；')+'。顶级豪宅部D组上周面见6套，是主要出量店组之一。');
   observations.push('可借鉴的管理做法：目标分解与房源供应链经营结合，每日外显目标进度和活动量，固定开展日、周复盘；店总、经理持续关注重点房源邀约，逐套讨论卡点。结合BP复盘和本次管理反馈，这些持续的管理动作是陆家嘴提升的重要推动因素。');
  }else if(totalMet>0){
   const maxMet=Math.max(...regions.map(r=>Number(r.met))),volume=regions.filter(r=>Number(r.met)===maxMet);
   observations.push('面见量贡献：'+volume.map(r=>r.region+' '+r.met+'套，占全司'+r.contribution+'；月度目标'+(r.assessmentTarget??'待确认')+'套，完成'+reviewCompletion(r)).join('；')+'。');
   observations.push('提升原因要看到具体门店和店组：结合本期面见明细与上期复盘，查看哪些组织增加、店总和经理做了什么，再提炼可借鉴的管理做法。');
  }else observations.push('当前尚无面见登记，先核对各区目标、重点房源与实际邀约情况。');
  const reminder=[],gaps=regions.filter(r=>r.remainingGap>0).sort((a,b)=>b.remainingGap-a.remainingGap||M.compareRegion(a.region,b.region)).slice(0,2);
  const focused=weekly?['滨江古北大区','黄浦大区','徐汇大区'].map(name=>regions.find(r=>r.region===name)).filter(r=>r&&Number(r.store_top_head_met_base)>0&&Number.isFinite(r.store_top_head_met_confirmed)&&r.store_top_head_met_pending===0):regions.filter(r=>Number(r.store_top_head_met_base)>0&&r.store_top_head_met_confirmed===0&&r.store_top_head_met_pending===0);
  if(focused.length){
   reminder.push('TOP房分层管理：'+focused.map(r=>r.region+'店总陪同门店TOP '+r.store_top_head_met_confirmed+'/'+r.store_top_head_met_base+'套（'+M.pct(r.store_top_head_met_confirmed,r.store_top_head_met_base)+'）').join('、')+'。需要逐套查清：系统TOP标签是否准确，伙伴是否漏录或错录，店总是否围绕TOP房重点管理并亲自陪同面见。');
   reminder.push((weekly?'本周二（11月24日）':'本周')+'，BP与店总逐店核实。若实际未落实分层管理，要共识店总负责门店TOP、经理负责户型TOP及七必卖，确定重点房源、亲自陪同安排和改进动作。');
  }
  reminder.push('双TOP逐套跟进：BP提供门店TOP、户型TOP未面见明细，店总、经理每天在房商机或固定沟通时间逐套打开房源，讨论邀约卡点、需要的支持和下一步面见安排。店总每天看目标、看进度、看差距，形成日复盘、日跟进。');
  if(gaps.length)reminder.push('月度目标还差：'+gaps.map(r=>r.region+r.remainingGap+'套').join('、')+'。将本周目标落实到各店、店组和具体房源，每日更新进度，及时协调需要的管理支持。');
  if(!allTargetsKnown)reminder.push('部分大区月度目标尚未完整，先核对目标，再确认完成进度。');
  return {regions,totalMet,totalGap,pace,weekly,observations,reminder};
 }
 function reviewRegionAnalysisText(rows,asOf='',stores=[]){
  const d=reviewRegionAnalysis(rows,asOf,stores);if(!d)return '';
  const comparison=d.regions.map(r=>r.region+'：目标'+(r.assessmentTarget??'待确认')+'套／在售'+r.stock+'套，目标覆盖率'+r.targetCoverage+'；面见'+r.met+'套、全司贡献'+r.contribution+'；目标完成'+reviewCompletion(r)+'、尚差'+(r.remainingGap??'待确认')+'套；门店TOP '+r.store_top_rate+'、户型TOP '+r.unit_top_rate+'。').join('\n');
  return '五大区多维对照：\n'+comparison+'\n\n结果观察：\n'+d.observations.join('\n')+'\n\n重点跟进：\n'+d.reminder.join('\n')+'\n\n目标覆盖率＝月度目标÷在售套数；面见贡献＝本区面见量÷全司面见量。综合标杆需要经核实的管理动作、顾客反馈与业务变化支撑。';
 }
 function reviewRegionAnalysisHtml(rows,asOf='',stores=[]){
  const d=reviewRegionAnalysis(rows,asOf,stores);if(!d)return '';
  const table=reviewDetailTable('五大区多维对照',['大区','目标／在售','目标覆盖率','面见量／全司贡献','完成率／剩余差距','门店TOP／户型TOP'],d.regions.map(r=>[r.region,(r.assessmentTarget??'待确认')+'／'+r.stock+'套',r.targetCoverage,r.met+'套／'+r.contribution,reviewCompletion(r)+'／'+(r.remainingGap??'待确认')+'套',r.store_top_rate+'／'+r.unit_top_rate]));
  return '<div class="review-region-analysis"><h3>区域表现分析</h3><p class="review-footnote">结合目标进展、上周提升和具体管理做法，看到门店、店组；重点跟进TOP房分层管理。</p>'+table+'<div class="review-region-analysis-grid"><article><span>结果观察</span>'+d.observations.map(x=>'<p>'+E(x)+'</p>').join('')+'</article><article class="reminder"><span>重点跟进</span>'+d.reminder.map(x=>'<p>'+E(x)+'</p>').join('')+'</article></div><p class="review-footnote">目标覆盖率＝月度目标÷在售套数；面见贡献＝本区面见量÷全司面见量。店总陪同比例按本月最近一次面见记录统计。</p></div>';
 }
 function reviewProgressHtml(ctx){
  const r=ctx.root,c=reviewChildren(ctx.progress,ctx.view),target=r._target,completion=reviewCompletion(r),gap=reviewGap(r),average=r.met?`${(r.met_count/r.met).toFixed(2)}次`:'—';
  const primaryTable=reviewMetricTable(ctx.view.scope==='company'?'五大区结果对比':ctx.view.scope==='region'?'区域内各门店结果':'店内各组结果',c.primary),regionAnalysis=ctx.view.scope==='company'?reviewRegionAnalysisHtml(c.primary,ctx.d.imports[0]?.as_of||'',c.secondary):'',secondaryTable=reviewMetricTable(ctx.view.scope==='company'?'18家门店完整结果':'店内各组结果',c.secondary);
  return `<div class="review-report"><div class="review-summary-grid">${[['月度目标',target==null?'待确认':reviewNumber(target)+'套','按当月确认目标'],['面见量',reviewNumber(r.met)+'套','按房源去重'],['目标完成率',completion,'完成进度'],['目标差距',gap==null?'—':reviewNumber(gap)+'套','距目标'],['当前在售',reviewNumber(r.stock)+'套','当前底表在售'],['全盘面见率',r.met_rate,'面见量/在售'],['面见次数',meetingValue(r)+'次',meetingLabel(r)],['平均每套面见',average,'面见次数/面见量'],['门店TOP',`${r.store_top_met}/${r.store_top_stock}套`,`${r.store_top_rate} · ${M.meetingCountValue?M.meetingCountValue(r,'store_top_met_count'):r.store_top_met_count}次`],['户型TOP',`${r.unit_top_met}/${r.unit_top_stock}套`,`${r.unit_top_rate} · ${M.meetingCountValue?M.meetingCountValue(r,'unit_top_met_count'):r.unit_top_met_count}次`]].map(([label,value,note])=>`<article class="review-summary-card"><span>${E(label)}</span><strong class="${String(value).includes('%')?'review-percent':''}">${E(value)}</strong><small>${E(note)}</small></article>`).join('')}</div><div class="review-callout"><strong>结果判断</strong><p>${E(target>0?`本月完成${r.met}套，目标完成率${completion}，距离目标还差${gap}套；门店TOP面见率${r.store_top_rate}，户型TOP面见率${r.unit_top_rate}。`:`本月完成${r.met}套，全盘面见率${r.met_rate}；当前范围未设置独立目标。`)}</p></div>${primaryTable}${regionAnalysis}${secondaryTable}</div>`;
 }
 const reviewRate=value=>Number.parseFloat(String(value))||0;
 function reviewGiftRows(ctx){const level=ctx.view.scope==='store'?'group':'store';return ctx.progress.rows.filter(row=>row._level===level);}
 function reviewGiftAnalysis(ctx){const r=ctx.root,rows=reviewGiftRows(ctx),eligible=rows.filter(row=>row.met>0),ranked=[...eligible].sort((a,b)=>reviewRate(b.gift_rate)-reviewRate(a.gift_rate)||b.gift-a.gift||b.met-a.met),top=ranked.slice(0,Math.min(2,ranked.length)),topNames=new Set(top.map(reviewRowName)),low=[...eligible].filter(row=>!topNames.has(reviewRowName(row))).sort((a,b)=>reviewRate(a.gift_rate)-reviewRate(b.gift_rate)||b.met-a.met).slice(0,2),zero=eligible.filter(row=>row.gift===0),detail=row=>`${reviewRowName(row)}（送礼${row.gift}套/已面见${row.met}套，覆盖率${row.gift_rate}）`,coverage=reviewRate(r.gift_rate),judgement=coverage>=70?'伴手礼已较稳定地嵌入面见服务。':coverage>=50?'伴手礼已在多数面见中形成覆盖，但组织之间仍有差异。':coverage>=40?'伴手礼已在部分组织形成稳定动作，但整体覆盖仍不足一半。':'伴手礼尚未稳定嵌入面见服务，组织之间的执行差异较明显。';return `当前范围已面见${r.met}套，伴手礼登记${r.gift}套，覆盖率${r.gift_rate}。${top.length?`覆盖较高的是${top.map(detail).join('、')}。`:''}${low.length?`覆盖相对较低的是${low.map(detail).join('、')}。`:''}${zero.length?`其中${zero.length}个组织已有面见但伴手礼覆盖为0。`:''}${judgement}伴手礼不单独代表面见质量，但可以反映情感连接是否融入日常业主经营。`;}
 function reviewGiftHtml(ctx){const r=ctx.root,rows=reviewGiftRows(ctx);return `<div class="review-report"><div class="review-summary-grid compact">${[['送礼登记',reviewNumber(r.gift)+'套'],['已见覆盖',r.gift_rate],['未送礼面见',reviewNumber(Math.max(0,r.met-r.gift))+'套']].map(([label,value])=>`<article class="review-summary-card"><span>${E(label)}</span><strong class="${String(value).includes('%')?'review-percent':''}">${E(value)}</strong></article>`).join('')}</div><div class="review-callout warm"><strong>从数据看伴手礼覆盖</strong><p>${E(reviewGiftAnalysis(ctx))}</p></div>${reviewMetricTable('各组织面见伴手礼覆盖',rows,'gift')}</div>`;}
 function reviewQualityGroup(ctx,row){const groups=ctx.quality?.groups||[];if(row._level===ctx.view.scope&&reviewRowName(row)===ctx.view.name)return ctx.quality?.summary;return groups.find(x=>x.scope===row._level&&(!row.region||x.region===row.region)&&(!row.store||row.store==='/'||x.store===row.store)&&(!row.group||row.group==='/'||x.group===row.group));}
 function reviewThemeAnalysis(topics,t){if(!t.total)return '当前范围暂无已面见房源，暂不能形成业务主题判断。';const byKey=Object.fromEntries(topics.map(x=>[x.key,x])),metric=key=>byKey[key]?`${byKey[key].label}${byKey[key].count}套（${M.pct(byKey[key].count,t.total)}）`:'' ,core=['P','M'].map(metric).filter(Boolean),forward=['R','V','E'].map(metric).filter(Boolean),corePeak=Math.max(Number(byKey.P?.count||0),Number(byKey.M?.count||0)),forwardPeak=Math.max(Number(byKey.R?.count||0),Number(byKey.V?.count||0),Number(byKey.E?.count||0)),feedbackRate=t.total?t.feedback/t.total:0,coverageNote=feedbackRate>=.8?'已能较完整地反映本月面见后的业务进展。':feedbackRate>=.5?'可以观察当前面见的主要业务倾向，仍需结合未录入反馈的房源判断。':'当前反馈样本仍有限，以下结论仅反映已录入房源。';let text=`当前已面见${t.total}套，其中${t.feedback}套录入反馈原文，覆盖率${M.pct(t.feedback,t.total)}，${coverageNote}`;if(core.length)text+=`${core.join('、')}，说明较多面见已经触及价格预期、出售意愿等业主核心决策信息。`;if(forward.length)text+=`${forward.join('、')}。`;if(corePeak>forwardPeak)text+='整体看，“了解业主信息”的动作明显多于连接具体客户、推动看房及形成委托的结果；从信息获取进一步转为可执行的业务机会，仍是下一阶段需要打开的空间。';else text+='当前反馈已经同时覆盖业主核心信息与具体客户、看房或委托进展，可继续沿逐套房源沉淀可复制做法。';return text;}
 function reviewQualityPanel(view){return '<details class="review-feedback-source"><summary>查看逐房面见反馈原文</summary>'+qualityPanel(view).replace(/<details class="quality-classification">[\s\S]*?<\/details>/,'')+'</details>';}
 function reviewQualityHtml(ctx){const q=ctx.quality,t=q?.summary||Q.summary([]),topics=Object.entries(F.labels).map(([key,label])=>({key,label,count:Number(t.topics?.[key]||0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count),c=reviewChildren(ctx.progress,ctx.view),orgRows=[...c.primary,...c.secondary].map(row=>({row,q:reviewQualityGroup(ctx,row)})).filter(x=>x.q);

  return `<div class="review-report"><div class="review-summary-grid compact">${[['已面见',t.total+'套'],['有反馈原文',t.feedback+'套'],['反馈覆盖率',M.pct(t.feedback,t.total)],['原文待补',t.missing+'套']].map(([label,value])=>`<article class="review-summary-card"><span>${E(label)}</span><strong class="${String(value).includes('%')?'review-percent':''}">${E(value)}</strong></article>`).join('')}</div><div class="review-analysis-grid single"><article class="review-analysis-card"><h3>业务经营主题</h3><p>同一套房可同时涉及多个主题，按房源去重后从高到低呈现。</p>${topics.map(x=>`<div class="review-analysis-row"><span>${E(x.label)}</span><b>${x.count}套</b><em class="review-percent">${M.pct(x.count,t.total)}</em></div>`).join('')||'<p>暂无主题数据</p>'}</article></div><div class="review-callout"><strong>从主题数据看业务转化</strong><p>${E(reviewThemeAnalysis(topics,t))}</p></div>${ctx.view.scope==='store'?`<div class="review-source-detail"><h3>本店逐套面见反馈</h3>${reviewQualityPanel(ctx.view)}</div>`:''}</div>`;
 }
 function reviewStoreRows(ctx){return ctx.progress.rows.filter(x=>x._level==='store');}
 function reviewTopAverage(row){const rates=[];if(row.store_top_stock>0)rates.push(reviewRate(row.store_top_rate));if(row.unit_top_stock>0)rates.push(reviewRate(row.unit_top_rate));return rates.length?rates.reduce((sum,x)=>sum+x,0)/rates.length:null;}
 function reviewRankScore(row){const top=reviewTopAverage(row);return reviewRate(row.met_rate)*.55+(top==null?reviewRate(row.met_rate):top)*.45;}

 function reviewWarningCompare(a,b){return reviewOrganizationCompare(a,b,false);}
 function reviewNovemberWarningCandidates(rows){return rows.filter(row=>reviewMonthlyRate(row)!==null).sort(reviewWarningCompare);}
 function reviewCompanySource(ctx){
  const catalog=M.storeCatalog.filter(row=>row.ownerApplicable!==false),complete=source=>Array.isArray(source?.housing)&&catalog.every(row=>source.housing.some(h=>canonicalStore(h['门店'])===row.store));
  return complete(ctx.d)?ctx.d:complete(ctx.d.companyProgress)?ctx.d.companyProgress:null;
 }
 function reviewCompanyStoreRows(ctx){
  const company=reviewCompanySource(ctx);if(!company)return [];
  if(!ctx.warningCompanyRows)ctx.warningCompanyRows=M.table(company.housing,{},goals(),currentMonth,company.meetings||[],customerOptions(company)).rows.filter(row=>row._level==='store');
  return ctx.warningCompanyRows;
 }
 // Published case studies are an editorial selection for this month's review.
 // They do not change the numerical rate rankings or expose private BP drafts.
 const REVIEW_APPROVED_PRACTICES={'2026-11':[
  {region:'花木大区',store:'御翠园店',title:'目标与房商机咬合，带动面见动作落地',paragraphs:['御翠园店A组面见量有所提升，背后的关键是大区总直接跟进门店的房商机，带动经理从业务目标和房源推进的角度思考，再将房商机落实到具体的面见动作上。经理在认知和行动上的承接，让目标与面见形成了关联。值得借鉴的是，围绕房源要实现的业务目标，思考面见能够解决什么问题、推动什么进展，让经理清楚面见的价值，并主动组织行动。']},
  {region:'滨江古北大区',store:'融创滨江壹号院店',title:'把用心准备，转化为顾客感受到的服务',paragraphs:['伙伴主动在上海联系果园，开车采摘应季水果，包装后作为伴手礼送给顾客，收获了顾客认可。这一做法的价值，在于将时令、新意和伙伴亲自准备的心意融入服务。其他门店可以借鉴提前联系、按需准备的方式，结合自身顾客特点选择礼品，让伴手礼成为自然连接和沟通的契机。']},
  {region:'黄浦大区',store:'复兴香园店',title:'店总主动带动，让面见形成店内氛围',paragraphs:['亮点是店内面见氛围较浓、店总带动较好。值得借鉴的是管理者主动关注面见，把伙伴的服务行动和正反馈及时分享出来，让伙伴感受到这件事受到重视，也让主动服务业主的伙伴被看见、被认可。']}
 ]};
 function reviewPracticeEdition(ctx){return REVIEW_APPROVED_PRACTICES[currentMonth]||null;}
 function reviewApprovedPractice(ctx,row){return row&&(reviewPracticeEdition(ctx)||[]).find(entry=>entry.store===row.store&&entry.region===row.region)||null;}
 function reviewHighlightSets(ctx){
  const sets=reviewRankSets(ctx),edition=reviewPracticeEdition(ctx);if(!edition)return sets;
  const inView=entry=>(ctx.view.scope!=='region'||entry.region===ctx.view.region)&&(ctx.view.scope!=='store'||entry.store===(ctx.view.store||ctx.view.name)),rows=reviewStoreRows(ctx),bench=edition.filter(inView).map(entry=>rows.find(row=>row.store===entry.store&&row.region===entry.region)).filter(Boolean);
  return {...sets,bench:sets.single?[]:bench,practiceEdition:true};
 }
 function reviewRankSets(ctx){
  const rows=reviewStoreRows(ctx);if(ctx.view.scope==='store')return {bench:[],remind:[],single:ctx.root};
  const limit=ctx.view.scope==='region'?1:3,bench=reviewOrganizationRank(rows,limit,true,true),benchNames=new Set(bench.map(row=>row.store));
  return {bench,remind:reviewOrganizationRank(rows,limit,false).filter(row=>!benchNames.has(row.store)),single:null,focus:''};
 }
 function reviewGroupSets(ctx){
  const global=reviewCompanySource(ctx),source=global||ctx.d,table=M.table(source.housing,{},goals(),currentMonth,source.meetings||[],{...customerOptions(source),includeAllLevels:true}),stores=new Map(table.rows.filter(row=>row._level==='store').map(row=>[row.store,row]));
  const valid=group=>!['','/','—','-','未分组','未填写','待补充'].includes(M.text(group)),groups=table.rows.filter(row=>row._level==='group'&&Number(row.stock)>0&&valid(row.group)).map(row=>({...row,storeStock:Number(stores.get(row.store)?.stock||0),stockShare:stores.get(row.store)?.stock>0?row.stock/stores.get(row.store).stock:0}));
  const inView=row=>(!ctx.s.region||row.region===ctx.s.region)&&(!ctx.s.store||row.store===ctx.s.store);
  return {benchmarkReady:!!global,benchmark:global?reviewOrganizationRank(groups,5,true,true):[],slow:groups.filter(row=>inView(row)&&row.storeStock>0&&row.stock*4>=row.storeStock&&Number(row.met)===0).sort((a,b)=>b.stockShare-a.stockShare||b.stock-a.stock||reviewOrganizationCompare(a,b,false))};
 }
 // Reuse only records already returned by the signed-in store-review API. The
 // selected review period stays separate from the monthly organization ranking.
 function reviewSavedMeetingRecord(ctx,row,group=row?._level==='group'){
  const reviews=root.WBStoreReviews,rs=reviews?.state,member=C.member,binding=state.reviewNotesReaders.get(currentMonth),cache=rs?.cache?.get(currentMonth),context=rs?.context;
  if(!member||binding!==member||!context||context.month!==currentMonth||rs.actor!==(member.login_id||member.display_name||'guest')||cache?.loading||cache?.error)return null;
  if(context.privateData&&context.privateData.reader!==member)return null;
  const period=reviews.selectedPeriod?.(context);if(!period)return null;
  const catalog=M.storeCatalog.find(entry=>entry.ownerApplicable!==false&&entry.store===row.store&&entry.region===row.region);if(!catalog)return null;
  const sameGroup=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toUpperCase(),groupName=item=>item.group||item.payload?.group||'',records=(cache?.items||[]).filter(item=>item.kind==='review'&&item.month===currentMonth&&item.store===row.store&&item.region===row.region&&item.payload?.recordType==='store-period-review'&&item.payload.periodType===period.periodType&&item.payload.periodStart===period.periodStart&&item.payload.periodEnd===period.periodEnd);
  const record=group?(records.find(item=>groupName(item)&&sameGroup(groupName(item))===sameGroup(row.group))||records.find(item=>!groupName(item))):records.find(item=>!groupName(item));
  const fields=record?.payload?.fields;if(!fields||!['highlights','blockers','nextActions'].some(key=>String(fields[key]||'').trim()))return null;
  return {record,fields,period};
 }
 function reviewReportParagraphs(value){
  return String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^(?:已保存草稿|待BP确认|访谈待核实|周会复盘与本周安排|已确认复盘)(?:[，。；：:\s]|$)/.test(line.replace(/^[•●-]\s*/,''))).map(line=>line.replace(/(?:[（(]\s*)?(?:已保存草稿(?:[，,\s]+待BP确认)?|待BP确认|访谈待核实)(?:\s*[）)])?/g,'').trim()).filter(Boolean);
 }
 function reviewScopedReportField(saved,field,row,group){
  if(!saved)return [];const raw=String(saved.fields[field]||''),recordGroup=saved.record.group||saved.record.payload?.group||'',normalize=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toUpperCase();
  if(recordGroup&&(!group||normalize(recordGroup)!==normalize(row.group)))return [];
  const ownStore=normalize(M.canonicalStore(row.store)),stores=new Set(M.storeCatalog.map(entry=>normalize(M.canonicalStore(entry.store)))),aliases=new Set(['门店','全店','本店','店面']),expected=group?normalize(row.group):ownStore,result=[];
  // A group-specific record permits its unlabelled prose, but every subsequent
  // store/group heading still changes scope and is checked before text is used.
  let section=recordGroup?expected:group?'':ownStore;
  for(const line of raw.split(/\r?\n/)){
   const match=line.match(/^\s*(?:【([^】]+)】|\[([^\]]+)\]|([^：:]+)\s*[：:])\s*(.*)$/),label=match&&normalize(match[1]||match[2]||match[3]),storeLabel=label&&(aliases.has(label)?ownStore:normalize(M.canonicalStore(label))),isStore=label&&(aliases.has(label)||stores.has(storeLabel)),isGroup=label&&/组$/.test(label);
   if(isStore||isGroup){section=isStore?storeLabel:label;if(section===expected&&match[4]?.trim())result.push(match[4].trim());continue;}
   if(section===expected)result.push(line);
  }
  // Store-wide text and other organizations' sections never become group results.
  return reviewReportParagraphs(result.join('\n'));
 }
 function reviewOrganizationRoles(row,group){
  const manager=root.WBManagerDirectory?.lookup(row),lead=group?`${manager?manager+'经理':'本组经理'}牵头本组承接与分工，组织全员逐套落实邀约；`:'';
  return lead+'店总牵头门店TOP并亲自邀约、面见关键业主，关键户型TOP也可亲自参与；经理负责户型TOP与七必卖，顾问负责非七必卖。逐套明确承接伙伴、邀约时间与复查节点。';
 }
 function reviewReportSections(ctx,row,tone='benchmark',group=false){
  const saved=reviewSavedMeetingRecord(ctx,row,group),field=name=>reviewScopedReportField(saved,name,row,group),coverage=`${group?'本组':'本店'}在售${row.stock}套，已面见${row.met}套，全盘面见率${row.met_rate}。`,unique=lines=>[...new Set(lines.filter(Boolean))];
  if(tone==='benchmark'){const approved=!group&&reviewApprovedPractice(ctx,row);if(approved)return [{title:'标杆萃取｜'+approved.title,paragraphs:[...approved.paragraphs]}];const highlights=field('highlights');return highlights.length?[{title:'有效做法与可借鉴之处',paragraphs:highlights}]:[];}
  if(tone==='reminder'){
   let analysis=coverage;
   if(group&&Number(row.met)===0&&row.storeStock>0&&row.stock*4>=row.storeStock)analysis=`本组在售${row.stock}套，占本店${M.pct(row.stock,row.storeStock)}（${row.stock}/${row.storeStock}套），本月0面见。门店四分之一以上的在售资源尚未形成面见覆盖，组织突破点是经理承接、组内分工与全员邀约。`;
   else if(!group){const zero=reviewStoreDetail(ctx,row).filter(item=>item._level==='group'&&Number(item.stock)>0&&Number(item.met)===0&&Number(item.stock)*4>=Number(row.stock));if(zero.length)analysis+=zero.map(item=>`${item.group}在售${item.stock}套，占本店${M.pct(item.stock,row.stock)}，本月0面见`).join('；')+'。需将门店推动进一步落实到经理承接、组内分工与全员邀约。';}
   const focus=field('nextActions'),joined=focus.join(''),hasRoles=['店总牵头门店TOP','经理负责户型TOP与七必卖','顾问负责非七必卖'].every(term=>joined.includes(term));
   return [{title:'组织卡点分析',paragraphs:unique([analysis,...field('blockers')])},{title:'推动重点',paragraphs:unique([...focus,...(!hasRoles?[reviewOrganizationRoles(row,group)]:[])])}];
  }
  const sections=[];if(field('highlights').length)sections.push({title:'有效做法与可借鉴之处',paragraphs:field('highlights')});if(field('blockers').length)sections.push({title:'组织卡点分析',paragraphs:[coverage,...field('blockers')]});if(field('nextActions').length)sections.push({title:'推动重点',paragraphs:field('nextActions')});return sections;
 }
 function reviewSavedNotesText(ctx,row,group=false,tone='benchmark'){return reviewReportSections(ctx,row,tone,group).map(section=>section.title+'\n'+section.paragraphs.join('\n')).join('\n\n');}
 function reviewSavedNotesHtml(ctx,row,group=false,tone='benchmark'){return reviewReportSections(ctx,row,tone,group).map(section=>`<div class="review-meeting-notes"><p><b>${E(section.title)}</b></p>${section.paragraphs.map(line=>`<p>${E(line)}</p>`).join('')}</div>`).join('');}
 function updateReviewMeetingHighlights(){
  if(currentMode!=='review'||currentMonth<'2026-11')return;const host=document.getElementById('ops-review-highlights-content');if(!host)return;const ctx=reviewContext(currentView);if(ctx)host.innerHTML=reviewHighlightsHtml(ctx);
 }
 function reviewCloudForHighlights(){
  const cloud=Object.create(C);cloud.storeReview=async(action,args={})=>{const member=C.member,month=currentMonth,result=await C.storeReview(action,args);if(['load','save'].includes(action))setTimeout(()=>{if(C.member!==member||currentMonth!==month||args.month!==month)return;if(action==='load')state.reviewNotesReaders.set(month,member);updateReviewMeetingHighlights();},0);return result;};return cloud;
 }
 function reviewGroupAnalysisText(ctx){
  const sets=reviewGroupSets(ctx),describe=row=>`${row.group}｜经理${managerName(row)}：面见${row.met}/${row.stock}套，面见率${row.met_rate}；在售占本店${M.pct(row.stock,row.storeStock)}（${row.stock}/${row.storeStock}套）`;
  return `标杆店组｜全司店组排名TOP5（月度面见至少${M.groupBenchmarkMinimum}套，按全盘面见率排序）：\n${sets.benchmarkReady?sets.benchmark.map(row=>`第${row.reviewRank}名 ${describe(row)}${reviewSavedNotesText(ctx,row,true,'benchmark')?'\n'+reviewSavedNotesText(ctx,row,true,'benchmark'):''}`).join('\n')||'当前暂无达到'+M.groupBenchmarkMinimum+'套入选门槛的店组。':'全司18家门店数据未完整，暂不生成全司排名。'}\n\n进展偏慢店组｜在售占本店≥25%且本月0面见：\n${sets.slow.map(row=>describe(row)+(reviewSavedNotesText(ctx,row,true,'reminder')?'\n'+reviewSavedNotesText(ctx,row,true,'reminder'):'')).join('\n')||'当前范围暂无符合条件的店组。'}`;
 }
 function reviewGroupAnalysisHtml(ctx){
  const sets=reviewGroupSets(ctx),table=(title,rows,benchmark)=>`<div class="review-table-card"><h3>${E(title)}</h3><div class="review-table-scroll"><table class="review-tier-table" aria-label="${E(title)}"><thead><tr>${benchmark?'<th>排名</th>':''}<th>大区</th><th>门店</th><th>店组</th><th>经理</th><th>面见量／在售</th><th>全盘面见率</th><th>在售占本店</th></tr></thead><tbody>${rows.map(row=>`<tr>${benchmark?`<td>${row.reviewRank}</td>`:''}<td>${E(row.region)}</td><td>${E(row.store)}</td><td>${E(row.group)}</td><td>${E(managerName(row))}</td><td>${row.met}/${row.stock}套</td><td>${E(row.met_rate)}</td><td>${E(M.pct(row.stock,row.storeStock))}（${row.stock}/${row.storeStock}套）</td></tr>`).join('')}</tbody></table></div></div>`;
  const benchmark=sets.benchmarkReady?sets.benchmark.length?table('标杆店组｜全司店组排名TOP5',sets.benchmark,true):'<p class="ops-muted">当前暂无达到'+M.groupBenchmarkMinimum+'套入选门槛的店组。</p>':'<p class="ops-notice">全司18家门店数据未完整，暂不生成全司店组排名。</p>';
  const slow=sets.slow.length?table('进展偏慢店组',sets.slow,false):'<p class="ops-muted">当前范围暂无符合“在售占本店≥25%且本月0面见”的店组。</p>';
  const notes=(rows,tone)=>rows.map(row=>{const note=reviewSavedNotesHtml(ctx,row,true,tone);return note?`<article class="review-rank-card ${tone}"><span>${E(row.group)}</span>${note}</article>`:'';}).join('');
  return `<div class="review-group-analysis"><div class="review-subhead"><h3>店组表现分析</h3><p>标杆店组月度面见至少${M.groupBenchmarkMinimum}套，再按全司月度全盘面见率排序；同率依次看面见套数、面见次数，相同保留并列，达标不足5组按实际数量展示。进展偏慢店组须同时满足“店组在售套数÷本店在售套数≥25%”与“本月累计0面见”。</p></div>${benchmark}<div class="review-rank-grid">${notes(sets.benchmark,'benchmark')}</div>${slow}<div class="review-rank-grid">${notes(sets.slow,'reminder')}</div></div>`;
 }
 function reviewStoreDetail(ctx,row){if(!ctx.reviewStoreDetails)ctx.reviewStoreDetails=new Map();if(!ctx.reviewStoreDetails.has(row.store))ctx.reviewStoreDetails.set(row.store,M.table(ctx.d.housing,{region:row.region,store:row.store},goals(),currentMonth,ctx.d.meetings||[],customerOptions(ctx.d)).rows);return ctx.reviewStoreDetails.get(row.store);}
 function reviewTopTopics(ctx,row,limit=2){const q=reviewQualityGroup(ctx,row);return Object.entries(F.labels).map(([key,label])=>({label,count:Number(q?.topics?.[key]||0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,limit).map(x=>`${x.label}${x.count}套`);}
 function reviewGroupLabel(row,group,detail){const leaders={'御翠园店|御翠园店C组':'宋春杰团队'},special=leaders[`${row.store}|${group.group}`],advisors=detail.filter(x=>x._level==='advisor'&&x.group===group.group&&x.met>0).sort((a,b)=>b.met-a.met).slice(0,1).map(x=>x.name),people=special||advisors.length?special||`${advisors.join('、')}等伙伴`:'';return `${group.group}${people?`（${people}）`:''}`;}
 function reviewStoreInsight(ctx,row,tone){const detail=reviewStoreDetail(ctx,row),groups=detail.filter(x=>x._level==='group'&&x.stock>0);if(!groups.length)return '当前门店暂无可下钻的店组数据。';if(tone!=='reminder'){const lead=[...groups].sort((a,b)=>reviewOrganizationCompare(a,b,true))[0],topLead=[...groups].sort((a,b)=>(b.store_top_met+b.unit_top_met)-(a.store_top_met+a.unit_top_met)||reviewTopAverage(b)-reviewTopAverage(a))[0],topics=reviewTopTopics(ctx,lead),share=M.pct(lead.met,row.met);let text=`下钻到店组，${reviewGroupLabel(row,lead,detail)}贡献${lead.met}套，占全店面见量${share}；该组全盘面见${lead.met}套/在售${lead.stock}套，面见率${lead.met_rate}。`;if(topLead&&(topLead.store_top_met+topLead.unit_top_met)>0){if(topLead.group===lead.group)text+=`该组门店TOP面见${topLead.store_top_met}套/${topLead.store_top_stock}套，户型TOP面见${topLead.unit_top_met}套/${topLead.unit_top_stock}套。`;else text+=`TOP房推进以${reviewGroupLabel(row,topLead,detail)}更突出：门店TOP面见${topLead.store_top_met}套/${topLead.store_top_stock}套，户型TOP面见${topLead.unit_top_met}套/${topLead.unit_top_stock}套。`;}if(topics.length)text+=`反馈主要涉及${topics.join('、')}。`;return text;}const zero=[...groups].filter(x=>x.met===0).sort((a,b)=>b.stock-a.stock),weak=(zero.length?zero:[...groups].sort((a,b)=>reviewOrganizationCompare(a,b,false))).slice(0,2);if(zero.length){const stock=weak.reduce((sum,x)=>sum+x.stock,0),storeTopStock=weak.reduce((sum,x)=>sum+x.store_top_stock,0),unitTopStock=weak.reduce((sum,x)=>sum+x.unit_top_stock,0),topNote=storeTopStock||unitTopStock?`这些组包含门店TOP ${storeTopStock}套、户型TOP ${unitTopStock}套，当前同样尚未形成面见。`:'这些组当前无TOP房源，主要影响全盘覆盖，不直接用于判断TOP短板。';return `从数据下钻看，当前低覆盖主要集中在${weak.map(x=>reviewGroupLabel(row,x,detail)).join('、')}：合计在售${stock}套，目前0套面见。${topNote}`;}const first=weak[0],topics=reviewTopTopics(ctx,first);return `从数据下钻看，${reviewGroupLabel(row,first,detail)}当前全盘面见${first.met}套/在售${first.stock}套，面见率${first.met_rate}；门店TOP面见${first.store_top_met}套/${first.store_top_stock}套，户型TOP面见${first.unit_top_met}套/${first.unit_top_stock}套。${topics.length?`已有反馈主要涉及${topics.join('、')}，但整体覆盖仍不足。`:''}`;}
 function reviewMetricSentence(label,met,stock,rate){return stock>0?`${label}：面见${met}套 / 在售${stock}套，面见率${rate}`:`${label}：当前无在售房源`;}
 function reviewRankReason(row,tone){
  const direction=tone==='benchmark'?'较高':tone==='reminder'?'较低':'当前';
  return `月度全盘面见${row.met}套/在售${row.stock}套，面见率${row.met_rate}，在当前比较范围内覆盖${direction}；目标完成率${reviewCompletion(row)}。门店TOP和户型TOP覆盖作为补充观察，不替代全盘面见率排序。`;
 }
 function reviewRankCard(ctx,row,tone,reason){
  const progress=currentMonth==='2026-11'?`<p>${E(`目标进度：面见${row.met}套 / 目标${row._target??'待确认'}套，完成率${reviewCompletion(row)}；面见次数${meetingValue(row)}次`)}</p>`:'';
  return `<article class="review-rank-card ${tone}"><span>${E(reviewRowName(row))}</span><div class="review-rank-metrics">${progress}<p>${E(reviewMetricSentence('全盘',row.met,row.stock,row.met_rate))}</p><p>${E(reviewMetricSentence('门店TOP',row.store_top_met,row.store_top_stock,row.store_top_rate))}</p><p>${E(reviewMetricSentence('户型TOP',row.unit_top_met,row.unit_top_stock,row.unit_top_rate))}</p></div>${reviewSavedNotesHtml(ctx,row,false,tone)}</article>`;
 }
 function reviewSingleTone(ctx,row){
  if(!row)return 'neutral';const edition=reviewPracticeEdition(ctx);if(edition&&reviewApprovedPractice(ctx,row))return 'benchmark';const all=reviewCompanyStoreRows(ctx);if(!all.length)return 'neutral';
  if(!edition&&reviewOrganizationRank(all,3,true,true).some(item=>item.store===row.store))return 'benchmark';
  if(reviewOrganizationRank(all,3,false).some(item=>item.store===row.store))return 'reminder';
  return 'neutral';
 }
 function reviewHighlightsHtml(ctx){
  const sets=reviewHighlightSets(ctx),groups=reviewGroupAnalysisHtml(ctx);
  if(sets.single){const row=sets.single,tone=reviewSingleTone(ctx,row),status=tone==='benchmark'?(sets.practiceEdition?'本期标杆做法分享':'本月面见率标杆门店'):tone==='reminder'?'本月面见率进展偏慢门店':'本店月度表现';return `<div class="review-report"><div class="review-rank-grid">${reviewRankCard(ctx,row,tone,status+'：'+reviewRankReason(row,tone))}</div>${groups}${reviewOpportunityHtml(ctx)}</div>`;}
  const limit=ctx.view.scope==='region'?1:3,heading=sets.practiceEdition?'标杆门店｜有效做法萃取':`标杆门店｜月度全盘面见率${limit===1?'第一名':'TOP3'}`,rule=sets.practiceEdition?'本期分享目标与房商机咬合、用心服务与店总氛围带动三项做法；各店月度进展同步呈现。':'统一依据：月度全盘面见率优先；同率依次按面见套数、面见次数排序；相同保留并列。目标完成率与双TOP覆盖单独呈现，不改变排名。',empty=sets.practiceEdition?'当前范围暂无本期已发布的标杆做法。':'当前范围暂无已有面见的标杆门店。';
  return `<div class="review-report"><div class="review-rank-section"><h3>${E(heading)}</h3><p class="review-footnote">${E(rule)}</p><div class="review-rank-grid">${sets.bench.map(row=>reviewRankCard(ctx,row,'benchmark',reviewRankReason(row,'benchmark'))).join('')||`<p class="ops-muted">${E(empty)}</p>`}</div></div><div class="review-rank-section"><h3>进展偏慢门店｜月度全盘面见率${limit===1?'最后一名':'倒数3家'}</h3><div class="review-rank-grid">${sets.remind.map(row=>reviewRankCard(ctx,row,'reminder',reviewRankReason(row,'reminder'))).join('')||'<p class="ops-muted">当前范围暂无可独立列出的进展偏慢门店。</p>'}</div></div>${groups}${reviewOpportunityHtml(ctx)}</div>`;
 }
 function reviewOpportunityScope(ctx){const op=ctx.facts?.opportunity;if(!op)return null;const storeRegion=new Map(reviewStoreRows(ctx).map(x=>[x.store,x.region]));if(ctx.view.scope==='company')return {summary:op,regions:op.regions,stores:op.stores.map(x=>[storeRegion.get(x[0])||'',...x])};if(ctx.view.scope==='region'){const region=op.regions.find(x=>x[0]===ctx.view.region),stores=op.stores.filter(x=>storeRegion.get(x[0])===ctx.view.region).map(x=>[ctx.view.region,...x]);return {summary:region?{unmet:region[1],anyTop:region[2],storeTop:region[3],unitTop:region[4]}:null,regions:[],stores};}const store=op.stores.find(x=>x[0]===(ctx.view.store||ctx.view.name));return {summary:store?{unmet:store[1],anyTop:store[2],storeTop:store[3],unitTop:store[4]}:null,regions:[],stores:store?[[ctx.view.region,...store]]:[]};}
 function reviewOpportunityHtml(ctx){const scoped=reviewOpportunityScope(ctx),op=ctx.facts?.opportunity;if(!scoped?.summary)return '';
  const company=ctx.view.scope==='company',cards=company?[['9月面见',op.septemberMet+'套'],['10月末仍在售',op.stillListed+'套'],['10月继续面见',`${op.continued}套 · ${op.continuedRate}`],['跨月未持续面见',`${op.unmet}套 · ${op.unmetRate}`],['其中任一TOP',`${op.anyTop}套 · ${op.topRate}`]]:[['跨月未持续面见',scoped.summary.unmet+'套'],['其中任一TOP',scoped.summary.anyTop+'套'],['门店TOP',scoped.summary.storeTop+'套'],['户型TOP',scoped.summary.unitTop+'套']];
  const table=(title,headers,rows)=>rows.length?`<div class="review-table-card"><h3>${E(title)}</h3><div class="review-table-scroll"><table class="review-tier-table"><thead><tr>${headers.map(E).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((x,i)=>`<td class="${i===0||headers.length===6&&i===1?'review-org-name':''}">${E(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`:'';
  return `<div class="review-opportunity"><div class="review-subhead"><span>跨月未持续经营机会池</span><h3>9月已经见过，10月没有继续面见的房源</h3><p>以9月27日数据作为9月全月终值，与10月31日在售及面见结果逐套比对。</p></div><div class="review-summary-grid compact">${cards.map(([label,value])=>`<article class="review-summary-card"><span>${E(label)}</span><strong class="${String(value).includes('%')?'review-percent':''}">${E(value)}</strong></article>`).join('')}</div>${company?`<p class="review-footnote">9月面见205套中，13套已不在10月31日在售范围，不进入机会池；57套TOP为去重后的任一TOP，其中门店TOP 20套、户型TOP 37套。</p>`:''}${table('机会池大区分布',['大区','机会房源','其中任一TOP','门店TOP','户型TOP'],scoped.regions)}${table('机会池门店分布',['大区','门店','机会房源','其中任一TOP','门店TOP','户型TOP'],scoped.stores)}</div>`;
 }
 function reviewContext(view){const loaded=data(),d=loaded?.housing?.length?loaded:loaded?.companyProgress;if(!d?.housing?.length)return null;const s={region:view.region||'',store:view.scope==='store'?(view.store||view.name):''},progress=rankProgress(M.table(d.housing,s,goals(),currentMonth,d.meetings||[],customerOptions(d)),d);const ctx={view,d,s,progress,root:reviewRoot(progress,view),quality:qualityData(view),facts:REVIEW_FACTS[currentMonth]||null};return ctx;}
 const ACTION_REVIEWS={"2026-11":{"period":"11月1—8日","nextPeriod":"11月9—15日","summary":[["月度目标","300套"],["累计面见","58套"],["目标完成率","19.33%"],["送礼登记","19套"],["礼物覆盖率","32.76%"],["本周面见目标","至少70套"]],"judgment":"前8天完成58套，低于自然月时间进度26.67%；按均衡节奏应完成约80套，当前少22套。核心卡点是部分单店启动、礼物准备和过程推动尚未完全落地。本周需要通过补齐共识、提高公示频次、落实采购和专业报告培训，逐步追回差距。","strategies":[{"name":"目标共识与确认","done":["11月3日通过全司月会感恩月视频完成项目启动，并向全体伙伴发布感恩月行动。","在全司店总会上共识项目背景、300套目标、支持物料及单店下一步承接要求；单店目标已与店总确认。","向BP提供“感恩利他、顾客至上”文化解读、研讨时间建议、实施步骤、过往PPT和流程物料。"],"judgment":"全司与店总层面已完成共识，但部分单店尚未完成店内启动和文化研讨，目标还没有完全转化为店组与伙伴行动。","next":["11月9日当周由项目负责人推动未完成门店补齐店内启动。","BP与店总确认文化研讨时间、步骤和具体输出，完成单店承接。"]},{"name":"目标进度管理","done":["已建立全司、大区、门店面见进展看板，并开始同步面见量、目标差距与礼物覆盖。","前8天累计面见58套，月度目标完成率19.33%。"],"judgment":"进展暂低于时间进度，日级公示和逐层推动频次尚未稳定，差距还没有持续打开到店组和具体房源。","next":["本周面见目标至少70套。","11月11—13日连续三天公示全司、大区和门店进展；单店每周至少完成一次内部进展共识。","围绕门店、店组和TOP房源打开差距，明确机会、卡点、责任人和完成时间。"]},{"name":"正反馈分享传播","done":["项目启动后已开始关注真实顾客反馈、服务动作和可复制做法。"],"judgment":"目前已形成御翠园店、顶级豪宅部两家数据进展标杆，但尚未形成经核实、可传播的顾客服务故事和伙伴动作案例，正反馈运营仍需启动。","next":["BP主动收集真实顾客反馈、伙伴动作及价格、心态、委托等业务变化。","项目负责人核实事实后及时传播，形成首批可学习的单店标杆。"]},{"name":"物料与专业能力支持","done":["部分门店已开始准备，部分基础物料已完成印刷并分发到店。","专业报告的宣讲、使用说明和通关安排已进入准备阶段。"],"judgment":"礼物选购与采购尚未全面落地；专业报告的顾客价值、使用方法和通关标准仍需完成全员共识。","next":["11月11日前由BP确认各店或各组的礼物采购方式、数量、责任人和到店时间。","11月12日通过全员培训及晚间店总会讲清专业报告内容、顾客价值和使用方法。","周四与店总对齐使用与通关标准，本周完成培训及通关。"]}],"gift":{"summary":"58套已面见房源中，送礼登记19套，礼物覆盖率32.76%；仍有39套面见未登记礼物。","stores":[["御翠园店","面见8套","送礼0套"],["陆家嘴滨江店","面见5套","送礼0套"],["融创滨江壹号院店","面见3套","送礼0套"]],"conclusion":"三店合计16套，占全部未送礼房源的41.03%。本周由项目负责人再次与店总共识“面见同步准备伴手礼”的执行标准，并明确采购、领取和触达安排。"}}};
 function reviewActionsText(ctx){
 const r=ACTION_REVIEWS[currentMonth],month=Number(currentMonth.slice(5));
 if(!r)return `${month}月关键动作复盘
核心策略一｜目标共识与动态校准：月初完成首版目标共识；每周在店总会确认目标进度、剩余差距及是否需要调整，并持续把目标拆解到店组、伙伴和具体房源。
核心策略二｜全盘与双TOP双线推进：同步推动全盘、门店TOP和户型TOP房源面见；每日晒数据，并围绕目标差距持续提醒和反馈进度。
核心策略三｜正反馈分享与传播：每日收集、分享真实面见反馈和业务变化，让伙伴看到面见对顾客服务与房源经营的实际价值。
基础动作｜每周与BP复盘：复盘当月进展差距与双TOP覆盖情况，明确下一周重点推动的门店、店组、房源和所需支持。
动作复盘结论：已初步形成“目标共识—数据日晒—进度提醒—正反馈传播—周度复盘”的推动闭环。
未完全达成目标的真实原因：管理跟进主要停留在组织维度，没有持续打开到一套套房源，未能充分识别真实场景卡点、责任人及销售中心需要提供的支持。`;
 const strategies=r.strategies.map((x,i)=>`策略${i+1}｜${x.name}
上周动作：
${x.done.map(y=>"• "+y).join("\n")}
当前判断：${x.judgment}
本周承接：
${x.next.map(y=>"• "+y).join("\n")}`).join("\n\n");
 return `${r.period}策略复盘｜${r.nextPeriod}重点承接
阶段结果：${r.summary.map(x=>x[0]+x[1]).join("｜")}
整体判断：${r.judgment}

${strategies}

礼物执行重点
${r.gift.summary}
${r.gift.stores.map(x=>`${x[0]}：${x[1]}｜${x[2]}`).join("\n")}
${r.gift.conclusion}`;
}
 function reviewActionsHtml(ctx){
 const r=ACTION_REVIEWS[currentMonth];
 if(!r)return legacyReviewActionsHtml(ctx);
 const list=items=>`<ul class="review-action-list">${items.map(x=>`<li>${E(x)}</li>`).join("")}</ul>`;
 return `<div class="review-report">
  <div class="review-subhead"><span>WEEKLY STRATEGY REVIEW</span><h3>${E(r.period)}策略复盘｜${E(r.nextPeriod)}重点承接</h3><p>围绕四项核心策略复盘真实执行结果，不以任务数量替代业务判断。</p></div>
  <div class="review-summary-grid compact">${r.summary.map(([label,value])=>`<article class="review-summary-card"><span>${E(label)}</span><strong class="${String(value).includes("%")?"review-percent":""}">${E(value)}</strong></article>`).join("")}</div>
  <div class="review-callout critical"><strong>阶段结果判断</strong><p>${E(r.judgment)}</p></div>
  <div class="review-table-card"><h3>四项策略：上周执行与本周承接</h3><div class="review-table-scroll"><table class="review-tier-table" aria-label="四项策略上周执行与本周承接"><thead><tr><th>策略</th><th>上周完成动作</th><th>当前判断</th><th>本周重点承接</th></tr></thead><tbody>${r.strategies.map(x=>`<tr><td class="review-org-name">${E(x.name)}</td><td>${list(x.done)}</td><td>${E(x.judgment)}</td><td>${list(x.next)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="review-table-card"><h3>礼物执行重点</h3><p>${E(r.gift.summary)}</p><div class="review-table-scroll"><table class="review-tier-table" aria-label="面见未送礼重点门店"><thead><tr><th>重点门店</th><th>面见量</th><th>送礼登记</th></tr></thead><tbody>${r.gift.stores.map(x=>`<tr><td class="review-org-name">${E(x[0])}</td><td>${E(x[1])}</td><td>${E(x[2])}</td></tr>`).join("")}</tbody></table></div><div class="review-callout warm"><strong>本周共识重点</strong><p>${E(r.gift.conclusion)}</p></div></div>
 </div>`;
}
 function legacyReviewActionsHtml(ctx){const month=Number(currentMonth.slice(5));return `<div class="review-report"><div class="review-action-grid"><article><span>核心策略01</span><h3>目标共识与动态校准</h3><ul class="review-action-points"><li>月初完成全司、大区和单店首版目标共识，明确各组织需要承接的面见任务。</li><li>每周在店总会确认目标进度、剩余差距及目标是否需要调整，持续完成目标再共识。</li><li>推动店总将目标进一步拆解到店组、伙伴和具体房源。</li></ul></article><article><span>核心策略02</span><h3>全盘与双TOP双线推进</h3><ul class="review-action-points"><li>同步推动全盘在售业主、门店TOP和户型TOP房源面见。</li><li>每日晒面见量、全盘面见率和双TOP面见率，持续呈现组织进展。</li><li>围绕目标差距进行提醒和反馈，及时识别推进偏慢的组织与重点房源。</li></ul></article><article><span>核心策略03</span><h3>正反馈分享与传播</h3><ul class="review-action-points"><li>每日收集和分享真实面见反馈，呈现价格、心态、看房条件和关系进展等业务价值。</li><li>通过正向案例传播，让面见从数据任务转化为顾客服务和房源经营动作。</li><li>持续沉淀优秀做法，带动伙伴主动面见并认真记录反馈。</li></ul></article><article class="foundation"><span>基础动作</span><h3>每周与BP复盘</h3><ul class="review-action-points"><li>复盘各店当月进展、目标差距及双TOP覆盖情况。</li><li>结合门店进展高低，明确下一周重点推动的门店、店组和房源。</li><li>对连续进展偏慢的组织，推动BP联动店总、经理进一步下钻。</li></ul></article></div><div class="review-callout warm"><strong>${month}月动作复盘结论</strong><p>${month}月已经初步形成“目标共识—数据日晒—进度提醒—正反馈传播—周度复盘”的推动闭环，既关注全盘面见规模，也同步关注双TOP房源经营和真实反馈沉淀。</p></div><div class="review-callout critical"><strong>${month}月未完全达成目标的真实原因</strong><p>管理跟进主要停留在全司、大区、门店等组织维度，能够判断哪家店进展较慢，但没有持续打开到一套套房源，因此未能充分识别每套房源的真实场景卡点、责任人，以及销售中心需要提供的具体支持。11月需要进一步升级为“组织进展＋逐套机会池”的双层管理。</p></div></div>`;}
 function reviewNovemberScope(ctx){const plan=ctx.facts?.november;if(!plan)return null;if(ctx.view.scope==='company')return {plan,summary:plan.company,regions:plan.regions,stores:plan.stores};if(ctx.view.scope==='region'){const region=plan.regions.find(row=>row[0]===ctx.view.region),summary=region?{marketBaseline:plan.company.marketBaseline,storeStretch:region[1],september:region[2],target:region[3]}:{marketBaseline:plan.company.marketBaseline,storeStretch:0,september:0,target:0};return {plan,summary,regions:region?[region]:[],stores:plan.stores.filter(row=>row[0]===ctx.view.region)};}const store=plan.stores.find(row=>row[1]===(ctx.view.store||ctx.view.name)),summary=store?{marketBaseline:plan.company.marketBaseline,storeStretch:store[2],september:store[3],target:store[4]}:{marketBaseline:plan.company.marketBaseline,storeStretch:0,september:0,target:0};return {plan,summary,regions:[],stores:store?[store]:[]};}
 function reviewDetailTable(title,headers,rows){if(!rows.length)return '';return `<div class="review-table-card"><h3>${E(title)}</h3><div class="review-table-scroll"><table class="review-tier-table" aria-label="${E(title)}"><thead><tr>${headers.map(x=>`<th scope="col">${E(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((value,i)=>`<td class="${i<2?'review-org-name':''}">${E(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;}
 function reviewNovemberMetricRow(ctx,level,name){if(level==='company')return ctx.root;return ctx.progress.rows.find(row=>row._level===level&&(level==='region'?row.region===name:row.store===name));}
 function reviewNovemberCoverage(row){if(!row)return {whole:'—',storeTop:'—',unitTop:'—'};return {whole:Math.ceil(Number(row.stock||0)*.2),storeTop:Math.ceil(Number(row.store_top_stock||0)*.4),unitTop:Math.ceil(Number(row.unit_top_stock||0)*.4)};}
 function reviewRankText(ctx,row,tone){const progress=`目标进度：面见${row.met}套 / 目标${row._target??'待确认'}套，完成率${reviewCompletion(row)}；面见次数${meetingValue(row)}次\n`;return `${row.store}\n${progress}${reviewMetricSentence('全盘',row.met,row.stock,row.met_rate)}\n${reviewMetricSentence('门店TOP',row.store_top_met,row.store_top_stock,row.store_top_rate)}\n${reviewMetricSentence('户型TOP',row.unit_top_met,row.unit_top_stock,row.unit_top_rate)}\n${reviewSavedNotesText(ctx,row,false,tone)}`;}
 function reviewRankCopySection(ctx,sets,singleTone,bench,remind){
  const rule=sets.practiceEdition?'标杆门店｜有效做法萃取：分享目标与房商机咬合、用心服务与店总氛围带动三项做法，月度进展同步呈现。':'统一依据：月度全盘面见率优先；同率依次看面见套数、面见次数，相同保留并列。目标完成率与双TOP覆盖作为补充观察。';
  if(sets.single)return `本店月度表现：\n${reviewRankText(ctx,sets.single,singleTone)}\n\n${reviewGroupAnalysisText(ctx)}`;
  return `${rule}\n\n标杆门店：\n${bench}\n\n进展偏慢门店：\n${remind}\n\n${reviewGroupAnalysisText(ctx)}`;
 }
 function reviewText(view=currentView){const ctx=reviewContext(view);if(!ctx)return '';const r=ctx.root,q=ctx.quality?.summary||Q.summary([]),topics=Object.entries(F.labels).map(([key,label])=>({key,label,count:Number(q.topics?.[key]||0)})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count),sets=reviewHighlightSets(ctx),opp=reviewOpportunityScope(ctx),singleTone=reviewSingleTone(ctx,sets.single),bench=sets.single?reviewRankText(ctx,sets.single,singleTone):sets.bench.map(x=>reviewRankText(ctx,x,'benchmark')).join('\n\n')||(currentMonth==='2026-11'?'当前范围暂无本月标杆门店':'当前范围暂无可识别的标杆门店'),remind=sets.single?'':sets.remind.map(x=>reviewRankText(ctx,x,'reminder')).join('\n\n')||(currentMonth==='2026-11'?'当前范围暂无可纳入预警的在售门店':'当前范围暂无可识别的重点提醒门店');
  const rankSection=reviewRankCopySection(ctx,sets,singleTone,bench,remind);
  const oppText=!opp?.summary?'当前月份暂无锁定的跨月机会数据':ctx.view.scope==='company'?`9月面见${ctx.facts.opportunity.septemberMet}套，10月末仍在售${ctx.facts.opportunity.stillListed}套；10月继续面见${ctx.facts.opportunity.continued}套（${ctx.facts.opportunity.continuedRate}），跨月未持续面见${ctx.facts.opportunity.unmet}套（${ctx.facts.opportunity.unmetRate}），其中任一TOP ${ctx.facts.opportunity.anyTop}套（${ctx.facts.opportunity.topRate}）。`:`当前范围跨月未持续面见${opp.summary.unmet}套，其中任一TOP ${opp.summary.anyTop}套，门店TOP ${opp.summary.storeTop}套，户型TOP ${opp.summary.unitTop}套。`;
  const regionAnalysis=ctx.view.scope==='company'?`\n\n区域表现分析：\n${reviewRegionAnalysisText(reviewChildren(ctx.progress,ctx.view).primary,ctx.d.imports[0]?.as_of||'',ctx.progress.rows.filter(r=>r._level==='store'))}`:'';
  return `${view.name}｜${Number(currentMonth.slice(5))}月月度复盘\n数据截至${ctx.d.imports[0]?.as_of||'待导入'}\n\n一、本月目标达成结果\n月度目标：${r._target??'待确认'}套\n面见量：${r.met}套｜目标完成率：${reviewCompletion(r)}｜目标差距：${reviewGap(r)??'—'}套\n全盘：${r.met}/${r.stock}套｜面见率${r.met_rate}｜面见次数${meetingValue(r)}次\n门店TOP：${r.store_top_met}/${r.store_top_stock}套｜面见率${r.store_top_rate}\n户型TOP：${r.unit_top_met}/${r.unit_top_stock}套｜面见率${r.unit_top_rate}${regionAnalysis}\n\n二、面见伴手礼\n送礼登记${r.gift}套｜已见覆盖率${r.gift_rate}\n${reviewGiftAnalysis(ctx)}\n\n三、面见质量与业务转化\n已面见${q.total}套｜有反馈原文${q.feedback}套｜覆盖率${M.pct(q.feedback,q.total)}\n业务经营主题：\n${topics.slice(0,8).map(x=>`${x.label}：${x.count}套（${M.pct(x.count,q.total)}）`).join('\n')||'暂无主题数据'}\n\n数据解读：${reviewThemeAnalysis(topics,q)}\n\n四、标杆门店与重点提醒\n${rankSection}\n\n跨月未持续经营机会池：\n${oppText}\n\n五、${reviewActionsText(ctx)}\n\n六、11月份目标及核心策略\n11月升级为“组织进展＋逐套机会池”双层管理，以感恩连接持续创造面见、深化反馈并沉淀可复用的优质服务案例。`;}
 function reviewNovemberActionTableV2(rows){
  return `<div class="review-strategy-table"><h3>11月策略与动作</h3><table aria-label="11月策略与动作"><thead><tr><th>策略</th><th>动作</th></tr></thead><tbody>${(rows||[]).map(row=>{const actions=Array.isArray(row[1])?row[1]:[row[1]];return `<tr><td>${E(row[0])}</td><td><ul class="review-action-list">${actions.map(item=>`<li>${E(item)}</li>`).join('')}</ul></td></tr>`;}).join('')}</tbody></table></div>`;
 }
 function reviewNovemberPlanTextV2(ctx){
  const scoped=reviewNovemberScope(ctx);
  if(!scoped)return '11月承接目标待确认';
  const {plan,summary,regions,stores}=scoped,delta=summary.target-summary.september,numbers=['①','②','③','④','⑤'];
  const scopeName=ctx.view.scope==='region'?ctx.view.region:ctx.view.scope==='store'?(ctx.view.store||ctx.view.name):'全司';
  const coverage=reviewNovemberCoverage(reviewNovemberMetricRow(ctx,ctx.view.scope,scopeName));
  const marketText=ctx.view.scope==='company'?`全司市占底线：${plan.company.marketBaseline}套\n单店市占分解合计：${plan.company.storeStretch}套（以更高的组织分解目标支撑全司底线）`:ctx.view.scope==='region'?`全司市占底线：${plan.company.marketBaseline}套\n当前大区单店市占分解合计：${summary.storeStretch}套`:`全司市占底线：${plan.company.marketBaseline}套\n本店市占分解目标：${summary.storeStretch}套`;
  const regionText=regions.map(row=>{const c=reviewNovemberCoverage(reviewNovemberMetricRow(ctx,'region',row[0]));return `${row[0]}：单店市占分解合计${row[1]}套｜全盘20%测算${c.whole}套｜门店TOP40%测算${c.storeTop}套｜户型TOP40%测算${c.unitTop}套｜9月面见${row[2]}套｜11月目标${row[3]}套`;}).join('\n');
  const storeText=stores.map(row=>{const c=reviewNovemberCoverage(reviewNovemberMetricRow(ctx,'store',row[1]));return `${row[1]}：市占分解${row[2]}套｜全盘20%测算${c.whole}套｜门店TOP40%测算${c.storeTop}套｜户型TOP40%测算${c.unitTop}套｜9月面见${row[3]}套｜11月目标${row[4]}套（${row[5]}）`;}).join('\n');
  const strategyText=(plan.strategyActions||[]).map(row=>{const actions=Array.isArray(row[1])?row[1]:[row[1]];return `${row[0]}：\n${actions.map((item,i)=>`${numbers[i]||((i+1)+'.')} ${item}`).join('\n')}`;}).join('\n\n');
  return `11月定性目标
${plan.qualitative.goal}

11月定量目标
在售业主面见量：${summary.target}套${delta?`（较9月${delta>0?'增加':'减少'}${Math.abs(delta)}套）`:''}
全量线上感恩表达：100%
全盘在售业主面见率：≥20%
门店TOP面见率：≥40%
户型TOP面见率：≥40%

目标测算口径：以全盘面见率20%、门店TOP和户型TOP面见率40%为覆盖线，结合9月峰值、组织承接能力及感恩月战役强度逐店校准，汇总形成300套。当前范围覆盖线参考为全盘${coverage.whole}套、门店TOP ${coverage.storeTop}套、户型TOP ${coverage.unitTop}套，9月面见${summary.september}套。${marketText.replaceAll('\n','；')}；市占仅作业务结果参考，不参与面见目标测算。

${regionText?`大区目标：
${regionText}

`:''}${storeText?`门店目标：
${storeText}

`:''}11月策略与动作
${strategyText}

感恩相连服务物料包：${plan.materialPack}`;
 }

 function reviewWeekTwoPlan(){return root.WBNovemberPlan?.week2Plan||null;}
 function reviewWeekTwoActions(items){
  return `<ul class="review-action-list">${(items||[]).map(item=>`<li>${E(item)}</li>`).join('')}</ul>`;
 }
 function reviewWeekTwoTargetScope(plan,ctx){
  const breakdown=plan?.targetBreakdown,regions=breakdown?.regions||[];
  if(!breakdown)return null;
  if(ctx?.view?.scope==='store'){
   const storeName=ctx.view.store||ctx.view.name;
   for(const region of regions){
    const store=(region.stores||[]).find(item=>item.store===storeName);
    if(store)return {kind:'store',target:store.weekTarget,region,store,regions:[region]};
   }
   return {kind:'store',target:0,region:null,store:null,regions:[]};
  }
  if(ctx?.view?.scope==='region'){
   const region=regions.find(item=>item.name===ctx.view.region);
   return {kind:'region',target:region?.weekTarget||0,region,store:null,regions:region?[region]:[]};
  }
  return {kind:'company',target:regions.reduce((sum,item)=>sum+Number(item.weekTarget||0),0),region:null,store:null,regions};
 }
 function reviewWeekTwoTargetHtml(plan,ctx){
  const breakdown=plan?.targetBreakdown,scope=reviewWeekTwoTargetScope(plan,ctx);
  if(!breakdown||!scope)return '';
  const asOf=breakdown.asOf?Number(String(breakdown.asOf).slice(5,7))+'月'+Number(String(breakdown.asOf).slice(8,10))+'日':'当前';
  if(scope.kind==='store'){
   const store=scope.store;
   if(!store)return '<div class="review-callout"><strong>第二周目标分解</strong><p>本店无在售业主面见套数目标。</p></div>';
   return '<div class="review-table-card"><h3>第二周目标分解｜本店</h3><p class="review-footnote">'+E(breakdown.basis)+'</p><div class="review-table-scroll"><table class="review-tier-table" aria-label="第二周本店面见目标"><thead><tr><th>大区</th><th>门店</th><th>月目标</th><th>'+E(asOf)+'已见</th><th>月剩余差距</th><th>本周目标</th></tr></thead><tbody><tr><td class="review-org-name">'+E(scope.region.name)+'</td><td class="review-org-name">'+E(store.store)+'</td><td>'+store.monthlyTarget+'套</td><td>'+store.met+'套</td><td>'+store.gap+'套</td><td><strong>'+store.weekTarget+'套</strong></td></tr></tbody></table></div></div>';
  }
  const rows=scope.regions.map(region=>'<tr><td class="review-org-name">'+E(region.name)+'</td><td>'+region.monthlyTarget+'套</td><td>'+region.met+'套</td><td>'+region.gap+'套</td><td><strong>'+region.weekTarget+'套</strong></td><td>'+reviewWeekTwoActions((region.stores||[]).map(store=>store.store+' '+store.weekTarget+'套'))+'</td></tr>').join('');
  return '<div class="review-table-card"><h3>第二周70套目标分解</h3><p class="review-footnote">'+E(breakdown.basis)+'</p><div class="review-table-scroll"><table class="review-tier-table" aria-label="第二周大区与门店面见目标"><thead><tr><th>大区</th><th>月目标</th><th>'+E(asOf)+'已见</th><th>月剩余差距</th><th>本周目标</th><th>单店拆解</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
 }
 function reviewWeekTwoTargetText(plan,ctx){
  const breakdown=plan?.targetBreakdown,scope=reviewWeekTwoTargetScope(plan,ctx);
  if(!breakdown||!scope)return '';
  if(scope.kind==='store')return scope.store?scope.region.name+'｜'+scope.store.store+'：月目标'+scope.store.monthlyTarget+'套｜截至11月8日已见'+scope.store.met+'套｜剩余'+scope.store.gap+'套｜本周目标'+scope.store.weekTarget+'套':'本店无在售业主面见套数目标';
  return [breakdown.basis,...scope.regions.map(region=>region.name+'：月目标'+region.monthlyTarget+'套｜已见'+region.met+'套｜剩余'+region.gap+'套｜本周'+region.weekTarget+'套\n  '+(region.stores||[]).map(store=>store.store+' '+store.weekTarget+'套').join('；'))].join('\n');
 }
 function reviewWeekTwoHtml(plan,ctx){
  const targetScope=reviewWeekTwoTargetScope(plan,ctx),targetValue=targetScope?(targetScope.kind==='company'?'至少'+targetScope.target+'套':targetScope.target+'套'):'至少70套';
  const cards=[['执行周期',plan.period],['本周面见目标',targetValue],['核心策略',String((plan.strategies||[]).length)+'项'],['统一标准','面见必带礼物']];
  const cardGrid=`<div class="review-summary-grid compact">${cards.map(([label,value])=>`<article class="review-summary-card"><span>${E(label)}</span><strong>${E(value)}</strong></article>`).join('')}</div>`;
  const rows=(plan.strategies||[]).map(item=>`<tr><td><strong>${E('策略'+item.id+'｜'+item.title)}</strong></td><td>${E(item.timing)}</td><td>${reviewWeekTwoActions(item.actions)}</td><td>${E(item.owners)}</td><td>${E(item.acceptance)}</td></tr>`).join('');
  return `<div class="review-report">
   <div class="review-subhead"><span>WEEK 2 · 11月感恩月</span><h3>${E(plan.title)}｜${E(plan.period)}</h3><p>从月度规划进入第二周执行，按四项策略集中呈现本周动作、角色分工与验收标准。</p></div>
   ${cardGrid}
   ${reviewWeekTwoTargetHtml(plan,ctx)}
   <div class="review-callout"><strong>本周定性目标</strong><p>${E(plan.qualitativeGoal)}</p><strong>统一执行标准</strong><p>${E(plan.executionStandard)}</p></div>
   <div class="review-table-card"><h3>本周四项策略与动作</h3><div class="review-table-scroll"><table class="review-tier-table" aria-label="11月第二周四项策略与动作"><thead><tr><th>策略</th><th>时间与频次</th><th>本周核心动作</th><th>负责人及承接角色</th><th>验收标准</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  </div>`;
 }
 function reviewWeekTwoText(plan,ctx){
  const targetScope=reviewWeekTwoTargetScope(plan,ctx),targetText=targetScope?(targetScope.kind==='company'?plan.quantitativeGoal:targetScope.target+'套（由全司70套拆解）'):plan.quantitativeGoal;
  const strategies=(plan.strategies||[]).map(item=>`策略${item.id}｜${item.title}
时间与频次：${item.timing}
本周核心动作：
${(item.actions||[]).map(action=>'• '+action).join('\n')}
负责人及承接角色：${item.owners}
验收标准：${item.acceptance}`).join('\n\n');
  return `${plan.title}｜${plan.period}
本周定量目标：${targetText}

第二周70套目标分解：
${reviewWeekTwoTargetText(plan,ctx)}

本周定性目标：${plan.qualitativeGoal}
统一执行标准：${plan.executionStandard}

${strategies}`;
 }
 function reviewNextHtmlV2(ctx){
  const week=reviewWeekTwoPlan();
  if(currentMonth==='2026-11'&&week)return reviewWeekTwoHtml(week,ctx);
  const scoped=reviewNovemberScope(ctx);
  if(!scoped)return '<div class="review-report"><p class="ops-muted">11月承接目标待确认。</p></div>';
  const {plan,summary,regions,stores}=scoped;
  const scopeName=ctx.view.scope==='region'?ctx.view.region:ctx.view.scope==='store'?(ctx.view.store||ctx.view.name):'全司';
  const coverage=reviewNovemberCoverage(reviewNovemberMetricRow(ctx,ctx.view.scope,scopeName));
  const regionRows=regions.map(row=>{const c=reviewNovemberCoverage(reviewNovemberMetricRow(ctx,'region',row[0]));return [row[0],row[1]+'套',`全盘${c.whole}套｜门店TOP ${c.storeTop}套｜户型TOP ${c.unitTop}套`,row[2]+'套',row[3]+'套'];});
  const storeRows=stores.map(row=>{const c=reviewNovemberCoverage(reviewNovemberMetricRow(ctx,'store',row[1]));return [row[0],row[1],row[2]+'套',`全盘${c.whole}套｜门店TOP ${c.storeTop}套｜户型TOP ${c.unitTop}套`,row[3]+'套',row[4]+'套',row[5]];});
  const cardGrid=rows=>`<div class="review-summary-grid compact">${rows.map(([label,value])=>`<article class="review-summary-card"><span>${E(label)}</span><strong class="${String(value).includes('%')?'review-percent':''}">${E(value)}</strong></article>`).join('')}</div>`;
  const quantitative=[['在售业主面见量',summary.target+'套'],['线上感恩表达','100%'],['全盘面见率','≥20%'],['门店TOP面见率','≥40%'],['户型TOP面见率','≥40%']];
  return `<div class="review-report">
   <div class="review-subhead"><span>11月份目标及核心策略</span><h3>从10月复盘进入感恩月关键战役</h3><p>以感恩连接为主题，将文化共识转化为全量顾客服务、在售业主面见和重点房源经营行动。</p></div>
   <div class="review-callout"><strong>11月定性目标</strong><p>${E(plan.qualitative.goal)}</p></div>
   <section class="review-goal-section"><h3 class="review-goal-title">11月定量目标</h3>${cardGrid(quantitative)}</section>
   <div class="review-measure-note"><strong>目标测算口径</strong><p>以全盘面见率20%、门店TOP和户型TOP面见率40%为覆盖线，结合9月峰值、各组织承接能力和感恩月战役强度逐店校准，汇总形成300套。当前范围覆盖线参考：全盘${coverage.whole}套、门店TOP ${coverage.storeTop}套、户型TOP ${coverage.unitTop}套；9月面见${summary.september}套。全司市占15套、单店分解合计26套只作业务结果参考，不参与面见量测算。</p></div>
   ${reviewDetailTable('11月大区目标汇总',['大区','市占分解参考','覆盖线测算','9月面见达成','11月面见目标'],regionRows)}
   ${reviewDetailTable(ctx.view.scope==='company'?'11月18家门店目标明细':ctx.view.scope==='region'?'区域内门店目标明细':'本店目标依据',['大区','门店','市占分解参考','覆盖线测算','9月面见达成','11月面见目标','校准依据'],storeRows)}
   ${reviewNovemberActionTableV2(plan.strategyActions)}
   <div class="review-material-pack"><div><span>11月行动工具</span><h3>“感恩相连”服务物料包</h3><p>集中查看感谢信、电子贺卡、邀约话术、专业资料、礼品库与采购入口，伙伴可按顾客关系和服务阶段直接取用。</p><code>${E(plan.materialPack)}</code></div><a href="${E(plan.materialPack)}" target="_blank" rel="noopener">打开物料包</a></div>
   <div class="review-callout"><strong>11月检核方式</strong><p>同时检核线上覆盖、全盘与双TOP面见、逐套反馈和业务变化。未完成事项必须明确具体对象、责任人和完成时间，并在下一次周度复盘中继续跟进；月末单独完成礼物费用与凭证收口。</p></div>
  </div>`;
 }
 function reviewTextWithNovember(view=currentView){
  const text=reviewText(view),ctx=reviewContext(view),marker='六、11月份目标及核心策略\n';
  if(currentMonth>='2026-11'&&root.WBStoreReviews){const end=text.indexOf('\n\n五、');return (end>=0?text.slice(0,end):text)+'\n\n五、'+root.WBStoreReviews.text()+(root.WBCompanyWeekPlan?'\n\n六、'+root.WBCompanyWeekPlan.text():'');}
  if(currentMonth==='2026-11'){
   const week=reviewWeekTwoPlan();
   if(!week||!text.includes(marker))return text;
   const start=text.indexOf(marker);
   return text.slice(0,start)+'六、'+reviewWeekTwoText(week,ctx);
  }
  if(!ctx||!ctx.facts?.november||!text.includes(marker))return text;
  const start=text.indexOf(marker);
  return text.slice(0,start)+marker+'以感恩连接为主题，将文化共识转化为全量顾客服务、在售业主面见和重点房源经营行动；管理方式升级为“组织进展＋逐套机会池”双层管理。\n\n'+reviewNovemberPlanTextV2(ctx);
 }
 function review(view){
  const d=data(),old=ARCHIVE.months[currentMonth]?.views[viewKey(view)],hasData=Boolean(d?.housing.length||d?.companyProgress?.housing?.length),regional=currentMonth>='2026-11'&&Boolean(root.WBStoreReviews),source=`<div class="ops-actions">${old?.sections.length?'<button class="btn" data-ops="archive-review">查看已归档复盘</button>':''}${hasData?'<button class="btn primary" data-ops="copy-review">复制当前复盘</button>':''}</div>`;
  const regionalHost=regional?block('review-regional','大区周／月复盘','<div id="store-review-host"></div>','按大区展开各店报告，直接填写、共享保存，并复制完整复盘图片。')+(root.WBCompanyWeekPlan?block('review-company-week-plan','全司周目标及核心策略','<div id="company-week-plan-host"></div>','承接月度目标与达成进展，自动测算周目标；项目负责人填写、调整核心策略，保存后共享查看。'):''):'';
  if(!hasData)return hero('周／月复盘 · '+view.name,'目标、数据分析与BP执行复盘在同一工作台完成')+source+regionalHost+(old?.sections||[]).map(x=>block(x.id,x.title,x.blocks.map(renderBlock).join(''))).join('');
  const ctx=reviewContext(view);currentView={...view,sections:[{id:'review-progress',blocks:[ctx.progress]}]};const month=Number(currentMonth.slice(5));
  return hero(`${month}月面见复盘 · ${view.name}`,`数据截至${d.imports[0]?.as_of||'待导入'} · 按大区查看单店周／月复盘与下一步安排`)+source+block('review-progress','本月目标达成结果',reviewProgressHtml(ctx),'全司视角直接呈现大区与门店完整结果；筛选后同步聚焦当前范围。')+block('review-gifts','面见伴手礼',reviewGiftHtml(ctx))+block('review-quality','面见质量与业务转化',reviewQualityHtml(ctx))+block('review-highlights','标杆门店与重点提醒','<div id="ops-review-highlights-content">'+reviewHighlightsHtml(ctx)+'</div>')+(regional?regionalHost:block('review-actions',`${month}月关键动作复盘`,reviewActionsHtml(ctx))+block('review-next','11月份目标及核心策略',reviewNextHtmlV2(ctx)));
 }

 function emptyData(month){const base=ARCHIVE.months[ARCHIVE.defaultMonth];return {meta:{month,cutoff:'本月日常数据待导入',week:'按实际快照查看'},regions:base.regions,views:Object.fromEntries(Object.entries(base.views).map(([k,v])=>[k,{scope:v.scope,role:v.role,name:v.name,region:v.region,store:v.store,sections:[],kpis:[],title:month+'项目工作台 · '+v.name}]))};}
 function goals(){const record=item('goals','monthly')||data()?.companyProgress?.items?.find(x=>x.key===currentMonth+'|goals|@@company|monthly');if(record)return record.payload||{};const archive=ARCHIVE.months[currentMonth];if(!archive)return {};return Object.fromEntries(Object.values(archive.views).filter(v=>v.scope==='store').map(v=>{const p=v.sections.flatMap(s=>s.blocks).find(b=>b.variant==='progress');const r=p?.rows.find(r=>r._level==='store');return [v.name,typeof r?.target==='number'?r.target:null];}));}
 function goalRatePreview(store,value,changed=false){
  const d=data(),housing=d?.housing?.length?d.housing:d?.companyProgress?.housing;
  if(!Array.isArray(housing)||!housing.length)return '目标面见率：待导入在售底表';
  const stock=M.metrics(M.inScope(housing,{store:canonicalStore(store)})).stock,raw=String(value??'').trim(),target=raw===''?null:Number(raw);
  if(target===null)return '目标面见率：未设目标'+(changed?'（待保存）':'');
  if(!Number.isInteger(target)||target<0)return '目标面见率：请输入非负整数目标';
  if(!stock)return '目标面见率：—（当前在售0套）';
  return `目标面见率：${M.pct(target,stock)}${changed?'（待保存）':''} · ${target}套 ÷ 在售${stock}套`;
 }
 function updateGoalRatePreview(input){
  const output=input?.parentElement?.querySelector('[data-goal-rate]');if(!output)return;
  output.textContent=goalRatePreview(input.name,input.value,String(goals()[input.name]??'')!==input.value);
 }
 function applyGoalCommit(loaded,commit){
  if(!commit)return loaded;
  function merge(target){if(!target)return;const existing=(target.items||[]).find(x=>x.key===commit.key);if(!existing||!existing.updated_at||existing.updated_at<=commit.updated_at)target.items=(target.items||[]).filter(x=>x.key!==commit.key).concat(commit);}
  merge(loaded);if(loaded.companyProgress!==loaded)merge(loaded.companyProgress);return loaded;
 }
 async function saveMonthlyGoals(values){
  if(!C.project)throw Error('仅项目负责人可修改当月目标');
  const month=currentMonth,reader=C.member,g={};
  for(const [name,value] of Object.entries(values)){if(String(value).trim()==='')continue;const n=Number(value);if(!Number.isInteger(n)||n<0)throw Error('门店目标须为非负整数');g[canonicalStore(name)]=n;}
  const key=month+'|goals|@@company|monthly',existing=data()?.items?.find(x=>x.key===key);
  const saved=await C.saveItem(month,'goals','monthly',null,null,g,existing?.updated_at),commit=Array.isArray(saved)?saved[0]:saved;
  if(!commit||commit.key!==key||!commit.updated_at||!commit.payload)throw Error('未收到目标保存确认，请刷新后核对');
  if(C.member!==reader)return {refreshed:false};
  // The acknowledged goal record is authoritative even if the follow-up load fails.
  // Invalidate older loads so they cannot restore a pre-save target or percentage.
  state.refreshSerial[month]=(state.refreshSerial[month]||0)+1;
  state.goalCommits[month]={reader,item:commit};
  if(state.cache[month]){const old=state.cache[month];state.cache[month]=applyGoalCommit({...old,companyProgress:old.companyProgress?{...old.companyProgress}:old.companyProgress},commit);}
  if(currentMonth===month){await refresh();return {refreshed:!state.error};}
  return {refreshed:true};
 }
 function memberScopes(){const m=C.member;return m?.role==='store'?[{region:m.region,store:m.store},...(m.stores||[])].map(x=>({...x,store:canonicalStore(x.store)})):[];}
 function setCloudRegions(){
  const d=data();if(!d)return;
  const pairs=[...M.active(d.housing||[]).map(r=>({region:r['大区'],store:r['门店']})),...(d.items||[]),...(d.periods||[]),...(d.directory||[]),...memberScopes()].filter(x=>x.region&&x.store&&!hiddenCustomerStores.has(canonicalStore(x.store))).map(x=>({...x,store:canonicalStore(x.store)}));
  if(!pairs.length)return;
  const regions=M.sortRegions(M.unique(pairs.map(x=>x.region)).map(name=>({name,stores:M.unique(pairs.filter(x=>x.region===name).map(x=>x.store))}))),views={...DATA.views};
  for(const r of regions){views['region:'+r.name]||={scope:'region',role:'大区总',name:r.name,region:r.name,store:null,sections:[],kpis:[],title:r.name};for(const store of r.stores)views['store:'+store]||={scope:'store',role:'店总',name:store,region:r.name,store,sections:[],kpis:[],title:store};}
  DATA={...DATA,regions,views};
 }
 function syncScope(view){
  if(view.scope==='store'&&canonicalStore(view.store||view.name)!==(view.store||view.name))view=resolveView(view.region,canonicalStore(view.store||view.name));
  if(view.scope==='store'&&hiddenCustomerStores.has(canonicalStore(view.store||view.name))){view=resolveView(view.region,'');updateUrl(view);}
  const member=C.member,assigned=memberScopes();
  if(member&&member.role==='region'&&view.region!==member.region){view=resolveView(member.region,'');updateUrl(view);}
  if(member?.role==='store'&&!assigned.some(x=>x.region===view.region&&x.store===view.name)){const fallback=assigned.find(x=>x.region===view.region)||assigned[0];view=resolveView(fallback.region,fallback.store);updateUrl(view);}
  const regions=M.sortRegions(DATA.regions).map(r=>({...r,stores:(r.stores||[]).filter(s=>!hiddenCustomerStores.has(canonicalStore(s)))})).filter(r=>r.stores.length).filter(r=>!member||member.role==='project'||member.role==='region'&&r.name===member.region||assigned.some(x=>x.region===r.name));
  document.getElementById('region-filter').innerHTML=(!member||member.role==='project'?'<option value="">全司 · 全部大区</option>':'')+regions.map(r=>`<option value="${E(r.name)}">${E(r.name)}</option>`).join('');document.getElementById('region-filter').value=view.region||'';
  const stores=regions.flatMap(r=>(!view.region||r.name===view.region)?r.stores:[]).filter(s=>!hiddenCustomerStores.has(canonicalStore(s))).filter(s=>!member||member.role!=='store'||assigned.some(x=>x.store===s));
  document.getElementById('store-filter').innerHTML=(!member||member.role!=='store'?'<option value="">全部门店</option>':'')+stores.map(s=>`<option value="${E(s)}">${E(s)}</option>`).join('');document.getElementById('store-filter').value=view.scope==='store'?view.store||view.name:'';
  document.getElementById('region-filter').disabled=!!member&&(member.role==='region'||member.role==='store'&&regions.length<2);document.getElementById('store-filter').disabled=member?.role==='store'&&stores.length<2;document.getElementById('reset-filter').hidden=!!member&&member.role!=='project';
  document.getElementById('scope-badge').textContent=({company:'全司',region:'大区',store:'门店'}[view.scope]||'')+'视角';document.getElementById('scope-live').textContent='当前查看：'+view.name;
  document.querySelector('.scope-note').textContent='月份与组织范围同步作用于进展、话术、动作及核账；日常进展可直接查看；管理与财务按工号授权范围读取。';return view;
 }
 function connection(){const label=!C.configured?'共享服务待连接':C.member?'已登录 · '+(C.member.display_name||C.member.login_id||'成员'):'共享服务已配置 · 日常无需登录';return `<div class="ops-connection"><span><i class="ops-dot ${C.member?'online':''}"></i>${E(label)}${state.loading?' · 正在同步…':''}</span><div>${C.member?'<button class="btn" data-ops="refresh">刷新共享数据</button><button class="btn" data-ops="logout">退出</button>':'<button class="btn" data-ops="refresh">刷新进展</button><button class="btn" data-ops="login">BP／管理入口</button>'}</div></div>${state.error?`<div class="ops-notice warning" role="alert">${E(state.error)}</div>`:''}`;}
 function hero(label,subtitle){return `<header class="hero"><div class="eyebrow">OWNER MEETING · PROJECT WORKBENCH</div><h1>${E(label)}</h1><p class="subtitle">${E(subtitle)}</p></header>`;}
 function block(id,name,body,note=''){return `<section class="section ops-section" id="${id}"><div class="section-head"><h2>${E(name)}</h2></div>${note?`<p class="section-summary">${E(note)}</p>`:''}${body}</section>`;}
 function kpis(items){return `<div class="kpis">${items.map(([label,value,note])=>`<article class="kpi"><div class="kpi-label">${E(label)}</div><div class="kpi-value">${E(value)}</div><div class="kpi-note">${E(note||'')}</div></article>`).join('')}</div>`;}
 function archivedProgress(view){return ARCHIVE.months[currentMonth]?.views[viewKey(view)]?.sections.flatMap(s=>s.blocks).find(b=>b.variant==='progress');}
 function rankProgress(progress,d){
  let companyRows=[];
  if(d?.housing.length){
   // A missing public comparison must not turn scoped BP data into a company ranking.
   const company=d.companyProgress?.housing;
   if(Array.isArray(company))companyRows=M.table(company,{},goals(),currentMonth,d.companyProgress?.meetings||[],customerOptions(d.companyProgress)).rows;
  }else companyRows=archivedProgress({scope:'company'})?.rows||[];
  return M.withRateRanks(M.orderProgress(progress),companyRows);
 }
 function unmetTopRows(view){
  const d=data();
  if(!C.member||!Array.isArray(d?.housing))return [];
  const filter={region:view?.region||'',store:view?.scope==='store'?(view.store||view.name):''},seen=new Set(),rows=[];
  for(const source of M.active(M.inScope(d.housing,filter))){
    if(hiddenCustomerStores.has(canonicalStore(source['门店']))||M.flag(source['本月是否面见']))continue;
    const storeTop=M.flag(source['门店top户数']),unitTop=M.flag(source['户型top户数']);
    if(!storeTop&&!unitTop)continue;
    const houseId=M.text(source['房源编号']).replace(/[\s\u00a0]/g,'');
    const key=houseId||[source['门店'],source['店组'],source['分盘']||source['总盘'],source['房间号']].map(M.text).join('|');
    if(seen.has(key))continue;
    seen.add(key);
    rows.push({
      region:M.text(source['大区']),
      store:canonicalStore(source['门店'])||'—',
      group:M.text(source['店组'])||'—',
      manager:managerName({region:source['大区'],store:source['门店'],group:source['店组']}),
      advisor:M.text(source['维护人姓名'])||'—',
      project:M.text(source['分盘']||source['总盘'])||'—',
      room:M.text(source['房间号'])||'—',
      tag:[storeTop?'门店TOP':'',unitTop?'户型TOP':''].filter(Boolean).join('、')
    });
  }
  return rows.sort((a,b)=>M.compareStore(a.store,b.store)||M.compareGroup(a.group,b.group)||a.project.localeCompare(b.project,'zh-CN')||a.room.localeCompare(b.room,'zh-CN')||a.advisor.localeCompare(b.advisor,'zh-CN'));
}
function unmetTopSummary(rows){
  return {
    total:rows.length,
    storeTop:rows.filter(row=>row.tag.includes('门店TOP')).length,
    unitTop:rows.filter(row=>row.tag.includes('户型TOP')).length,
    both:rows.filter(row=>row.tag.includes('门店TOP')&&row.tag.includes('户型TOP')).length
  };
}
function unmetTopTable(view){
  if(!C.member)return `<div class="ops-notice"><b>登录后查看逐套明细</b><p>分盘、房间号和维护人仅对已授权BP及项目负责人展示。</p><button class="btn primary" data-ops="login">BP／管理入口</button></div>`;
  const rows=unmetTopRows(view),summary=unmetTopSummary(rows);
  if(!rows.length)return `<div class="ops-notice"><b>当前范围暂无未面见TOP房</b><p>本月仍在售的门店TOP和户型TOP均已完成面见，或当前底表暂无TOP标签。</p></div>`;
  const headers=['门店','店组','经理','维护人姓名','分盘','房间号','房源标签（门店TOP/户型TOP）'];
  return `<div class="table-box unmet-top-box"><div class="table-top"><div><h3 class="table-title">当前范围共 ${summary.total} 套未面见TOP房</h3><p class="table-note">门店TOP ${summary.storeTop}套 · 户型TOP ${summary.unitTop}套${summary.both?` · 双标签 ${summary.both}套（已去重）`:''}</p></div><button class="btn primary" type="button" data-ops="unmet-top-image">复制当前范围图片</button></div><div class="table-scroll" style="max-height:640px;overflow:auto"><table aria-label="本月未面见TOP房明细"><thead><tr>${headers.map(label=>`<th>${E(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><td>${E(row.store)}</td><td>${E(row.group)}</td><td>${E(row.manager)}</td><td>${E(row.advisor)}</td><td>${E(row.project)}</td><td>${E(row.room)}</td><td>${E(row.tag)}</td></tr>`).join('')}</tbody></table></div><div class="table-bottom"><span>已按门店、店组、分盘和房间号排序</span><span>同一房源双标签只展示一行</span></div></div>`;
}
function unmetTopCanvasLines(ctx,value,maxWidth){
  const chars=Array.from(String(value??'—')),lines=[];let line='';
  for(const char of chars){
    const next=line+char;
    if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=char;}else line=next;
  }
  if(line||!lines.length)lines.push(line||'—');
  return lines;
}
async function unmetTopImageBlobs(rows,view){
  const pages=[];for(let i=0;i<rows.length;i+=24)pages.push(rows.slice(i,i+24));if(!pages.length)pages.push([]);
  const headers=['门店','店组','经理','维护人姓名','分盘','房间号','房源标签'],keys=['store','group','manager','advisor','project','room','tag'],widths=[220,220,130,160,310,340,200],left=40,top=176,headerHeight=58;
  const blobs=[];
  for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
    const page=pages[pageIndex],measure=document.createElement('canvas').getContext('2d');measure.font='20px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    const layouts=page.map(row=>{
      const cells=keys.map((key,index)=>unmetTopCanvasLines(measure,row[key],widths[index]-24));
      return {cells,height:Math.max(54,Math.max(...cells.map(lines=>lines.length))*28+18)};
    });
    const canvas=document.createElement('canvas');canvas.width=1660;canvas.height=top+headerHeight+layouts.reduce((sum,row)=>sum+row.height,0)+(rows.length?66:196);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fffdfa';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#5d3973';ctx.fillRect(0,0,canvas.width,105);
    ctx.fillStyle='#fff';ctx.font='bold 34px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';ctx.textBaseline='middle';ctx.fillText(`${currentMonth.replace('-','年')}月未面见TOP房明细`,left,42);
    ctx.font='20px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';ctx.fillText(`${view.name} · 共${rows.length}套 · 第${pageIndex+1}/${pages.length}页`,left,78);
    const cutoff=data()?.imports?.[0]?.as_of||'待同步';ctx.fillStyle='#675c6c';ctx.font='18px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';ctx.fillText(`口径：仍在售、属于门店TOP或户型TOP且本月尚未面见｜数据截至 ${cutoff}`,left,140);
    let x=left;ctx.fillStyle='#eee6f3';ctx.fillRect(left,top,widths.reduce((a,b)=>a+b,0),headerHeight);
    ctx.strokeStyle='#d7cde0';ctx.lineWidth=1;ctx.font='bold 19px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';ctx.fillStyle='#533865';
    headers.forEach((label,index)=>{ctx.strokeRect(x,top,widths[index],headerHeight);ctx.fillText(label,x+12,top+headerHeight/2);x+=widths[index];});
    let y=top+headerHeight;ctx.font='20px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    if(!rows.length){ctx.fillStyle='#675c6c';ctx.fillText('当前范围暂无本月未面见TOP房。',left,y+70);}
    layouts.forEach((layout,rowIndex)=>{
      x=left;ctx.fillStyle=rowIndex%2?'#fbf8fc':'#fffdfa';ctx.fillRect(left,y,widths.reduce((a,b)=>a+b,0),layout.height);
      layout.cells.forEach((lines,index)=>{
        ctx.strokeStyle='#e3dce7';ctx.strokeRect(x,y,widths[index],layout.height);ctx.fillStyle='#342c38';
        const start=y+(layout.height-(lines.length-1)*28)/2;
        lines.forEach((line,lineIndex)=>ctx.fillText(line,x+12,start+lineIndex*28));
        x+=widths[index];
      });
      y+=layout.height;
    });
    ctx.fillStyle='#85798b';ctx.font='16px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';ctx.fillText('双标签房源已去重；请结合实际邀约情况持续更新。',left,canvas.height-30);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('未面见TOP房明细图片生成失败');
    blobs.push(blob);
  }
  return blobs;
}
async function unmetTopImage(){
  if(!C.member)throw Error('请先通过BP／管理入口登录');
  const rows=unmetTopRows(currentView);
  if(!rows.length)throw Error('当前范围暂无未面见TOP房');
  const blobs=await unmetTopImageBlobs(rows,currentView);
  if(blobs.length===1&&navigator.clipboard?.write&&window.ClipboardItem&&isSecureContext){
    try{await navigator.clipboard.write([new ClipboardItem({'image/png':blobs[0]})]);notify('未面见TOP房明细图片已复制，可粘贴到微信');return;}catch{}
  }
  const urls=blobs.map(blob=>URL.createObjectURL(blob));
  dialog(`<h2>本月未面见TOP房明细图片</h2><p>${blobs.length>1?`当前范围明细较多，已自动分成${blobs.length}张，保留全部房源。`:'图片已生成，可下载后分享。'}</p>${urls.map((url,index)=>`<div class="ops-actions"><a class="btn primary" href="${url}" download="${E(currentMonth+'_'+currentView.name)}_未面见TOP房_${index+1}.png">下载第${index+1}张</a></div><img alt="未面见TOP房明细图片${index+1}" src="${url}" style="width:100%;margin:12px 0 22px">`).join('')}`);
  setTimeout(()=>urls.forEach(url=>URL.revokeObjectURL(url)),300000);
}

// The established 24-scope publication package keeps its original cohort check.
function metHouseRows(view){
  const d=data();if(!C.member||!Array.isArray(d?.housing))return [];
  const filter={region:view?.region||'',store:view?.scope==='store'?(view.store||view.name):''},seen=new Set(),rows=[];
  for(const source of M.active(M.inScope(d.housing,filter))){
    if(hiddenCustomerStores.has(canonicalStore(source['门店']))||!M.flag(source['本月是否面见']))continue;
    const storeTop=M.flag(source['门店top户数']),unitTop=M.flag(source['户型top户数']);
    const houseId=M.text(source['房源编号']).replace(/[\s\u00a0]/g,'');
    const key=houseId||[source['门店'],source['店组'],source['分盘']||source['总盘'],source['房间号']].map(M.text).join('|');
    if(seen.has(key))continue;seen.add(key);
    rows.push({store:canonicalStore(source['门店'])||'—',group:M.text(source['店组'])||'—',advisor:M.text(source['维护人姓名'])||'—',project:M.text(source['分盘']||source['总盘'])||'—',room:M.text(source['房间号'])||'—',tag:[storeTop?'门店TOP':'',unitTop?'户型TOP':''].filter(Boolean).join('、')||'非TOP'});
  }
  return rows.sort((a,b)=>M.compareStore(a.store,b.store)||M.compareGroup(a.group,b.group)||a.project.localeCompare(b.project,'zh-CN')||a.room.localeCompare(b.room,'zh-CN')||a.advisor.localeCompare(b.advisor,'zh-CN'));
}
function metHouseData(view=currentView){
  const d=data();
  if(!C.member)throw Error('请先通过BP／管理入口登录');
  if(!Array.isArray(d?.housing)||state.loading||d.reader!==C.member)throw Error('请先刷新共享数据，再查看面见与正反馈');
  if(!root.WBMetHouseFeedback)throw Error('面见与正反馈模块尚未载入，请刷新页面');
  return root.WBMetHouseFeedback.build({businessData:d,month:currentMonth,scope:view});
}
function metHouseQualitySummary(view){
  const q=qualityData(view);if(!q)return '';
  const t=q.summary,rows=Object.entries(Q.labels).filter(([key])=>Number(t.counts?.[key]||0)>0).map(([key,label])=>`<div class="quality-public-row"><span>${E(label)}</span><b>${t.counts[key]}套</b><em>${M.pct(t.counts[key],t.total)}</em></div>`).join('');
  return `<details class="met-feedback-summary"><summary>查看面见收获分类与识别标准</summary><p class="ops-muted">每套房源只计一个主要结果；按本月已面见${t.total}套计算占比。</p><div class="quality-public-list">${rows||'<p>暂无已归类反馈</p>'}</div>${qualityStandards()}</details>`;
}
function metHouseTable(view){
  if(!C.member)return '<div class="ops-notice"><b>登录后查看面见与正反馈明细</b><p>分盘、房间号、维护人与反馈原文仅对已授权BP及项目负责人展示。</p><button class="btn primary" data-ops="login">BP／管理入口</button></div>'+metHouseQualitySummary(view);
  let table;try{table=metHouseData(view);}catch(e){return '<div class="ops-notice">'+E(e.message)+'</div>';}
  if(!table.rows.length)return '<div class="ops-notice"><b>当前范围暂无当月已面见房源</b><p>当前底表尚未登记本月面见，或当前筛选范围暂无仍在售房源。</p></div>'+metHouseQualitySummary(view);
  const summary=table.summary,doubleTag=summary.both?' · 双标签 '+summary.both+'套（已去重）':'';
  return '<div class="table-box met-house-box"><div class="table-top"><div><h3 class="table-title">当月面见与正反馈 · '+E(view.name)+' · '+summary.total+'套</h3><p class="table-note">🌟门店TOP '+summary.storeTop+'套 · 户型TOP '+summary.unitTop+'套 · 非TOP '+summary.nonTop+'套'+doubleTag+'</p></div><div class="ops-actions"><button class="btn primary" type="button" data-ops="met-house-image">复制完整图片</button><button class="btn" type="button" data-ops="met-house-preview">预览图片</button></div></div><p class="met-feedback-note">同一房源一行，多次面见按时间对应呈现；面见的正反馈保留原文，计划及待办不视为已完成结果。</p><div class="table-scroll met-feedback-scroll">'+root.WBMetHouseFeedback.tableHtml(table)+'</div><div class="table-bottom"><span>已按门店、店组、分盘和房间号排序；同一房源按套去重</span><span>数据截至 '+E(table.asOf||'待同步')+'</span></div></div>'+metHouseQualitySummary(view);
}
function showMetHouseImage(blob,table){
  if(state.metHouseImageUrl)URL.revokeObjectURL(state.metHouseImageUrl);
  state.metHouseImageBlob=blob;state.metHouseImageUrl=URL.createObjectURL(blob);state.metHouseImageContext={member:C.member,month:currentMonth,scopeKey:viewKey(currentView),business:data(),sourceVersion:data()?.imports?.[0]?.created_at||''};
  const canCopy=!!(navigator.clipboard?.write&&root.ClipboardItem);
  dialog('<h2>当月面见与正反馈 · 完整图片</h2><p>房源明细、面见时间与反馈原文合成一张图；🌟标识门店TOP房源。</p><div class="ops-actions">'+(canCopy?'<button class="btn" type="button" data-ops="met-house-copy-image">复制整张图片</button>':'')+'<a class="btn primary" href="'+state.metHouseImageUrl+'" download="'+E(table.month+'_'+table.scopeName)+'_面见与正反馈.png">下载整张图片</a></div><img alt="'+E(table.scopeName)+'当月面见与正反馈完整图片" src="'+state.metHouseImageUrl+'" style="width:100%;margin:12px 0 22px">');
}
async function copyMetHousePreview(){
  const c=state.metHouseImageContext;
  if(!c||!state.metHouseImageBlob||!C.member||C.member!==c.member||currentMonth!==c.month||currentMode!=='daily'||viewKey(currentView)!==c.scopeKey||data()!==c.business||data()?.reader!==C.member||(data()?.imports?.[0]?.created_at||'')!==c.sourceVersion)throw Error('图片来源已变化，请关闭预览并重新生成');
  try{await navigator.clipboard.write([new root.ClipboardItem({'image/png':state.metHouseImageBlob})]);notify('整张面见与正反馈图片已复制。');}catch{notify('浏览器未允许复制，请下载这张图片后发送。');}
}
async function metHouseImage(preview=false){
  if(state.metHouseImageBusy)throw Error('正在生成完整图片，请稍候');
  const table=metHouseData(),member=C.member,month=currentMonth,scopeKey=viewKey(currentView),business=data(),sourceVersion=business.imports?.[0]?.created_at||'',buttons=[...document.querySelectorAll('[data-ops="met-house-image"],[data-ops="met-house-preview"]')];
  if(!table.rows.length)throw Error('当前范围暂无当月已面见房源');
  state.metHouseImageBusy=true;buttons.forEach(b=>b.disabled=true);notify('正在将房源、面见时间与反馈原文合成一张完整图片…');
  try{
    const blob=await root.WBMetHouseFeedback.image(table);
    if(C.member!==member||currentMonth!==month||currentMode!=='daily'||viewKey(currentView)!==scopeKey||data()!==business||data()?.reader!==member||(data()?.imports?.[0]?.created_at||'')!==sourceVersion)throw Error('查看范围或底表已变化，请按当前内容重新生成图片');
    if(!preview&&navigator.clipboard?.write&&root.ClipboardItem&&isSecureContext){try{await navigator.clipboard.write([new root.ClipboardItem({'image/png':blob})]);notify('完整面见与正反馈图片已复制，全部内容在一张图中。');return;}catch{}}
    showMetHouseImage(blob,table);notify('已生成一张完整图片，可复制或下载。');
  }finally{state.metHouseImageBusy=false;buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
}

 function companyBenchmarkData(){
  const d=data();
  if(!C.member)throw Error('请先通过BP／管理入口登录');
  if(!C.project)throw Error('全司标杆榜由项目负责人读取全司底表后统一生成，请使用项目负责人下载的公示资料包');
  if(state.loading||!d?.housing?.length||d.reader!==C.member)throw Error('请先刷新当前账号的全司共享数据');
  if(!root.WBCompanyBenchmark)throw Error('全司标杆榜尚未载入，请刷新页面');
  return root.WBCompanyBenchmark.build({businessData:d,month:currentMonth});
 }
 function companyBenchmarkPanel(){
  if(!C.member)return '<div class="ops-notice">已授权成员登录后查看公示资料；全司标杆榜由项目负责人统一生成。</div>';
  try{const board=companyBenchmarkData();return '<div class="ops-actions"><button class="btn primary" data-ops="benchmark-image">复制全司标杆榜</button><button class="btn" data-ops="benchmark-preview">预览全司标杆榜</button></div>'+root.WBCompanyBenchmark.html(board);}
  catch(e){return '<div class="ops-notice">'+E(e.message)+'</div>';}
 }
 async function companyBenchmarkImage(preview=false){
  if(state.benchmarkBusy)throw Error('正在生成全司标杆榜，请稍候');
  const board=companyBenchmarkData(),reader=C.member,d=data(),month=currentMonth,source=d.imports[0],version=source.created_at,asOf=source.as_of;
  const assertCurrent=()=>{if(C.member!==reader||!C.project||data()!==d||d.reader!==reader||currentMonth!==month||currentMode!=='daily'||state.loading||d.imports[0]!==source||source.created_at!==version||source.as_of!==asOf)throw Error('账号、月份或底表已变化，请重新生成全司标杆榜');};
  state.benchmarkBusy=true;notify('正在生成全司面见标杆榜…');
  try{const blob=await root.WBCompanyBenchmark.image(board);assertCurrent();
   if(!preview&&navigator.clipboard?.write&&root.ClipboardItem&&isSecureContext){try{await navigator.clipboard.write([new root.ClipboardItem({'image/png':blob})]);notify('全司面见标杆榜已复制，包含门店、店组及个人标杆。');return;}catch{}}
   if(state.benchmarkUrl)URL.revokeObjectURL(state.benchmarkUrl);state.benchmarkUrl=URL.createObjectURL(blob);state.benchmarkPreview={blob,assertCurrent};
   dialog('<h2>全司在售业主面见标杆榜</h2><p>一行一个标杆；面见次数、面见套数、面见率横向分列，正反馈按类型逐行呈现。各范围共用同一份全司榜单。</p><div class="ops-actions"><button class="btn" data-ops="benchmark-copy-image">复制整张榜单</button><a class="btn primary" href="'+state.benchmarkUrl+'" download="'+E(month+'_'+asOf)+'_全司面见标杆榜.png">下载整张榜单</a></div><img alt="全司面见标杆榜完整图片" src="'+state.benchmarkUrl+'" style="width:100%;margin-top:16px">');
  }finally{state.benchmarkBusy=false;}
 }
 async function copyBenchmarkPreview(){const p=state.benchmarkPreview;if(!p)throw Error('请重新生成全司标杆榜');p.assertCurrent();try{await navigator.clipboard.write([new root.ClipboardItem({'image/png':p.blob})]);notify('整张全司标杆榜已复制。');}catch{notify('浏览器未允许复制，请下载这张榜单。');}}
 function daily(view){
  const d=data(),s={region:view.region||'',store:view.scope==='store'?view.name:''};let progress,asOf,metric,goal,delta={known:false};
  if(d&&(d.housing?.length||currentMonth==='2026-11')){progress=M.table(d.housing||[],s,goals(),currentMonth,d.meetings||[],customerOptions(d));const rootRow=progress.rows.find(r=>r._level===view.scope);metric={...M.metrics(M.inScope(d.housing||[],s),d.meetings||[]),...rootRow};asOf=d.imports?.[0]?.as_of||'';goal=metric._target;
   const previousDates=M.unique((d.snapshots||[]).map(x=>x.as_of)).filter(day=>day<asOf).sort();const previousDate=previousDates.at(-1);const previous=(d.snapshots||[]).filter(x=>x.as_of===previousDate&&(!s.region||x.region===s.region)&&(!s.store||x.store===s.store));if(previousDate&&previous.length)delta={...M.delta(metric,{metIds:previous.flatMap(x=>x.payload.metIds),giftIds:previous.flatMap(x=>x.payload.giftIds)}),asOf:previousDate};
  }else{progress=archivedProgress(view);asOf=ARCHIVE.months[currentMonth]?.meta?.cutoff?.match(/\d{4}年\d{1,2}月\d{1,2}日/)?.[0]||'';const row=progress?.rows.find(r=>r._level===view.scope);metric=row?{...row,metIds:[],giftIds:[]}:null;goal=typeof row?.target==='number'?row.target:null;}
  if(!progress||!metric){currentView={...view,sections:[]};return hero('日常面见推动 · '+view.name,currentMonth+' · 每次更新保留截止日期与历史快照')+`<div class="month-empty"><h2>本月日常数据待导入</h2><p>项目负责人导入本月底表后，进展、推动话术和待核送礼明细会同步生成。</p><button class="btn primary" data-ops="admin">进入数据管理</button></div>`;}
  progress=rankProgress(progress,d);
  const ownerApplicable=metric._ownerApplicable!==false,live=!!d&&(d.housing?.length||currentMonth==='2026-11'),gap=goal==null?null:Math.max(0,goal-metric.met),cutoff=live?(asOf?'业主数据截至'+asOf:'业主数据待导入'):'归档快照 · '+asOf;
  DATA={...DATA,meta:{...DATA.meta,cutoff,week:'日常进展',source_note:d?.housing.length?'共享数据':'已发布复盘快照'}};currentView={...view,title:currentMonth+'日常面见进展 · '+view.name,sections:[{id:'daily-progress',title:'面见及礼物进展',blocks:[progress]}]};
  let risks=[],praises=[];const children=progress.rows.filter(r=>r._level===(view.scope==='company'?'region':view.scope==='region'?'store':'group'));
  risks=priorityFacts(view,children);
  if(currentMonth==='2026-11')praises=novemberPraises(view,progress);
  const best=children.filter(r=>r.met>0&&(r._level!=='group'||r.met>=M.groupBenchmarkMinimum)).sort((a,b)=>b.met-a.met)[0];if(currentMonth!=='2026-11'&&best){const name=best._level==='group'?best.group:best.store!=='/'?best.store:best.region;praises.push(`👏 ${name}已面见${best.met}套，当前面见量在同范围内领先，可进一步核对具体收获和可复制做法。感谢大家持续走近业主、认真做好维护；让每次面见都带回具体信息，支撑下一步服务。`);}
  state.messageContext={risks,praises};const message=makeMessage(view,progress,metric,goal,cutoff,risks,praises);
  const cards=ownerApplicable?[['本月目标',goal==null?'待设置':goal+'套','按当月确认目标'],['面见量',metric.met+'套','按房源去重'],['面见次数',meetingValue(metric)+'次',meetingLabel(metric)],['本月剩余差距',gap==null?'待设置':gap+'套','按本月目标计算'],['送礼登记',metric.gift+'套','已面见覆盖 '+metric.gift_rate]]:[['业主面见','/','本店无在售房源，不涉及业主管理指标']];

  currentView.kpis=cards.map(([label,value,note])=>({label,value,note}));
  return hero('日常面见推动 · '+view.name,cutoff)+(live?'':`<div class="ops-notice">当前显示已发布的归档快照。共享服务连接并导入新底表后，这里才会更新为日常数据。</div>`)+kpis(cards)+`<div class="ops-date-line">${ownerApplicable?(delta.known?`较${E(delta.asOf)}快照新增面见 <b>${delta.newMet}</b> 套、礼物登记 <b>${delta.newGift}</b> 套${delta.removedMet?'；另有'+delta.removedMet+'套因范围或记录调整不在当前覆盖中，需核对':''}`:'日增量待建立连续快照；不把累计量视作昨日新增'):'本店无在售房源，不涉及业主管理指标。'}${d?.imports?.[0]?`<span>业主更新时间：${E(new Date(d.imports[0].created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</span>`:''}</div>`+

  block('daily-progress','面见及礼物进展',renderTable(progress))+
  block('daily-unmet-top','本月未面见TOP房明细',(currentMonth==='2026-11'?`<div class="ops-notice"><strong>📌 重点提醒｜按组织分工推进邀约与面见</strong><p style="white-space:pre-line">${E(topRoleReminders)}</p><p>两类TOP分别展示，不能直接相加。同一房源同时属于两类TOP时，协调一次邀约与面见安排。</p></div>`:'')+unmetTopTable(view),'仅纳入本月仍在售、属于门店TOP或户型TOP且尚未面见的房源。')+
  block('daily-met-houses','当月面见房源与正反馈',ownerApplicable?metHouseTable(view):'<div class="ops-notice">本店无在售房源，业主面见指标不适用。</div>','房源明细与面见反馈合并展示，复制为一张完整图片。')+
  block('daily-message','公示话术',`<div class="block ops-panel"><textarea id="ops-message" class="ops-message" aria-label="当前范围推动话术">${E(message)}</textarea><div class="ops-actions"><button class="btn primary" data-ops="copy-message">复制话术</button></div>${currentMonth==='2026-11'?'<details class="ops-secondary"><summary>查看公示口径</summary><p class="ops-muted">公示口径：门店按本期确认的标杆与重点提醒名单展示，数据随底表更新；标杆展示全盘面见套数及面见率，重点提醒展示门店TOP面见套数。大区仅展示本区门店；店组按月度全盘面见率比较，首末保留并列，标杆月度面见至少5套。</p></details>':''}</div>`)+
  block('daily-package','公示资料包',publicationPanel(view))+
  block('daily-benchmark','全司在售业主面见标杆榜',companyBenchmarkPanel(),`按全司月度累计计算，门店TOP3、店组TOP5、个人TOP5；店组月度面见至少${M.groupBenchmarkMinimum}套入选。筛选大区或单店时榜单保持全司范围。`)+parkedRecords(view);

 }
 function novemberRankedSelection(rows,level){
  const name=row=>level==='group'?row.group:row.store,eligible=(rows||[]).filter(row=>row._level===level&&reviewMonthlyRate(row)!==null&&Number(row.met)>=0),best=reviewOrganizationRank(eligible,1,true,true),bestNames=new Set(best.map(name));
  const low=reviewOrganizationRank(eligible,1,false).filter(row=>!bestNames.has(name(row))),ranked=reviewOrganizationRank(eligible,eligible.length,true).map(row=>({row,rate:reviewMonthlyRate(row),rank:row.reviewRank}));
  return {level,name,best,low,ranked};
 }
 function novemberPraises(view,progress){
  const level=view.scope==='store'?'group':'store',rows=(progress.rows||[]).filter(r=>r._level===level&&Number(r.stock)>0&&Number(r.met)>0),best=reviewOrganizationRank(rows,3,true,true);
  return best.map(r=>`👍 ${level==='group'?r.group:r.store}：面见${r.met}套，面见率${r.met_rate}。`);
 }
 const topRoleReminders='📌 店总牵头邀约及面见门店TOP\n📌经理重点邀约及陪同面见户型TOP\n📌伙伴持续开展全盘邀约，逐位业主明确邀约和面见安排';
 const novemberAnnouncementClosing='把感恩化为行动💗 多面见 多服务｜让每一次服务更有温度✨';
 // The project owner's confirmed publication lists; figures always come from the current scoped progress.
 const novemberPublicationStores={best:['融创滨江壹号院店','复兴香园店','顶级豪宅部'],low:['仁恒河滨城店','碧云店','星河湾店','尚海湾店']};
 function accompanimentMessage(m){
  const count=key=>typeof m[key]==='number'?m[key]+'套':String(m[key]??'待核实');
  const share=(key,top)=>typeof m[key]==='string'&&m[key].endsWith('%')?'占已面见'+top+'的'+m[key]:top+'陪同面见率'+String(m[key]??'待核实');
  return `👥 管理者陪同面见\n店总陪同门店TOP：${count('store_top_head_met')}｜${share('store_top_head_share','门店TOP')}\n经理陪同户型TOP：${count('unit_top_manager_met')}｜${share('unit_top_manager_share','户型TOP')}\n${topRoleReminders}`;
 }
 function novemberMessage(view,progress,m,goal,cutoff){
  const rows=progress.rows||[],owner=m._ownerApplicable!==false;
  const stores=new Map(rows.filter(r=>r._level==='store'&&Number(r.stock)>0&&(!view.region||r.region===view.region)).map(r=>[r.store,r]));
  const selections=(view.scope==='region'?['store','group']:[view.scope==='store'?'group':'store']).map(level=>novemberRankedSelection(rows,level));
  const lines=(kind)=>selections.map(s=>{
   const selected=s.level==='store'?novemberPublicationStores[kind].map(name=>stores.get(name)).filter(Boolean):s[kind];
   const label=s.level==='group'?'店组':kind==='low'?'门店TOP面见率偏低的门店':'门店',list=selected.map(r=>s.level==='store'&&kind==='low'?`${s.name(r)}：门店TOP面见${r.store_top_met}套`:`${s.name(r)}：面见${r.met}套（面见率${r.met_rate}）`).join('\n');
   return list?(selections.length>1?label+'：\n':'')+list:'';
  }).filter(Boolean).join('\n')||(kind==='best'?'当前暂无已产生业主面见登记的对象':'当前无需要单独提示的对象');
  const ownerProgress=owner?`本月全盘面见目标：${goal==null?'待确认':goal+'套'}\n全盘在售房源已面见：${m.met}套｜面见率${m.met_rate}\n门店TOP房源已面见：${m.store_top_met}套｜面见率${m.store_top_rate}\n户型TOP房源已面见：${m.unit_top_met}套｜面见率${m.unit_top_rate}`:'业主面见：/';
  const attachments=view.scope==='store'?['#附1️⃣店组、个人名下房源及面见占比&本月TOP房未面见明细（重点邀约）','#附2️⃣面见质量（已面见房源面见反馈）','#附3️⃣全司面见标杆（店面、店组、个人）'].join('\n'):'';
  return [`${view.scope==='company'?'各位梦想合伙人':'各位战友'}，大家好☀️`,`🍁 11月感恩月｜${view.name}面见进展\n${cutoff}`,`🎯 本月目标与进展\n${ownerProgress}`,...(owner?[`🏅 标杆${view.scope==='region'?'门店与店组':view.scope==='store'?'店组':'门店'}\n${lines('best')}`,`⚠️ 重点提醒${view.scope==='region'?'门店与店组':view.scope==='store'?'店组':'门店｜门店TOP面见率偏低'}\n${lines('low')}`,`🔎 面见质量\n${novemberQualityMessage(qualityData(view))}`,...(['company','region'].includes(view.scope)?[accompanimentMessage(m)]:[]),attachments]:[]),novemberAnnouncementClosing].filter(Boolean).join('\n\n');
 }
 function makeMessage(view,progress,m,goal,cutoff,risks,praises){if(currentMonth==='2026-11')return novemberMessage(view,progress,m,goal,cutoff,praises);const name=view.name,month=Number(currentMonth.slice(5)),gap=goal==null?'待确认':Math.max(0,goal-m.met),detailLevel=view.scope==='region'?'store':view.scope==='store'?'group':'region',detailRows=progress.rows.filter(r=>r._level===detailLevel);const groupText=detailRows.map(r=>{const label=detailLevel==='store'?r.store:detailLevel==='group'?r.group:r.region;return `${label}：全盘${r.met}套（${r.met_rate}）｜门店TOP ${r.store_top_met}套（${r.store_top_rate}）｜户型TOP ${r.unit_top_met}套（${r.unit_top_rate}）`;}).join('\n');const scene=sceneRaw(view),analysis=sceneAnalysis(view);
  const qt=qualityData(view);const publicRisks=risks.filter(t=>!String(t).includes('结合实际')).slice(0,5);const topText=`

TOP重点房源
门店TOP：${m.store_top_met}套｜面见率${m.store_top_rate}
户型TOP：${m.unit_top_met}套｜面见率${m.unit_top_rate}`;
  const detailHeading=detailLevel==='store'?'各店进展':detailLevel==='group'?'各组进展':'各大区进展';
  const storeRows=progress.rows.filter(r=>r._level==='store'&&Number(r.met||0)>0);const benchmarkRows=view.scope==='company'?[...storeRows].sort((a,b)=>Number(b.met||0)-Number(a.met||0)).slice(0,3):[];const reminderRows=view.scope==='company'?[...storeRows].sort((a,b)=>Number(a.met_rate?.replace('%','')||0)-Number(b.met_rate?.replace('%','')||0)).slice(0,5):[];const benchmarks=benchmarkRows.map(r=>`${r.store}：面见${r.met}套｜面见率${r.met_rate}`).join('\n')||'暂无标杆门店';const reminders=reminderRows.map(r=>`${r.store}：面见${r.met}套｜面见率${r.met_rate}`).join('\n')||'暂无重点提醒门店';const companySections=view.scope==='company'?`\n🏅 二、标杆门店进展\n${benchmarks}\n\n⚠️ 三、重点提醒门店\n${reminders}\n`:'';return `${view.scope==='company'?'各位梦想合伙人，大家上午好☀️':'各位战友，大家好☀️'}\n\n${name}${month}月在售业主面见进展｜${cutoff}\n\n🎯 一、本月目标&进展\n月度目标：${goal==null?'待确认':goal+'套'}｜全盘面见${m.met}套｜面见率${m.met_rate}\n${topText}${view.scope!=='company'&&groupText?'\n\n'+detailHeading+'👇\n'+groupText+'\n':''}${companySections}\n🔎 ${view.scope==='company'?'四':'二'}、面见质量\n${qt&&!qt.pending?qualityText(qt):'质量概览待同步'}\n\n${view.scope==='company'?'📌 五、简短提醒\n':''}${praises.join('\n')||'持续面见、认真听需求，让每次服务更有价值💪'}`;
 }
 function sendConfig(){const shared=C.project?data()?.sendConfigItem:null;return shared?root.WBSendPackage.validateProjectConfig(shared.payload):root.WBSendPackage.loadPilotConfig();}
 async function buildSendPackage(view=currentView,options={}){
  const reader=C.member,d=data(),month=currentMonth,source=d?.imports?.[0],P=root.WBSendPackage;
  if(!reader||!['project','region','store'].includes(reader.role))throw Error('请先通过BP／管理入口登录');
  if(state.loading||!d?.housing?.length||d.reader!==reader)throw Error('请先刷新当前账号的共享数据，再生成资料包');
  if(!source?.as_of||!source?.created_at)throw Error('当前数据缺少截止日期或版本，请重新导入后再试');
  if(state.exporting)throw Error('资料包正在生成，请稍候');
  const allScopes=options.allScopes===true;
  if(allScopes&&!C.project)throw Error('仅项目负责人可生成全司、5大区和18门店资料包');
  if(allScopes&&options.pilot)throw Error('全量资料包不能使用两店试行范围');
  if(state.savingSendConfig)throw Error('群名配置正在保存，请稍后生成');
  const pilot=options.pilot===true,config=pilot||C.project?sendConfig():null;
  if(pilot&&!config)throw Error('请先导入两店试行配置');
  const configured=new Map((config?.stores||[]).filter(s=>s.groupName).map(s=>[s.store,s.groupName])),pilotStores=new Set(config?.version===2?config.pilotStores:(config?.stores||[]).map(s=>s.store)),configVersion=JSON.stringify(config);
  const sourceDate=source.as_of,sourceVersion=source.created_at,configUpdatedAt=d.sendConfigItem?.updated_at||'';
  const requested=allScopes?{region:'',store:''}:{region:view.region||'',store:view.scope==='store'?canonicalStore(view.store||view.name):''},allowedStores=new Set(memberScopes().map(x=>x.store)),present=new Set(d.housing.map(h=>canonicalStore(h['门店'])));
  const stores=M.storeCatalog.filter(s=>s.ownerApplicable!==false&&present.has(s.store)&&(!requested.region||s.region===requested.region)&&(!requested.store||s.store===requested.store)&&(!pilot||pilotStores.has(s.store))&&(reader.role==='project'||reader.role==='region'&&s.region===reader.region||reader.role==='store'&&allowedStores.has(s.store)));
  if(allScopes){const missing=M.storeCatalog.filter(row=>row.ownerApplicable!==false&&!present.has(row.store));if(missing.length)throw Error('缺少门店在售数据：'+missing.map(row=>row.store).join('、')+'；请核对后再生成全量资料包');}
  if(pilot&&stores.length!==pilotStores.size)throw Error('两家试行店均须在当前授权和数据范围内，请切回包含两店的大区或全司后重试');
  if(!stores.length)throw Error('当前范围没有可导出的在售业主门店');
  const assertCurrent=()=>{if(C.member!==reader||data()!==d||currentMonth!==month||d.imports[0]!==source||source.as_of!==sourceDate||source.created_at!==sourceVersion||state.loading||state.savingSendConfig||(d.sendConfigItem?.updated_at||'')!==configUpdatedAt||(pilot||C.project)&&JSON.stringify(sendConfig())!==configVersion)throw Error('账号、月份、共享数据或试行群配置已变化，请刷新后重新生成');};
  state.exporting=true;
  try{
   const benchmark=C.project?companyBenchmarkData():null,benchmarkImage=benchmark?await root.WBCompanyBenchmark.image(benchmark):null;assertCurrent();
   const preparedAt=new Date().toISOString(),asOf=source.as_of,allQuality=Q.records(d.housing,d.meetings,d.items,month,asOf),byId=new Map(allQuality.map(r=>[r.houseId,r])),files=[],manifest={schemaVersion:2,month,asOf,sourceVersion:source.created_at,preparedAt,status:'prepared',pilot,stores:[]},monthlyGoals=goals();
   for(const [index,store] of stores.entries()){
    assertCurrent();
    const storeView={scope:'store',name:store.store,region:store.region,store:store.store},progress=rankProgress(M.table(d.housing,storeView,monthlyGoals,month,d.meetings||[],customerOptions(d)),d),metric=progress.rows.find(r=>r._level==='store'),metRows=metHouseRows(storeView),unmetRows=unmetTopRows(storeView);
    if(!metric)throw Error(store.store+'进展数据不完整，请刷新后重试');
    const feedbackRows=F.select(metric.metIds.map(id=>byId.get(id)).filter(Boolean)),quality=Q.summary(feedbackRows);
    if(metRows.length!==metric.met||quality.total!==metric.met)throw Error(store.store+'面见量与明细不一致，请核对后再生成');
    const cutoff='业主数据截至'+asOf,message=makeMessage(storeView,progress,metric,metric._target,cutoff,priorityFacts(storeView,progress.rows.filter(r=>r._level==='group')),novemberPraises(storeView,progress));
    storeView.kpis=publicationKpis(metric);
    const [progressImage,detailImages,qualityImages]=await Promise.all([createProgressImage(storeView,progress,month,{cutoff}),unmetTopImageBlobs(unmetRows,storeView),feedbackRows.length?F.images({rows:feedbackRows,summary:quality,month,scope:store.store,range:'本店共'+feedbackRows.length+'套',topicCounts:F.counts(feedbackRows)}):P.emptyFeedbackImage({store:store.store,month,asOf}).then(blob=>[blob])]);
    assertCurrent();
    if(!root.WBStorePublicationImage?.combine)throw Error('单店合并图片组件未加载，请刷新工作台后重试');
    const combinedImage=await root.WBStorePublicationImage.combine({progress:progressImage,unmet:detailImages});assertCurrent();
    const folder=(allScopes?'03_门店/':'')+String(index+1).padStart(2,'0')+'_'+store.store,messageFile=folder+'/话术.txt',progressFile=folder+'/01_面见进展及未面见TOP房明细.png',benchmarkFile=folder+'/03_全司面见标杆榜.png',qualityFiles=qualityImages.map((_,page)=>folder+'/02_业主面见真实反馈_'+String(page+1).padStart(2,'0')+'.png');
    files.push({name:messageFile,data:message},{name:progressFile,data:combinedImage},...qualityImages.map((blob,page)=>({name:qualityFiles[page],data:blob})),...(benchmarkImage?[{name:benchmarkFile,data:benchmarkImage}]:[]));
    manifest.stores.push({...store,groupName:configured.get(store.store)||'',deliveryKey:[month,asOf,source.created_at,store.store].join('|'),message:messageFile,images:[progressFile,...qualityFiles,...(benchmarkImage?[benchmarkFile]:[])],modules:{progress:[progressFile],details:[],quality:qualityFiles,...(benchmarkImage?{benchmark:[benchmarkFile]}:{})},moduleLabels:{...P.moduleLabels,progress:'面见及礼物进展＋未面见TOP房明细',details:'已合并至进展图',...(benchmarkImage?{benchmark:'全司面见标杆榜'}:{})},progressIncludesUnmetTop:true,unmetTopPages:detailImages.length,benchmarkStatus:benchmarkImage?'included':'由项目负责人统一提供',metrics:{met:metric.met,meetingCount:meetingValue(metric),gift:metric.gift,feedback:quality.feedback,unmetTopCount:unmetRows.length}});

   }
   if(allScopes){
    const allConfig=config?.version===2?config:P.projectConfigDefaults(config),regions=[...new Set(M.storeCatalog.filter(row=>row.ownerApplicable!==false).map(row=>row.region))];
    manifest.recordType='all-scope-publication-package';manifest.publications=[];
    const views=[{scope:'company',name:'全司',region:''},...regions.map(region=>({scope:'region',name:region,region}))];
    for(const [index,exportView] of views.entries()){
     assertCurrent();
     const levels=exportView.scope==='company'?['company','region','store']:['region','store','group'],progress=rankProgress(M.table(d.housing,exportView,monthlyGoals,month,d.meetings||[],customerOptions(d)),d);
     progress.rows=progress.rows.filter(row=>levels.includes(row._level));
     const metric=progress.rows.find(row=>row._level===exportView.scope);if(!metric)throw Error(exportView.name+'进展数据不完整，请刷新后重试');
     exportView.kpis=publicationKpis(metric);
     const cutoff='业主数据截至'+asOf,message=makeMessage(exportView,progress,metric,metric._target,cutoff,[],[]),image=await createProgressImage(exportView,progress,month,{cutoff});assertCurrent();
     const folder=index===0?'01_全司':'02_大区/'+String(index).padStart(2,'0')+'_'+exportView.name,messageFile=folder+'/话术.txt',imageFile=folder+'/01_面见及礼物进展.png',groupName=index===0?allConfig.company.groupName:allConfig.regions.find(row=>row.region===exportView.region)?.groupName||'';
     files.push({name:messageFile,data:message},{name:imageFile,data:image});
     const images=[imageFile];if(exportView.scope==='region'&&benchmarkImage){const boardFile=folder+'/02_全司面见标杆榜.png';files.push({name:boardFile,data:benchmarkImage});images.push(boardFile);}
     manifest.publications.push({scope:exportView.scope,name:exportView.name,region:exportView.region,groupName,levels,message:messageFile,images,month,asOf,sourceVersion:source.created_at});
    }
    manifest.scopeCount=manifest.stores.length+manifest.publications.length;
    manifest.recipientsComplete=[...manifest.stores,...manifest.publications].every(row=>row.groupName);
    files.push({name:'全部群名配置.csv',data:P.allGroupTemplate(allConfig)});
   }else manifest.recipientsComplete=manifest.stores.every(s=>s.groupName);
   manifest.operatorRole=reader.role;
   files.push({name:'manifest.json',data:JSON.stringify(manifest,null,2)},{name:'门店群配置.csv',data:P.groupTemplate(manifest.stores)},{name:'使用说明.txt',data:'本包已生成，尚未发送到微信。\n'+(allScopes?'包含全司1份、5个大区及18家门店，共24个范围。全司包含一段话术和一张进展图；每个大区另附全司面见标杆榜。\n':'')+'每店的面见礼物进展与全部未面见TOP房明细合为一张完整图片；真实反馈另列，项目负责人生成的版本再附同一张全司标杆海报。通常每店三张图；真实反馈原文较长时分页，保留全部内容。当前范围授权版本的全司榜由项目负责人统一提供。\n真实反馈按同一房源的面见时间连续呈现，分类为规则建议，仍需结合原文核对。请按清单中的images顺序取图；未面见TOP明细已在第一张合并图中，无需重复发送。\n'+(pilot?'本包仅含试行名单中的门店，完整群名已写入门店群配置.csv。\n':'已知群名已写入配置CSV；空白群名标为待配置，可下载但不能发送到未知群。\n')+'下载资料包不会发送消息。\n数据截至：'+asOf+'\n源数据版本：'+source.created_at+'\n生成时间：'+preparedAt});
   const blob=await P.zip(files);assertCurrent();
   return {blob,manifest,filename:month+'_'+asOf+'_'+(allScopes?'全司_5大区_18门店_24范围公示资料包':stores.length+'店'+(pilot?'试行':'微信')+'资料包')+(month==='2026-11'?'_标杆TOP提醒版':'')+'.zip'};
  }finally{state.exporting=false;}
 }
 function publicationKpis(metric){
  return [{label:'本月目标',value:metric._target==null?'待设置':metric._target+'套'},{label:'面见量',value:metric.met+'套'},{label:'面见次数',value:typeof meetingValue(metric)==='number'?meetingValue(metric)+'次':meetingValue(metric)},{label:'本月剩余差距',value:metric._target==null?'待确认':Math.max(0,metric._target-metric.met)+'套'},{label:'送礼登记',value:metric.gift+'套'}];
 }
 async function buildPublicationPackage(view=currentView){
  const reader=C.member,d=data(),month=currentMonth,source=d?.imports?.[0],P=root.WBSendPackage;
  if(!reader||!['project','region','store'].includes(reader.role))throw Error('请先通过BP／管理入口登录');
  if(state.loading||!d?.housing?.length||d.reader!==reader)throw Error('请先刷新当前账号的共享数据，再生成资料包');
  if(!source?.as_of||!source?.created_at)throw Error('当前数据缺少截止日期或版本，请重新导入后再试');
  if(state.exporting)throw Error('资料包正在生成，请稍候');
  if(!['company','region'].includes(view.scope))throw Error('全司与大区各生成一张进展图；门店请使用完整资料包');
  if(reader.role!=='project'&&(reader.role!=='region'||view.scope!=='region'||view.region!==reader.region))throw Error('当前账号无权导出该范围公示图文');
  const sourceDate=source.as_of,sourceVersion=source.created_at;
  const assertCurrent=()=>{if(C.member!==reader||data()!==d||d.reader!==reader||currentMonth!==month||d.imports[0]!==source||source.as_of!==sourceDate||source.created_at!==sourceVersion||state.loading)throw Error('账号、月份或共享数据已变化，请刷新后重新生成');};
  state.exporting=true;
  try{
   const exportView={scope:view.scope,name:view.name,region:view.scope==='region'?view.region:''},progress=rankProgress(M.table(d.housing,exportView,goals(),month,d.meetings||[],customerOptions(d)),d),levels=view.scope==='company'?['company','region','store']:['region','store','group'];
   progress.rows=progress.rows.filter(row=>levels.includes(row._level));
   const metric=progress.rows.find(row=>row._level===view.scope);if(!metric)throw Error('当前范围进展数据不完整，请刷新后重试');
   exportView.kpis=publicationKpis(metric);
   const cutoff='业主数据截至'+source.as_of,message=makeMessage(exportView,progress,metric,metric._target,cutoff,[],[]),image=await createProgressImage(exportView,progress,month,{cutoff});assertCurrent();
   const extraFiles=[],images=['01_面见及礼物进展.png'];if(view.scope==='region'&&C.project){const board=companyBenchmarkData(),boardImage=await root.WBCompanyBenchmark.image(board);assertCurrent();images.push('02_全司面见标杆榜.png');extraFiles.push({name:images[1],data:boardImage});}
   const manifest={recordType:'publication-package',schemaVersion:1,month,asOf:source.as_of,sourceVersion:source.created_at,preparedAt:new Date().toISOString(),status:'prepared',scope:view.scope,name:view.name,levels,operatorRole:reader.role,message:'话术.txt',images};
   const blob=await P.zip([{name:manifest.message,data:message},{name:manifest.images[0],data:image},...extraFiles,{name:'manifest.json',data:JSON.stringify(manifest,null,2)},{name:'使用说明.txt',data:'本包为当前范围的公示图文，包含一段话术和面见及礼物进展图；项目负责人生成的大区版本另附全司面见标杆榜，其他版本由项目负责人统一提供全司榜。\n仅下载，不会发送到微信；群名与转发由项目负责人处理。'}]);assertCurrent();
   return {blob,manifest,filename:month+'_'+source.as_of+'_'+view.name+'公示资料包'+(month==='2026-11'?'_标杆TOP提醒版':'')+'.zip'};
  }finally{state.exporting=false;}
 }
 async function downloadPublicationPackage(button){
  const label=button.textContent;button.disabled=true;button.textContent='资料生成中…';
  try{const result=await buildPublicationPackage(currentView),url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('已生成'+result.manifest.name+'公示图文，尚未发送到微信');}
  finally{if(button.isConnected){button.disabled=false;button.textContent=label;}}
 }
 function projectSendConfig(){const value=sendConfig();return value?.version===2?value:root.WBSendPackage.projectConfigDefaults(value);}
 function projectGroupRows(config){return [{scope:'company',name:'全司',region:'',groupName:config.company.groupName,field:'companyGroupName'},...config.regions.map((row,index)=>({scope:'region',name:row.region,region:row.region,groupName:row.groupName,field:'regionGroup_'+index})),...config.stores.map((row,index)=>({scope:'store',name:row.store,region:row.region,groupName:row.groupName,field:'storeGroup_'+index}))];}
 async function saveSendConfig(values){
  const reader=C.member,d=data();if(!C.project||!reader||reader.role!=='project')throw Error('仅项目负责人可修改群名配置');
  if(state.exporting)throw Error('资料包正在生成，请完成后再保存群名');
  if(state.savingSendConfig)throw Error('群名配置正在保存，请稍候');
  if(!d||d.reader!==reader||state.loading)throw Error('请先刷新当前账号的共享数据');
  const previous=d.sendConfigItem,expected=values.expectedVersion||null;
  if((previous?.updated_at||null)!==expected)throw Error('群名配置已更新，请刷新后再保存');
  const base=projectSendConfig(),stores=base.stores.map((row,index)=>({...row,groupName:values['storeGroup_'+index]??row.groupName})),pilotStores=base.pilotStores.filter(store=>stores.some(row=>row.store===store&&row.groupName)),body=root.WBSendPackage.validateProjectConfig({...base,mode:pilotStores.length?base.mode:'all',pilotStores,company:{groupName:values.companyGroupName??base.company.groupName},regions:base.regions.map((row,index)=>({...row,groupName:values['regionGroup_'+index]??row.groupName})),stores});
  state.savingSendConfig=true;
  try{const saved=await C.saveItem('2000-01','rules','wechat-send-config-v1',null,null,body,expected);if(C.member!==reader)return saved;for(const cached of Object.values(state.cache))if(cached?.reader===reader)cached.sendConfigItem=saved;return saved;}
  finally{state.savingSendConfig=false;}
 }
 function sendConfigPanel(){
  if(C.project){
   let config;try{config=projectSendConfig();}catch(error){return '<div class="ops-notice">'+E(error.message)+'</div>';}
   const rows=projectGroupRows(config),configured=rows.filter(row=>row.groupName).length,storeConfigured=config.stores.filter(row=>row.groupName).length;
   return '<div class="ops-notice send-config-panel"><h3>项目负责人统一操作 · 全司＋5大区＋18门店</h3><p>共24个公示范围，群名已配置 <b>'+configured+'/24</b> 个，待配置 '+(24-configured)+' 个。门店已配置 <b>'+storeConfigured+'/18</b> 店，待配置 '+(18-storeConfigured)+' 店。空白群名不影响下载。</p><details><summary>查看／修改24个范围的微信群完整名称</summary><form id="ops-send-config-form"><input type="hidden" name="expectedVersion" value="'+E(data()?.sendConfigItem?.updated_at||'')+'"><div class="review-table-scroll"><table class="review-tier-table send-config-table" aria-label="全司大区门店群配置"><thead><tr><th>层级</th><th>组织</th><th>微信群完整名称</th><th>状态</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+({company:'全司',region:'大区',store:'门店'}[row.scope])+'</td><td>'+E(row.name)+'</td><td><input name="'+row.field+'" aria-label="'+E(row.name)+'微信群完整名称" maxlength="200" placeholder="待配置，可稍后填写" value="'+E(row.groupName)+'"></td><td>'+(row.groupName?'已配置':'待配置')+'</td></tr>').join('')+'</tbody></table></div><button class="btn primary" type="submit">保存全部群名配置</button></form></details>'+'<p class="ops-muted">群名由项目负责人统一保存，保留表情与标点。下载不会发送微信。</p></div>';
  }
  return '';
 }
 async function downloadSendPackage(button,pilot=false,allScopes=false){
  const label=button.textContent;button.disabled=true;button.textContent='资料生成中…';notify('正在生成公示话术与图片，请保留当前页面');
  try{const exportView=C.project?{scope:'company',name:'全司'}:currentView,result=await buildSendPackage(exportView,{pilot,allScopes}),url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('已生成'+(result.manifest.scopeCount?result.manifest.scopeCount+'个范围':result.manifest.stores.length+'家门店')+'公示资料，尚未发送到微信');}
  finally{if(button.isConnected){button.disabled=false;button.textContent=label;}}
 }
 function publicationPanel(view){
  if(!C.member)return `<div class="block ops-panel"><p>项目负责人登录后，可统一下载全司、5个大区和18家门店的公示资料。</p><button class="btn" data-ops="login">BP／管理入口</button></div>`;
  const buttons='<button class="btn primary" data-ops="'+(C.project?'all-publication-package':'send-package')+'">'+(C.project?'下载全部公示资料包（全司＋5大区＋18门店）':'生成当前范围微信资料包')+'</button>'+(['company','region'].includes(view.scope)&&(C.project||C.member.role==='region'&&view.region===C.member.region)?'<button class="btn" data-ops="publication-package">下载'+E(view.name)+'公示图文</button>':'');
  return '<div class="block ops-panel"><div class="ops-actions">'+buttons+'</div><p class="ops-muted">包含对应公示话术与图片；仅下载，不会发送微信。'+(C.project?'单店进展与未面见TOP明细合为一张；真实反馈和全司标杆海报分别保留。':'单店进展与未面见TOP明细合为一张；全司标杆榜由项目负责人统一提供。')+'真实反馈较长时自动分页。</p>'+sendConfigPanel()+'</div>';
 }
 function parkedRecords(view){
  const d=data();if(!C.member||d?.reader!==C.member)return '';
  const store=view.scope==='store'?(view.store||view.name):null,record=payload('scene','daily',store),tasks=taskList(view);
  if(!record.text&&!tasks.length)return '';
  return `<details class="block ops-panel ops-parked-records"><summary>查看已有推动记录</summary>${record.text?`<h3>现场原文</h3><p class="ops-pre">${E(record.text)}</p>`:''}${record.analysisText?`<h3>已整理内容</h3><p class="ops-pre">${E(record.analysisText)}</p>`:''}${tasks.map(t=>`<article class="ops-task"><h3>${E(t.title||t.action)}</h3><p>${E(t.store)} · ${E(t.owner||'负责人待明确')} · ${E(t.due||'时间待明确')}</p><p class="ops-pre">${E(t.action)}</p><p>执行结果：${E(t.result||'待反馈')}</p></article>`).join('')}</details>`;
 }

 function loginPanel(){const disabled=C.configured?'':'disabled';return `<div class="block ops-panel"><h3>成员登录</h3><p class="ops-muted">日常进展无需登录。BP补充、核账及管理使用已授权工号后4位进入，无需密码；开头的0需要保留。</p><form id="ops-login-form" class="ops-login"><label>工号后4位<input name="loginId" type="text" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="username" placeholder="请输入4位工号" ${disabled} required></label><button class="btn primary" type="submit" ${disabled}>登录工作台</button></form>${C.configured?'':'<p class="ops-muted">共享服务尚未连接，账号开通后即可使用工号登录。</p>'}</div>`;}
 const archiveType=file=>/\.pdf$/i.test(file.original_name||'')?'PDF':'Word';
 const archiveSize=bytes=>{const n=Number(bytes||0);return n>=1024*1024?(n/1024/1024).toFixed(n>=10*1024*1024?0:1)+' MB':Math.max(1,Math.round(n/1024))+' KB';};
 const archiveTime=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'时间待同步';
 function archiveCards(files){return files.length?`<div class="archive-file-grid">${files.map((file,index)=>`<article class="archive-file-card"><div class="archive-file-icon" aria-hidden="true">${archiveType(file)==='PDF'?'PDF':'W'}</div><div class="archive-file-main"><span class="archive-file-no">复盘文件 ${String(index+1).padStart(2,'0')}</span><h3>${E(file.title||file.original_name)}</h3><p>${E(file.original_name)} · ${archiveType(file)} · ${archiveSize(file.size_bytes)}</p><time>${E(archiveTime(file.created_at))}上传</time><div class="ops-actions"><a class="btn primary" href="${E(file.url)}" target="_blank" rel="noopener">打开原文件</a><a class="btn" href="${E(file.downloadUrl||file.url)}">下载原文件</a></div></div></article>`).join('')}</div>`:`<div class="archive-empty"><h3>本月尚未上传复盘文件</h3><p>项目负责人上传历史周复盘或月复盘后，会在这里按原文件展示；不再补做历史数据看板。</p></div>`;}
 function historyArchive(view){const files=data()?.archives||[];return hero(`${Number(currentMonth.slice(5))}月历史复盘归档`,`${monthLabel(currentMonth)} · 保留原有周复盘与月复盘文件`)+kpis([['归档文件',files.length+'份','同一月份可留存多份'],['归档方式','原文件','不重新拆解历史数据'],['共享查看','免登录','打开主链接即可查看和下载']])+block('history-files','历史复盘文件',`${state.loading&&!data()?'<div class="ops-notice">正在读取本月归档文件…</div>':archiveCards(files)}${C.project?'<div class="archive-admin-entry"><button class="btn" data-ops="admin">上传或管理本月文件</button></div>':''}`,'本页仅留存当时形成的线下复盘文件，不再按现有工作台模块补齐历史数据。');}
 function historyAdmin(){
  if(!C.member)return hero('历史复盘文件管理','项目负责人可按月份批量上传原有Word或PDF复盘文件')+loginPanel();
  if(!C.project)return hero('历史复盘文件管理','历史文件由项目负责人统一上传和发布')+'<div class="ops-notice">当前账号可以查看已发布文件，不能上传全司历史复盘。</div>';
  const files=data()?.archives||[],notice=state.archiveNotice?`<div class="ops-notice ${state.archiveNotice.includes('失败')?'warning':''}" role="status">${E(state.archiveNotice)}</div>`:'';
  return hero(`${Number(currentMonth.slice(5))}月历史复盘文件管理`,`${monthLabel(currentMonth)} · 可一次选择并上传多个留存文件`)+block('admin-archive','上传复盘文件',`<form id="ops-archive-form" class="block ops-panel"><div class="ops-form"><label>归档月份<input type="month" name="month" value="${E(currentMonth)}" readonly></label><label class="wide">历史周复盘／月复盘文件<input type="file" name="files" multiple accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" required></label></div><p class="ops-muted">支持DOC、DOCX或PDF；单个文件不超过25MB。可一次选择多份，同名文件也会分别保留，不覆盖已有文件。</p><label class="ops-check archive-public-confirm"><input type="checkbox" name="publicConfirmed" required>我已确认所选复盘文件可以在免登录共享页面公开查看和下载</label><button class="btn primary" type="submit">上传并发布到本月归档</button><div id="ops-archive-progress" aria-live="polite"></div></form>${notice}`)+block('admin-archive-list',`本月已归档文件 · ${files.length}份`,archiveCards(files),'上传完成后不需要重新发布网页，其他人刷新原主链接即可看到。');
 }
 function finance(view){
  if(!C.member)return hero('费用核账','由门店BP补齐资料、核对分摊与收付款；按月保留记录')+loginPanel();const d=data();if(!d)return hero('费用核账','正在读取共享账本');
  const s=scope();if(!s.store){const stores=DATA.regions.flatMap(r=>(!s.region||s.region===r.name)?r.stores:[]).filter(store=>!hiddenCustomerStores.has(canonicalStore(store)));return hero('费用核账 · '+view.name,currentMonth+' · 请选择单店核账')+`<div class="ops-store-grid">${stores.map(store=>{const candidates=M.expenseRecords(d.housing,d.items,currentMonth,{store}),priced=candidates.filter(c=>c.priceCents>0);const period=d.periods.find(p=>p.store===store);return `<button class="ops-store-card" data-ops="choose-store" data-store="${E(store)}"><b>${E(store)}</b><span>送礼候选 ${expenseCount(candidates)}份 · 已核价 ${expenseCount(priced)}份</span><span>${period?.locked?'已结账锁定':'本月核账中'}</span></button>`;}).join('')}</div>`;}
  const period=d.periods.find(p=>p.store===s.store),locked=!!period?.locked,confirmed=!!item('rules','monthly',s.store);
  const expenses=locked&&period.summary.lines?period.summary.lines:M.expenseRecords(d.housing,d.items,currentMonth,s),candidates=expenses;
  const leadership=(d.directory||[]).find(x=>x.store===s.store&&x.region===s.region&&currentMonth>=(x.payload.effectiveMonth||'9999-12'))?.payload||{};
  const head=locked&&period.summary.head?period.summary.head:{storeHead:leadership.storeHead||'',regionHead:leadership.regionHead||'',...payload('expense','@@head',s.store)},rules=locked&&period.summary.rules?period.summary.rules:{cap:3000,advisor:300,manager:500,storeContribution:currentMonth<chinaToday().slice(0,7)?0:30000,regionContribution:0,extraWeights:[1,1,1],...payload('rules','monthly',s.store)};
  let ledger;try{ledger=locked?period.summary:M.ledger(expenses,rules,head);if(!locked&&!confirmed)ledger.missing++;}catch(e){return hero('费用核账 · '+s.store,currentMonth)+`<div class="ops-notice warning">${E(e.message)}</div>`;}
  const cashItems=d.items.filter(x=>x.kind==='expense'&&x.store===s.store&&x.payload.recordType==='cash'),cash=M.cashSettlement(ledger,cashItems.map(x=>x.payload));
  state.finance={candidates,head,rules,expenses,ledger,locked,period,cash,cashItems};
  const needs=Object.fromEntries(['price','proof','people','payment'].map(k=>[k,expenses.filter(e=>W.expenseNeeds(e)[k]).length]));
  const ruleFields=[['cap','单份可报上限'],['advisor','顾问每份承担'],['manager','经理每份承担'],['storeContribution','本月店总应注入'],['regionContribution','本月大区总应注入']];
  return hero('费用核账 · '+s.store,currentMonth+' · 门店BP核账 · '+(locked?'已结账锁定':'核账中'))+kpis([['送礼明细',expenseCount(candidates)+'份',candidates.filter(x=>!x.voided).length+'条记录，系统与补录合并核账'],['实际费用','¥'+money(ledger.actual),'已核价单价 × 数量合计'],['资料待补',ledger.missing+'项','单价、凭证、人员信息'],['期末应结余','¥'+money(ledger.closingStore+ledger.closingRegion),'分摊后应留存，待实收付核对']])+block('expense-todo','门店BP核账待办',`<div class="block ops-panel"><div class="ops-actions">${Object.entries({todo:'待处理',price:'待补单价 '+needs.price,proof:'待补凭证 '+needs.proof,people:'待补人员 '+needs.people,payment:'待核销 '+needs.payment,all:'全部记录'}).map(([key,label])=>`<button class="btn ${state.expenseFilter===key?'primary':''}" data-ops="expense-filter" data-filter="${key}">${label}</button>`).join('')}</div><p class="ops-muted">房源与维护人从送礼底表带入；同一采购凭证可在编辑记录时复用。金额、付款人与实际收付由BP核对。</p><a class="btn" href="#expense-records">处理所选记录</a></div>`)+block('expense-head','账本与当月规则',`<form id="ops-ledger-head" class="block ops-panel ops-form"><label>店总姓名<input name="storeHead" value="${E(head.storeHead||'')}" ${locked?'disabled':''} required></label><label>大区总姓名<input name="regionHead" value="${E(head.regionHead||'')}" ${locked?'disabled':''}></label><label>期初店总池余额<input name="openingStore" type="number" min="0" step="0.01" value="${money(head.openingStore)}" ${locked?'disabled':''}></label><label>期初大区池余额<input name="openingRegion" type="number" min="0" step="0.01" value="${money(head.openingRegion)}" ${locked?'disabled':''}></label><label class="wide">期初余额及调整说明<input name="note" value="${E(head.note||'')}" ${locked?'disabled':''} placeholder="按上月已结账余额核对，不自动清零"></label><div class="ops-actions"><button class="btn primary" ${locked?'disabled':''}>保存账本信息</button><button type="button" class="btn" data-ops="carry">读取上月结账余额</button></div></form><form id="ops-rules-form" class="block ops-panel ops-form">${ruleFields.map(([key,label])=>`<label>${label}（元）<input name="${key}" type="number" min="0" step="0.01" value="${money(rules[key])}" ${!C.project||locked?'disabled':''}></label>`).join('')}<label>超额分摊<select name="extraMode" ${!C.project||locked?'disabled':''}><option value="equal" ${rules.extraMode!=='advisor'&&rules.extraMode!=='custom'?'selected':''}>顾问／经理／店总各1/3</option><option value="advisor" ${rules.extraMode==='advisor'?'selected':''}>超额由顾问承担</option><option value="custom" ${rules.extraMode==='custom'?'selected':''}>自定义比例</option></select></label>${['顾问','经理','店总'].map((name,i)=>`<label>${name}超额比例<input name="weight${i}" type="number" min="0" value="${E(rules.extraWeights[i])}" ${!C.project||locked?'disabled':''}></label>`).join('')}<button class="btn primary" ${!C.project||locked?'disabled':''}>保存本店当月规则</button><p class="ops-muted wide">${confirmed?'本店本月规则已确认。':'本月规则待负责人确认，当前为试算；历史月份注入额请按实际填写。'}金额按分计算并对平。店总注入、当月耗用和结余分别记账；规则只作用于当前单店、当前月份。</p></form>`)+
   block('expense-records','送礼明细与采购凭证',expenseRecordsPanel(expenses,locked))+
   block('expense-settlement','费用分摊与收付款',`<div class="block ops-panel"><div class="ops-ledger-grid">${[['顾问承担',ledger.advisor],['经理承担',ledger.manager],['店总池耗用',ledger.storeConsumed],['店总超额承担',ledger.extraStore],['大区池耗用',ledger.regionConsumed],['公司待报销',ledger.company]].map(([label,v])=>`<div><span>${label}</span><b>¥${money(v)}</b></div>`).join('')}</div><p>店总池期末：¥${money(ledger.closingStore)}；大区池期末：¥${money(ledger.closingRegion)}</p><div class="ops-actions"><button class="btn primary" data-ops="copy-ledger">复制核账文字</button><button class="btn" data-ops="ledger-image">复制核账图片</button>${C.project?`<button class="btn" data-ops="${locked?'unlock':'lock'}">${locked?'解锁调整':'核对完成，结账锁定'}</button>`:''}</div><p class="ops-muted">${ledger.missing?'当前资料未齐，分摊与收付款方向仅供核对。':'资料已齐，请结合实际收付款核对。'}应承担、实际已收款和公司已到账分别记录。</p><div id="ops-ledger-text">${E(ledgerText()).replace(/\n/g,'<br>')}</div></div>`)+cashPanel();
 }
 function expensePayerLabel(e){
  const identity=e.payerIdentity||root.WBManagerDirectory?.recognize?.(e.payer,e);
  if(identity?.status==='matched')return '经理';
  const payer=M.expensePersonName(e.payer),advisor=M.expensePersonName(e.advisor);
  return payer&&payer===advisor?'维护人（职务待核对）':'身份待核对';
 }
 function updateExpensePeople(form,changed=''){
  if(!form?.elements)return;const context=state.expenseContext||scope(),manager=form.elements.manager;if(!manager)return;
  const oldAuto=form.dataset.expenseResolvedManager||'';
  if(['manager','group'].includes(changed)&&form.elements.managerConfirmed)form.elements.managerConfirmed.checked=false;
  if(changed==='manager'&&manager.value!==oldAuto)delete form.dataset.expenseResolvedManager;
  if(changed==='group'&&oldAuto&&manager.value===oldAuto)manager.value='';
  const result=M.expensePeople({...context,group:form.elements.group?.value||'',payer:form.elements.payer?.value||'',advisor:form.elements.advisor?.value||'',manager:manager.value||'',...(oldAuto&&manager.value===oldAuto?{managerSource:'directory',managerDirectoryName:oldAuto}:{})});
  if(!M.expensePersonName(manager.value)&&result.manager){manager.value=result.manager;form.dataset.expenseResolvedManager=result.manager;}
  const confirmation=form.querySelector('#ops-expense-manager-confirm');if(confirmation){confirmation.hidden=!result.managerConflict;if(confirmation.style?.setProperty)confirmation.style.setProperty('display',result.managerConflict?'flex':'none','important');else if(confirmation.style)confirmation.style.display=result.managerConflict?'':'none';}
  const target=form.querySelector('#ops-expense-people-status');if(target){
   const payer=result.payerIdentity?.status==='matched'?'付款人已识别为经理（'+result.payerIdentity.groups.join('、')+'）':'付款人'+expensePayerLabel(result);
   target.textContent=payer+'；负责经理：'+(result.manager||'待补充')+(result.managerSource==='directory'?'（按店组名册匹配）':'')+'。垫付款人与分摊人员分别计算。'+(result.managerConflict?' 已填经理与名册不一致，请核对当期记录。':'');
  }
 }
 function financePersonRows(f=state.finance){
  if(!f)return [];const people=new Map(),nameOf=M.expensePersonName;
  function person(raw){const name=nameOf(raw);if(!name||name===nameOf('公司（待财务报销）'))return null;if(!people.has(name))people.set(name,{name,advance:0,assessed:0,received:0,refunded:0,amount:0,role:'身份待核对'});return people.get(name);}
  for(const e of f.ledger.lines||[]){const payer=person(e.payer),advisor=person(e.advisor),manager=person(e.manager);if(payer)payer.advance+=e.amountCents||0;if(advisor){advisor.assessed+=e.advisorShare||0;advisor.role='维护人';}if(manager){manager.assessed+=e.managerShare||0;manager.role='经理';}}
  const storeHead=person(f.head.storeHead),regionHead=person(f.head.regionHead);if(storeHead){storeHead.assessed+=(f.rules.storeContribution||0)+(f.ledger.extraStore||0);storeHead.role='店总';}if(regionHead){regionHead.assessed+=f.rules.regionContribution||0;regionHead.role='大区总';}
  for(const item of f.cashItems||[]){const e=item.payload||item;if(e.voided||e.type==='company')continue;const row=person(e.name);if(row){if(e.type==='receive')row.received+=e.amount;else if(e.type==='refund')row.refunded+=e.amount;}}
  for(const b of f.cash.balances){const row=person(b.name);if(row)row.amount=b.amount;}
  for(const row of people.values())if(!['店总','大区总'].includes(row.role)&&root.WBManagerDirectory?.recognize?.(row.name,scope()).status==='matched')row.role='经理';
  return [...people.values()].filter(row=>row.amount!==0);
 }
 function expenseCount(records){return records.filter(x=>!x.voided).reduce((total,x)=>total+(Number.isFinite(M.expenseQuantity(x))?M.expenseQuantity(x):0),0);}
 function canManageExpense(s=scope()){const m=C.member;return !!s.store&&!!m&&(m.role==='project'||m.role==='region'&&m.region===s.region||m.role==='store'&&memberScopes().some(x=>x.region===s.region&&x.store===canonicalStore(s.store)));}
 function expenseRecordsPanel(expenses,locked){
  const allowed=canManageExpense(),disabled=locked||!allowed;
  expenses=expenses.map(e=>M.expensePeople(e));
  return `<div class="block ops-panel ops-expenses"><div class="ops-expense-toolbar"><div><b>系统明细与BP补录，一起核账</b><p class="ops-muted">系统尚未登记的送礼，BP核实后可直接补录；人员或凭证可稍后补齐。</p></div><button class="btn primary" data-ops="add-expense" ${disabled?'disabled':''}>手动补录送礼明细</button></div>${locked?'<p class="ops-muted">本月账本已锁定，调整明细请先由项目负责人解锁。</p>':''}${expenses.filter(e=>W.needsMatch(e,state.expenseFilter)).map(e=>`<article class="ops-expense"><div><b>${E(e.project)} · ${E(e.room)}</b><span>${E(e.group||'店组待补')} · 维护人${E(e.advisor||'待补')}</span></div>${e.source==='manual'?`<p class="ops-muted"><span class="ops-expense-source">BP手动补录</span>${e.verifiedAt?' · 核实于'+E(archiveTime(e.verifiedAt)):''}${e.giftDate?' · 送礼日期'+E(e.giftDate):''}</p>`:''}${e.matchedHouseId?'<p class="ops-muted">系统已出现对应房源，沿用本条费用核账。</p>':e.retained?'<p class="ops-muted">已保留的当月费用记录；当前底表未列为送礼候选。</p>':''}${e.duplicateWarning?`<p class="ops-notice warning">${E(e.duplicateWarning)}</p>`:''}<p>实际单价：${e.priceCents?'¥'+money(e.priceCents):'待补'} · 数量：${Number.isFinite(M.expenseQuantity(e))?M.expenseQuantity(e)+'份':'待核对'} · 总金额：${Number.isFinite(M.expenseAmount(e))?'¥'+money(M.expenseAmount(e)):'待补'}<br>付款人：${E(e.payer||'待补')}（${E(expensePayerLabel(e))}） · 凭证：${e.proofPath?'已保存':'待补'}${e.giftName?' · 礼品：'+E(e.giftName):''}${e.voided?' · 已作废':''}<br>负责经理：${E(e.manager||'待补充')}${e.managerSource==='directory'?'（按店组名册匹配）':''}${e.managerConflict?' · 与名册不一致，请核对当期记录':''}</p><div class="ops-actions"><button class="btn" data-ops="edit-expense" data-expense="${E(M.expenseId(e))}" ${disabled||e.voided?'disabled':''}>补充／编辑</button>${e.proofPath?`<button class="btn" data-ops="proof" data-path="${E(e.proofPath)}">查看凭证</button>`:''}</div></article>`).join('')||'<p>当前筛选没有记录；可切换查看全部，或补录已核实的送礼明细。</p>'}</div>`;
 }
 function proofOptions(selected){const seen=new Set();return state.finance.expenses.filter(x=>!x.voided&&x.proofPath&&M.expenseId(x)!==M.expenseId(selected)&&!seen.has(x.proofPath)&&seen.add(x.proofPath)).map(x=>`<option value="${E(x.proofPath)}">${E(x.proofName||x.project+' '+x.room)}</option>`).join('');}
 function expensePropertyOptions(s=scope(),d=data()){
  const seen=new Set();return (d?.housing||[]).filter(r=>canonicalStore(r['门店'])===s.store&&r['大区']===s.region&&M.text(r['房源编号'])).map(r=>{
   const houseId=M.text(r['房源编号']),project=M.text(r['分盘']||r['总盘']),room=M.text(r['房间号']);
   return {houseId,project,room,group:M.text(r['店组']),advisor:M.text(r['维护人姓名']),manager:M.expensePeople({region:s.region,store:s.store,group:M.text(r['店组']),manager:M.text(r['经理姓名']||r['负责经理']||r['店经理'])}).manager,label:[project,room,houseId].filter(Boolean).join(' · ')};
  }).filter(r=>!seen.has(r.houseId)&&seen.add(r.houseId));
 }
 function assertExpenseContext(context){
  if(!context||C.member!==context.member||currentMonth!==context.month||scope().store!==context.store||scope().region!==context.region)throw Error('月份、门店或登录状态已变化，请关闭后重新打开明细');
  if(!canManageExpense(context))throw Error('请进入已授权的单店补录');
  if(data()?.periods.some(p=>p.store===context.store&&p.locked))throw Error('本月账本已锁定，请先由项目负责人解锁');
 }
 function openExpense(record){
  const s=scope(),context={...s,month:currentMonth,member:C.member,isNew:!record};assertExpenseContext(context);
  if(record?.voided)throw Error('已作废记录保留供核对，不能编辑');
  const x=M.expensePeople(record?{...record}:{expenseId:'@@gift:'+M.uuid(),houseId:'',recordType:'gift',source:'manual',month:currentMonth,...s,quantity:1,paymentStatus:'pending'});
  context.expectedVersion=record?item('expense',M.expenseId(record),s.store)?.updated_at:undefined;state.selectedExpense=x;state.expenseContext=context;
  const manual=x.source==='manual',identityReadonly=!context.isNew;
  dialog(`<form id="ops-expense-form" class="ops-form ops-expense-form"><h2 class="wide">${context.isNew?'手动补录送礼明细':'补充／编辑送礼明细'}</h2><div class="wide ops-expense-context"><span>${E(currentMonth)}</span><span>${E(s.region)} · ${E(s.store)}</span></div><p class="ops-muted wide">${context.isNew?'先选择本店房源，或直接填写楼盘与房间。核实单价和数量后即可保存，资料待补会进入核账待办。':'修改会同步更新本月核账；人员与凭证可稍后补齐。'}</p>${context.isNew?`<label class="wide">查找本店房源（选填）<input name="houseLookup" list="ops-expense-properties" autocomplete="off" placeholder="输入楼盘、房间或房源编号，选择匹配项"><datalist id="ops-expense-properties">${expensePropertyOptions(s).map(r=>`<option value="${E(r.label)}"></option>`).join('')}</datalist></label><p id="ops-expense-property-status" class="ops-muted wide" aria-live="polite"></p>`:''}<label>楼盘／分盘<input name="project" value="${E(x.project||'')}" ${!manual?'readonly':'required'}></label><label>房间号<input name="room" value="${E(x.room||'')}" ${!manual?'readonly':'required'} placeholder="如：1号楼-1单元-101"></label><label>实际单价（元）<input name="price" type="number" min="0.01" step="0.01" value="${x.priceCents?money(x.priceCents):''}" required></label><label>送礼数量（份）<input name="quantity" type="number" min="1" max="10000" step="1" value="${E(M.expenseQuantity(x))}" required></label><div class="wide ops-expense-total"><span>本条总金额</span><output id="ops-expense-total" aria-live="polite">${Number.isFinite(M.expenseAmount(x))?'¥'+money(M.expenseAmount(x)):'待填写单价'}</output><small>数量为归入本条送礼明细的份数；一笔采购对应多条明细时，可复用凭证。</small></div><label class="wide">实际付款人（可稍后补齐）<input name="payer" value="${E(x.payer||'')}" placeholder="填写实际垫付款人"></label><p id="ops-expense-people-status" class="ops-muted wide" aria-live="polite"></p><label id="ops-expense-manager-confirm" class="ops-check wide" style="${x.managerConflict?'':'display:none!important'}" ${x.managerConflict?'':'hidden'}><input type="checkbox" name="managerConfirmed" ${x.managerConflictConfirmed?'checked':''}><span data-manager-confirm-label>我已核实该月份的负责经理与当前名册不同，按已填经理记账</span></label>${WBProofs.field('采购付款凭证（可稍后补齐）',x.proofName||'')}<label class="wide">或复用本店当月已保存凭证<select name="existingProof"><option value="">${x.proofPath?'保留当前凭证':'不复用，稍后补齐或上传新凭证'}</option>${proofOptions(x)}</select></label><details class="wide ops-expense-details"><summary>分摊人员与其他信息（可稍后补齐）</summary><div class="ops-form"><label>店组<input name="group" value="${E(x.group||'')}"></label><label>维护顾问<input name="advisor" value="${E(x.advisor||'')}"></label><label>负责经理<input name="manager" value="${E(x.manager||'')}"></label><label>房源编号（选填）<input name="houseId" value="${E(x.houseId||'')}" ${identityReadonly?'readonly':''} placeholder="无编号可留空"></label><label>送礼日期（选填）<input name="giftDate" type="date" value="${E(x.giftDate||'')}" min="${E(currentMonth)}-01" max="${E(currentMonth)}-${new Date(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5)),0).getDate()}"></label><label>礼品名称（选填）<input name="giftName" value="${E(x.giftName||'')}"></label><label>收付款状态<select name="paymentStatus">${Object.entries({pending:'待核对',collected:'已收个人承担',returned:'已返还垫付款',settled:'已核销'}).map(([k,v])=>`<option value="${k}" ${x.paymentStatus===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="wide">说明（选填）<textarea name="note">${E(x.note||'')}</textarea></label></div></details>${manual?`<label class="ops-check wide ops-expense-verify"><input type="checkbox" name="bpVerified" ${x.bpVerified?'checked':''} required>我已核实本条送礼事实、单价与数量，并确认归属本店本月</label>`:''}<div id="ops-expense-duplicate" class="wide" role="alert"></div><button class="btn primary wide" type="submit">保存并关联核账</button></form>`);
  const form=document.getElementById('ops-expense-form');if(form?.elements){if(x.managerSource==='directory')form.dataset.expenseResolvedManager=x.manager;updateExpensePeople(form);}
 }
 function applyExpenseProperty(form){
  if(!state.expenseContext?.isNew)return;const value=form.elements.houseLookup.value.trim(),rows=expensePropertyOptions(state.expenseContext);
  const matches=rows.filter(r=>r.label===value||r.houseId===value);if(matches.length!==1){expensePropertyInput(form,'houseLookup');return;}
  const row=matches[0];for(const key of ['houseId','project','room','group','advisor','manager'])form.elements[key].value=row[key]||'';
  form.dataset.expenseHouseId=row.houseId;form.dataset.expenseHouseLookup=row.label;form.dataset.expenseProject=row.project;form.dataset.expenseRoom=row.room;for(const key of ['group','advisor','manager'])form.dataset['expenseAuto'+key]=row[key]||'';
  const status=form.querySelector('#ops-expense-property-status');if(status)status.textContent='已关联所选房源；修改地址或查找内容会取消自动关联。';updateExpensePeople(form);
 }
 function expensePropertyInput(form,name){
  if(!state.expenseContext?.isNew||!form.dataset.expenseHouseId)return;
  const linkedId=form.dataset.expenseHouseId,lookup=form.elements.houseLookup;
  const changed=name==='houseId'||name==='project'&&form.elements.project.value!==form.dataset.expenseProject||name==='room'&&form.elements.room.value!==form.dataset.expenseRoom||name==='houseLookup'&&lookup.value.trim()!==form.dataset.expenseHouseLookup&&lookup.value.trim()!==linkedId;
  if(!changed)return;
  if(name!=='houseId'&&form.elements.houseId.value===linkedId)form.elements.houseId.value='';
  if(name!=='houseLookup')lookup.value='';
  for(const key of ['group','advisor','manager']){const stored='expenseAuto'+key;if(form.elements[key].value===form.dataset[stored])form.elements[key].value='';delete form.dataset[stored];}
  for(const key of ['expenseHouseId','expenseHouseLookup','expenseProject','expenseRoom'])delete form.dataset[key];
  const status=form.querySelector('#ops-expense-property-status');if(status)status.textContent=name==='houseId'?'已改为手动填写房源编号，请核对编号与地址。':'已取消原房源自动关联；可按当前地址手填保存，或重新选择房源。';
 }
 function expenseMoney(values){
  const raw=String(values.price??'').trim(),qty=String(values.quantity??'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('请填写大于0的实际单价，最多保留两位小数');
  const priceCents=Math.round(Number(raw)*100),quantity=Number(qty),amountCents=M.expenseAmount({priceCents,quantity});
  if(!/^\d+$/.test(qty)||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw Error('送礼数量须为1至10000的整数');
  if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('实际单价须大于0，且总金额不能超出有效范围');
  return {priceCents,quantity,amountCents};
 }
 function updateExpenseTotal(form){const target=form.querySelector('#ops-expense-total');if(!target)return;try{target.textContent='¥'+money(expenseMoney({price:form.elements.price.value,quantity:form.elements.quantity.value}).amountCents);}catch{target.textContent='请核对单价与数量';}}
 async function saveExpense(form,values){
  const context=state.expenseContext,x=state.selectedExpense;assertExpenseContext(context);if(!x)throw Error('请重新打开送礼明细');
  const trim=key=>String(values[key]??'').trim(),project=trim('project'),room=trim('room'),manual=x.source==='manual';if(manual&&(!project||!room))throw Error('请填写楼盘与房间号');
  const amounts=expenseMoney(values);if(manual&&!values.bpVerified)throw Error('请先核实并勾选本条送礼信息');
  const houseId=context.isNew?trim('houseId'):M.text(x.houseId),id=context.isNew&&houseId?houseId:M.expenseId(x);
  if(context.isNew&&houseId.startsWith('@@'))throw Error('请填写真实房源编号，或留空');
  const date=trim('giftDate');if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==context.month||!Number.isFinite(new Date(date+'T00:00:00Z').getTime())||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw Error('送礼日期须为当前月份的有效日期');
  const all=M.expenseRecords(data().housing,data().items,context.month,context);
  const body={...x,...amounts,expenseId:id,recordType:'gift',houseId,project,room,month:context.month,region:context.region,store:context.store,group:trim('group'),payer:trim('payer'),advisor:trim('advisor'),manager:trim('manager'),giftDate:date,giftName:trim('giftName'),paymentStatus:values.paymentStatus||'pending',note:trim('note')};
  if(values.managerConfirmed)body.managerConfirmation=M.expenseManagerKey(body);else delete body.managerConfirmation;
  for(const field of ['payerIdentity','payerRole','payerRoleStatus','managerSource','managerDirectoryName','managerConflict','managerConflictConfirmed','identityIssues'])delete body[field];
  if(manual){body.source='manual';body.bpVerified=true;body.verifiedAt=x.verifiedAt||new Date().toISOString();}
  const duplicates=M.findExpenseDuplicates({...body,expenseId:context.isNew?x.expenseId:id},all);
  if(context.isNew){const same=all.find(e=>M.expenseId(e)===id);if(same&&!duplicates.includes(same))duplicates.push(same);}
  const host=form.querySelector('#ops-expense-duplicate');if(host)host.innerHTML='';
  if(duplicates.length){if(host)host.innerHTML=`<div class="ops-notice warning"><b>本月已有对应送礼明细</b><p>请补充已有记录，避免重复计入费用。</p>${duplicates.map(e=>`<button class="btn" type="button" data-ops="edit-expense" data-expense="${E(M.expenseId(e))}" ${e.voided?'disabled':''}>查看／编辑 ${E(e.project)} · ${E(e.room)}</button>`).join('')}</div>`;throw Error('发现已有送礼明细，请编辑已有记录');}
  const file=WBProofs.file(form);
  if(values.existingProof){const source=all.find(e=>!e.voided&&e.proofPath===values.existingProof);if(!source)throw Error('所选凭证已变化，请刷新');body.proofPath=source.proofPath;body.proofName=source.proofName;}
  if(file){const proof=await C.uploadProof(file,context.month,context.region,context.store);body.proofPath=proof.path;body.proofName=proof.name;}
  assertExpenseContext(context);if(state.expenseContext!==context)throw Error('已打开其他明细，请回到原记录重新核对后保存');
  // A later import may annotate a match, but the original expense key remains stable.
  for(const key of ['key','updated_at','retained','matchedHouseId','duplicateWarning'])delete body[key];
  await C.saveItem(context.month,'expense',id,context.region,context.store,body,context.expectedVersion);
  state.expenseFilter='all';if(state.expenseContext===context)document.getElementById('ops-dialog')?.close();await refresh();
  notify(body.payer&&body.advisor&&body.manager&&body.proofPath?'送礼明细已保存，并关联本月核账':'送礼明细已保存并关联核账；待补资料可在核账待办继续完善');
 }
 function cashPanel(){const f=state.finance,types={receive:'收到个人承担',refund:'返还垫付款',company:'公司报销到账'};return block('expense-cash','实际收付款登记',`<div class="block ops-panel">${f.locked?'<p>账本已锁定；调整收付款记录须由负责人先解锁。</p>':`<form id="ops-cash-form" class="ops-form"><label>收付款类型<select name="type">${Object.entries(types).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>姓名／公司<input name="name" required placeholder="公司到账可填公司"></label><label>金额（元）<input name="amount" type="number" min="0.01" step="0.01" required></label><label>实际日期<input name="date" type="date" value="${chinaToday()}" required></label>${WBProofs.field('收付凭证')}<label>说明<input name="note"></label><button class="btn primary">保存实际收付款</button></form>`}<p class="ops-muted">采购单价与实际垫付记录在上方送礼明细中填写；这里登记核账后的收款、返还及公司到账。作废保留原因与原记录。</p>${f.cashItems.map(x=>`<article class="ops-task"><b>${E(types[x.payload.type]||x.payload.type)} · ${E(x.payload.name)} · ¥${money(x.payload.amount)}</b><p>${E(x.payload.date)} ${E(x.payload.note||'')} ${x.payload.voided?'已作废：'+E(x.payload.voidReason):''}</p><div class="ops-actions">${x.payload.proofPath?`<button class="btn" data-ops="proof" data-path="${E(x.payload.proofPath)}">查看凭证</button>`:''}${!f.locked&&!x.payload.voided?`<button class="btn" data-ops="void-cash" data-key="${E(x.key)}">作废并填写原因</button>`:''}</div></article>`).join('')||'<p>尚无实际收付款登记。</p>'}</div>`);}
 function ledgerText(){const f=state.finance;if(!f)return '';const l=f.ledger;const lines=[...financePersonRows(f).map(x=>`${x.name}（${x.role}）：${x.amount<0?'应补缴':'应返还'}${money(Math.abs(x.amount))}元（垫付${money(x.advance)}，承担${money(x.assessed)}${x.received?'，已收'+money(x.received):''}${x.refunded?'，已返'+money(x.refunded):''}）`),...f.cash.balances.filter(x=>M.expensePersonName(x.name)===M.expensePersonName('公司（待财务报销）')).map(x=>`${x.name}：${x.amount<0?'待到账':'到账待核对'}${money(Math.abs(x.amount))}元`)].join('\n');const checks=[...(l.alerts||[]),...(l.unassigned?.manager?['经理承担尚有'+money(l.unassigned.manager)+'元未归属到姓名']:[])];return `💰 ${title(scope())}｜${currentMonth}伴手礼费用核算\n\n已核价${expenseCount(l.lines)}份（${l.lines.length}条），实际费用${money(l.actual)}元\n顾问承担${money(l.advisor)}｜经理承担${money(l.manager)}\n店总池耗用${money(l.storeConsumed)}，超额承担${money(l.extraStore)}\n大区池耗用${money(l.regionConsumed)}｜公司待报销${money(l.company)}\n\n本月店总应注入${money(f.rules.storeContribution)}，大区总应注入${money(f.rules.regionContribution)}\n店总期末结余${money(l.closingStore)}，大区期末结余${money(l.closingRegion)}\n\n实际已收个人${money(f.cash.received)}，公司到账${money(f.cash.companyReceived)}，已返还${money(f.cash.refunded)}元\n\n剩余收付款方向（垫付款、本期应缴和已收付已抵扣）：\n${lines||'暂无可计算收付款方向'}${checks.length?'\n\n核账待确认：\n'+checks.join('\n'):''}\n\n${l.missing?'资料仍有待补，暂不作为最终结算单。':'请依据实际收款、返还和公司报销到账核销。'}历史余额已计入期初，不重复向个人收取。`;}
 function customerPreviewHtml(){
  const p=state.customerPreview;if(!p||p.month!==currentMonth)return '';
  return `<div class="ops-notice"><b>${E(p.month)}完整月度累计表 · 数据截至${E(p.asOf)}</b><p>有效明细${p.recordCount}行｜客户面见合计${p.total}次｜21家门店全量更新${p.ignoredSummaryRows?'｜已跳过合计/小计'+p.ignoredSummaryRows+'行':''}</p><p>未出现在原表中的门店记0次；确认后替换本月客户累计数据，不与上次上传相加。</p><div class="review-table-scroll"><table class="review-tier-table"><thead><tr><th>大区</th><th>门店</th><th>客户面见累计次数</th></tr></thead><tbody>${p.stores.map(x=>`<tr><td>${E(x.region)}</td><td>${E(x.store)}</td><td>${x.count}</td></tr>`).join('')}</tbody></table></div><details><summary>查看识别后的客户明细（${p.recordCount}行）</summary><div class="review-table-scroll"><table class="review-tier-table"><thead><tr><th>店面</th><th>店组</th><th>客源维护人</th><th>客户面见次数</th></tr></thead><tbody>${p.rows.slice(0,100).map(x=>`<tr><td>${E(x.store)}</td><td>${E(x.group||'—')}</td><td>${E(x.name||'—')}</td><td>${x.count}</td></tr>`).join('')}</tbody></table></div>${p.rows.length>100?'<p>明细预览前100行；所有有效行均已计入门店及全司合计。</p>':''}</details><button class="btn primary" type="button" data-ops="commit-customer-import">核对无误，更新本月客户面见</button></div>`;
 }
 function customerImportPanel(){
  const meta=data()?.customerImport;
  return block('admin-customer-import','导入客户面见次数',`<form id="ops-customer-import-form" class="block ops-panel"><div class="ops-form"><label>数据所属月份<input type="month" name="month" value="${E(currentMonth)}" required></label><label>客户数据截止日<input type="date" name="asOf" value="${E(currentMonth===chinaToday().slice(0,7)?yesterday():currentMonth+'-01')}" required></label><label class="wide">全司完整月度累计原表<input type="file" name="file" accept=".xlsx,.csv,.tsv,.json" required></label></div><p class="ops-muted">原表字段：店面、店组、客源维护人、[A] 客户面见。按“客户面见”数值合计次数，不按人数或行数去重；未出现的门店记0次。同月再次上传将替换该月客户累计数据，业主数据不受影响。</p>${meta?`<p class="ops-muted">当前已导入：截至${E(meta.as_of)}，全司${meta.total}次；${E(archiveTime(meta.created_at))}更新。</p>`:'<p class="ops-muted">本月尚未导入客户原表，进展表暂显示“待导入”。</p>'}<button class="btn primary" type="submit">读取并预览客户面见</button><div id="ops-customer-import-preview" aria-live="polite">${customerPreviewHtml()}</div></form>`);
 }
 function admin(view){
  if(isHistoryArchiveMonth(currentMonth))return historyAdmin();
  if(!C.member)return hero('数据管理','项目负责人统一导入底表；BP在核账与推动页面补充记录')+loginPanel()+`<div class="block ops-panel"><h3>连接准备</h3><p>当前站点${C.configured?'已配置共享服务，可使用已开通的账号登录。':'尚未配置共享数据库。程序与安装脚本已准备，连接完成后再导入业务数据。'}</p><p class="ops-muted">每天上传无需重新发布网页；首次连接由项目负责人完成。</p></div>`;
  if(!C.project)return hero('数据管理','全司数据由项目负责人统一更新')+`<div class="ops-notice">当前账号可以查看已授权范围并补充记录，不能导入全司底表或修改目标规则。</div>`;
  const d=data(),storeGoals=goals(),stores=DATA.regions.flatMap(r=>r.stores).filter(store=>!hiddenCustomerStores.has(canonicalStore(store)));
  return hero('数据管理','更新一个月份的当前数据，同时保留历史快照、BP动作和费用记录')+block('admin-import','导入全司基础数据',`<form id="ops-import-form" class="block ops-panel"><div class="ops-form"><label>数据所属月份<input type="month" name="month" value="${E(currentMonth)}" required></label><label>业务数据截止日<input type="date" name="asOf" value="${E(currentMonth===chinaToday().slice(0,7)?yesterday():currentMonth+'-01')}" required></label><label class="wide">底表与面见明细（可一次选择多个文件）<input type="file" name="files" multiple accept=".xlsx,.csv,.tsv,.json" required></label></div><p class="ops-muted">截止日以底表统计口径为准，文件导出时间不能代替业务截止日。月度底表覆盖更新；面见记录按事件去重，已填凭证和动作继续保留。</p><button class="btn primary" type="submit">读取并核对文件</button><div id="ops-import-preview"></div></form>`)+

  block('admin-goals','本月门店目标',`<form id="ops-goals-form" class="block ops-panel ops-form"><label class="wide">批量导入目标文件（CSV、TSV、XLSX或JSON）<input id="ops-goals-file" type="file" accept=".csv,.tsv,.xlsx,.json"></label><p class="ops-muted wide">文件至少包含“店面/门店”和“目标”两列；读取后会自动填入下方门店目标，确认无误后点击保存。</p>${stores.map(store=>currentMonth==='2026-11'&&noOwnerStore(store)?`<label>${E(store)}<input type="text" value="/（无在售房源）" disabled></label>`:`<label>${E(store)}<input type="number" min="0" step="1" name="${E(store)}" value="${storeGoals[store]??''}" placeholder="待确认"><small class="ops-muted" data-goal-rate>${E(goalRatePreview(store,storeGoals[store]))}</small></label>`).join('')}<button class="btn primary">保存当月目标</button><div id="ops-goals-file-preview" class="wide" aria-live="polite"></div></form>`)+
  block('admin-history','更新记录与备份',`<div class="block ops-panel"><button class="btn" data-ops="backup">导出当前月份完整备份</button><p class="ops-muted">包含当前账号有权读取的本月底表、明细、动作、费用、规则、快照及账期信息；凭证原件另存。</p>${(d?.imports||[]).map(x=>`<div class="ops-history"><b>数据截至${E(x.as_of)}</b><span>${E(new Date(x.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}更新 · ${x.housing_count}条底表</span></div>`).join('')||'<p>当前月份尚无共享导入记录。</p>'}</div>`);
 }
 function render(view){
  WBVoice.reset();
  const archiveMonth=isHistoryArchiveMonth(currentMonth);
  if(archiveMonth&&!['review','admin'].includes(currentMode))currentMode='review';
  // 共享查看者无需工号即可浏览；仅编辑、核账和管理操作需要登录。
  // 未登录时保留用户选择的管理/核账页面，由对应页面直接展示登录入口。
  // 不能强制跳回日常推动，否则顶部“数据管理”会被选中但正文仍停留在日常页。
  // Keep the view explicitly selected by the user. The main URL is intentionally
  // kept clean, so rebuilding the scope from the URL here would always reset a
  // region/store selection back to the company view after every async refresh.
  setCloudRegions();view=syncScope(view||currentView||viewFromUrl());currentView=view;
  document.querySelectorAll('[data-view-mode]').forEach(button=>{button.hidden=archiveMonth&&!['review','admin'].includes(button.dataset.viewMode);});
  const reviewButton=document.querySelector('[data-view-mode="review"]');if(reviewButton)reviewButton.textContent=archiveMonth?'历史复盘':'周/月复盘';
  document.getElementById('report').hidden=false;document.getElementById('status').hidden=true;document.getElementById('scope-panel').hidden=archiveMonth||currentMode==='admin';document.getElementById('toolbar').hidden=false;document.getElementById('word-download').hidden=true;
  document.getElementById('copy-progress-image').hidden=archiveMonth||!['daily','review'].includes(currentMode);document.getElementById('copy-progress-image').disabled=archiveMonth;document.getElementById('copy-report').hidden=archiveMonth;document.getElementById('copy-report').disabled=archiveMonth||!['daily','review'].includes(currentMode);document.getElementById('print-report').disabled=false;
  let nav=archiveMonth?(currentMode==='admin'?[['admin-archive','上传复盘文件'],['admin-archive-list','已归档文件']]:[['history-files','复盘文件']]):currentMode==='daily'?[['daily-progress','面见及礼物进展'],['daily-unmet-top','本月未面见TOP房'],['daily-met-houses','当月面见与正反馈'],['daily-message','公示话术'],['daily-package','公示资料包'],['daily-benchmark','全司面见标杆榜']]:currentMode==='review'?[['review-progress','本月目标达成结果'],['review-gifts','面见伴手礼'],['review-quality','面见质量与业务转化'],['review-highlights','标杆门店与重点提醒'],['review-actions',currentMonth==='2026-11'?'上周策略复盘与本周承接':Number(currentMonth.slice(5))+'月关键动作复盘'],['review-next',currentMonth==='2026-11'?'11月第二周目标及核心策略':'11月份目标及核心策略']]:currentMode==='expense'?[['expense-todo','BP核账待办'],['expense-head','账本与当月规则'],['expense-records','送礼明细与凭证'],['expense-settlement','分摊与收付款'],['expense-cash','实际收付款登记']]:[['admin-import','导入基础数据'],['admin-goals','本月门店目标'],['admin-history','更新与备份']];
  if(!archiveMonth&&currentMode==='review'&&currentMonth>='2026-11'&&root.WBStoreReviews)nav=nav.filter(([id])=>!['review-actions','review-next'].includes(id)).concat([['review-regional','大区周／月复盘']],root.WBCompanyWeekPlan?[['review-company-week-plan','全司周目标及核心策略']]:[]);
  document.getElementById('nav').innerHTML=nav.map(([id,label],i)=>`<a href="#${id}"><span class="nav-no">0${i+1}</span><span>${E(label)}</span></a>`).join('');
  document.querySelector('.nav-label').textContent='CONTENTS / '+(archiveMonth?(currentMode==='admin'?'文件管理':'历史复盘'):({daily:'日常推动',review:'结果复盘',expense:'费用核销',admin:'数据管理'}[currentMode]||'项目工作台'));
  document.title=(archiveMonth?(currentMode==='admin'?'历史文件管理':'历史复盘归档'):({daily:'日常推动',review:'周／月复盘',expense:'费用核销',admin:'数据管理'}[currentMode]))+' · '+view.name+'｜面见项目工作台';
  document.getElementById('report').innerHTML=connection()+(archiveMonth&&currentMode==='review'?historyArchive(view):currentMode==='daily'?daily(view):currentMode==='expense'?finance(view):currentMode==='review'?review(view):admin(view));
  if(!archiveMonth&&currentMode==='review'&&currentMonth>='2026-11'&&root.WBStoreReviews){root.WBStoreReviews.mount({host:document.getElementById('store-review-host'),month:currentMonth,view,goals:goals(),cloud:reviewCloudForHighlights(),notify,publicData:data()?.companyProgress||data(),privateData:data(),asOf:data()?.imports?.[0]?.as_of||'',sourceVersion:data()?.imports?.[0]?.created_at||''});updateReviewMeetingHighlights();}
  if(!archiveMonth&&currentMode==='review'&&currentMonth>='2026-11'&&root.WBCompanyWeekPlan)root.WBCompanyWeekPlan.mount({host:document.getElementById('company-week-plan-host'),month:currentMonth,cloud:C,notify,businessData:data()?.companyProgress||data()});
  if(C.configured&&!data()&&!state.loading&&!state.error)refresh();
 }
 async function refresh(){if(!C.configured)return;const month=currentMonth,memberAtStart=C.member,viewAtStart=currentView,serial=state.refreshSerial[month]=(state.refreshSerial[month]||0)+1;state.loading=true;state.error='';try{const loaded=await C.load(month);if(C.member!==memberAtStart||state.refreshSerial[month]!==serial)return;const committed=state.goalCommits[month];if(committed?.reader===memberAtStart)applyGoalCommit(loaded,committed.item);loaded.reader=memberAtStart;state.cache[month]=loaded;await publishQuality(loaded,month);}catch(e){if(C.member===memberAtStart&&state.refreshSerial[month]===serial)state.error=e.message;}finally{if(C.member!==memberAtStart||state.refreshSerial[month]!==serial)return;state.loading=false;
  // A refresh can finish after the visitor has changed the filters. Always use
  // the newest in-page selection; viewAtStart is only a fallback.
  if(currentMonth===month){if(isMode(currentMode))render(currentView||viewAtStart||viewFromUrl());else if(currentMode==='plan'&&typeof root.renderProject==='function')root.renderProject(currentView||viewAtStart||viewFromUrl());}}}
 async function save(kind,id,body,store){const s=scope(),selectedStore=kind==='goals'?null:store||s.store;if(!selectedStore&&!['goals','rules'].includes(kind))throw Error('请先筛选单店');const region=DATA.regions.find(r=>r.stores.includes(selectedStore))?.name||(kind==='goals'?null:s.region)||null,existing=item(kind,id,selectedStore);await C.saveItem(currentMonth,kind,id,region,selectedStore||null,body,existing?.updated_at);await refresh();}
 function dialog(content){let el=document.getElementById('ops-dialog');if(!el){el=document.createElement('dialog');el.id='ops-dialog';el.className='ops-dialog';document.body.append(el);}el.innerHTML=`<button class="btn ops-dialog-close" data-ops="close-dialog">关闭</button>${content}`;if(!el.open)el.showModal();return el;}
 function formData(form){return Object.fromEntries(new FormData(form));}
 function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function handleClick(e){const b=e.target.closest('[data-ops]');if(!b)return;const action=b.dataset.ops;try{
  if(action==='login'){dialog(loginPanel());return;}if(action==='close-dialog'){document.getElementById('ops-dialog').close();return;}
  if(action==='logout'){await C.logout();state.cache={};state.goalCommits={};state.refreshSerial={};state.sceneDrafts={};state.sceneAnalyses={};state.scenePlans={};state.finance=null;document.getElementById('ops-dialog')?.close();render(viewFromUrl());return;}if(action==='refresh'){await refresh();return;}if(action==='admin'){setViewMode('admin');return;}
  if(action==='choose-store'){document.getElementById('store-filter').value=b.dataset.store;document.getElementById('store-filter').dispatchEvent(new Event('change'));return;}
  if(action==='generate-message'){await organizeAndUpdate(b);return;}
  if(action==='copy-message'){await copyText(document.getElementById('ops-message').value,'推动话术已复制');return;}
  if(action==='benchmark-image'||action==='benchmark-preview'){await companyBenchmarkImage(action==='benchmark-preview');return;}
  if(action==='benchmark-copy-image'){await copyBenchmarkPreview();return;}
  if(action==='send-package'){await downloadSendPackage(b);return;}
  if(action==='all-publication-package'){await downloadSendPackage(b,false,true);return;}
  if(action==='publication-package'){await downloadPublicationPackage(b);return;}
  if(action==='save-scene'){await organizeAndUpdate(b,true);return;}
  if(action==='voice'){await WBVoice.start();return;}if(action==='voice-stop'){WBVoice.stop();return;}
  if(action==='copy-quality'){await copyText(feedbackCopyText(),'当前页质量文字已复制');return;}
  if(action==='quality-topic'){const sel=qualitySelection();sel.filter.topic=b.dataset.topic;sel.filter.page=0;updateQualityPanel();return;}
  if(action==='quality-page'){const sel=qualitySelection();sel.filter.page+=Number(b.dataset.direction);updateQualityPanel();document.getElementById(currentMode==='review'?'review-quality':'daily-quality')?.scrollIntoView({behavior:'smooth'});return;}
  if(action==='quality-image'){await qualityImage();return;}if(action==='unmet-top-image'){await unmetTopImage();return;}if(action==='met-house-image'||action==='met-house-preview'){await metHouseImage(action==='met-house-preview');return;}
  if(action==='met-house-copy-image'){await copyMetHousePreview();return;}
  if(action==='copy-review'){const text=reviewTextWithNovember();if(!text)throw Error('复盘数据尚未加载，请点击“刷新进展”后重试');await copyText(text,'当前复盘已复制');return;}
  if(action==='archive-review'){const url=new URL(location.href);url.searchParams.set('review','archive');history.replaceState(null,'',url);root.render(currentView);return;}
  if(action==='live-review'){const url=new URL(location.href);url.searchParams.delete('review');history.replaceState(null,'',url);root.render(currentView);return;}
  if(action==='expense-filter'){state.expenseFilter=b.dataset.filter;render(currentView);return;}
  if(action==='quality-detail'){const q=qualityData();if(!q?.private)throw Error('请先进入已授权范围');const rows=q.records.filter(x=>x.category===b.dataset.category);dialog(`<h2>${E(Q.labels[b.dataset.category])} · ${rows.length}套</h2>${rows.map(x=>`<article class="ops-task"><h3>${E(x.project)} · ${E(x.room)}</h3><p>${E(x.store)} · ${E(x.group)} · ${E(x.advisor)}</p><p>${E(x.method)}${x.changed?'；新增反馈后需重新核对':''}</p>${x.feedbacks.map(r=>`<p class="ops-pre">${E(String(r['面见时间']).slice(0,10))}：${E(r['面见反馈'])}</p>`).join('')||'<p>尚无反馈原文，请在业务系统补录后统一导入。</p>'}${x.basis?`<p>归类依据：${E(x.basis)}</p>`:''}<p>后续安排：${E(x.nextAction||'待结合现场确认')}</p>${x.feedbacks.length?`<button class="btn" data-ops="quality-edit" data-house="${E(x.houseId)}">核对分类与安排</button>`:''}</article>`).join('')||'<p>本类暂无记录。</p>'}`);return;}
  if(action==='quality-edit'){const x=qualityData()?.records.find(x=>x.houseId===b.dataset.house);if(!x)throw Error('记录已变化，请刷新');dialog(`<form id="ops-quality-form"><h2>${E(x.project)} · ${E(x.room)}</h2><input type="hidden" name="houseId" value="${E(x.houseId)}"><p class="ops-pre">${E(x.feedbacks.map(r=>r['面见反馈']).join('\n'))}</p><label>主要结果<select name="category">${Object.entries(Q.labels).map(([k,v])=>`<option value="${k}" ${x.category===k?'selected':''}>${E(v)}</option>`).join('')}</select></label><label>判断依据<textarea name="basis" required>${E(x.basis)}</textarea></label><label>后续安排（可选）<textarea name="nextAction">${E(x.nextAction)}</textarea></label><div class="ops-form"><label>负责人<input name="owner" placeholder="转成任务时填写"></label><label>计划日期<input name="due" type="date"></label></div><label class="ops-check"><input type="checkbox" name="createTask">将后续安排同时加入动作追踪</label><button class="btn primary" type="submit">确认并保存</button></form>`);return;}
  if(action==='task-result'){const t=taskList(currentView).find(x=>x.key===b.dataset.key);if(!t)throw Error('记录已变化，请刷新');dialog(`<form id="ops-result-form"><h2>更新安排与结果</h2><input type="hidden" name="key" value="${E(t.key)}"><label>具体动作<textarea name="action" required>${E(t.action)}</textarea></label><div class="ops-form"><label>负责人<input name="owner" required value="${E(t.owner)}"></label><label>计划日期<input name="due" type="date" required value="${E(t.due)}"></label><label>状态<select name="status">${Object.entries({open:'进行中',blocked:'需要支持',done:'已完成',cancelled:'已取消'}).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select></label></div><label>最新结果与下一步<textarea name="result" required>${E(t.result||'')}</textarea></label><button class="btn primary" type="submit">保存并同步复盘</button></form>`);return;}
  if(action==='add-expense'){openExpense();return;}
  if(action==='edit-expense'){const x=state.finance?.expenses.find(x=>M.expenseId(x)===b.dataset.expense);if(!x)throw Error('记录已变化，请刷新');openExpense(x);return;}
  if(action==='void-cash'){const x=state.finance.cashItems.find(x=>x.key===b.dataset.key);dialog(`<form id="ops-void-cash-form"><h2>作废收付款记录</h2><input type="hidden" name="key" value="${E(x.key)}"><label>作废原因<textarea name="reason" minlength="2" required></textarea></label><button class="btn primary">保存原因并作废</button></form>`);return;}
  if(action==='proof'){const url=await C.proofUrl(b.dataset.path);const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.click();return;}
  if(action==='copy-ledger'){await copyText(ledgerText(),'核账文字已复制');return;}
  if(action==='ledger-image'){await ledgerImage();return;}
  if(action==='carry'){const d=new Date(currentMonth+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);const previous=await C.load(d.toISOString().slice(0,7));const period=previous.periods.find(x=>x.store===scope().store&&x.locked);if(!period)throw Error('上月尚无已结账余额，请核对后填写期初余额');await save('expense','@@head',{...state.finance.head,openingStore:period.summary.closingStore,openingRegion:period.summary.closingRegion,note:'承接'+period.month+'已结账余额'});return;}
  if(action==='lock'||action==='unlock'){if(action==='lock'&&state.finance.ledger.missing)throw Error('单价、凭证或人员资料未齐，请先补充');if(action==='unlock'){dialog('<form id="ops-unlock-form"><h2>解锁本月账本</h2><label>调整原因<textarea name="reason" minlength="2" required></textarea></label><button class="btn primary">保存原因并解锁</button></form>');return;}await C.rpc('wb_set_period',{p_month:currentMonth,p_region:scope().region,p_store:scope().store,p_locked:true,p_summary:{...state.finance.ledger,head:state.finance.head,rules:state.finance.rules},p_reason:'核对完成'});await refresh();return;}
  if(action==='commit-customer-import'){const p=state.customerPreview;if(!p||p.month!==currentMonth)throw Error('请先读取并核对本月客户原表');if(!C.project)throw Error('仅项目负责人可导入全司客户数据');b.disabled=true;await C.importCustomerSnapshot({month:p.month,asOf:p.asOf,rows:p.rows,filenames:p.filenames});state.customerPreview=null;await refresh();notify('客户面见已更新：全司、大区和单店同步显示本月累计次数');return;}
  if(action==='commit-import'){const p=state.preview;if(!p)throw Error('请先读取并核对文件');b.disabled=true;await C.rpc('wb_import_snapshot',{p_month:p.month,p_as_of:p.asOf,p_rows:p.base,p_meetings:p.meetings,p_snapshots:M.snapshot(p.base,goals(),p.asOf),p_filenames:p.filenames});state.preview=null;await refresh();notify('底表已更新到共享服务，BP刷新后可查看');return;}
  if(action==='backup'){if(!C.project)throw Error('仅项目负责人可导出全司备份');download(data(),'面见项目_'+currentMonth+'_共享数据备份.json');return;}
 }catch(error){notify(error.message);if(['commit-import','commit-customer-import'].includes(action))b.disabled=false;}}
 async function handleSubmit(e){const form=e.target;if(!form.id.startsWith('ops-'))return;e.preventDefault();if(form.id==='ops-expense-form'&&form.dataset.saving==='true')return;if(form.id==='ops-expense-form')form.dataset.saving='true';const values=formData(form),button=form.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;try{
  if(form.id==='ops-send-config-form'){await saveSendConfig(values);render(currentView);notify('24个范围群名配置已保存；空白项保留待配置');return;}
  if(form.id==='ops-login-form'){await C.login(values.loginId);form.reset();document.getElementById('ops-dialog')?.close();await refresh();return;}
  if(form.id==='ops-archive-form'){
    if(!C.project)throw Error('仅项目负责人可上传历史复盘文件');
    if(!isHistoryArchiveMonth(currentMonth)||values.month!==currentMonth)throw Error('请先切换到需要归档的3月至9月月份');
    if(!values.publicConfirmed)throw Error('请先确认所选文件可以在共享页面公开查看');
    const files=Array.from(form.elements.files.files||[]);if(!files.length)throw Error('请选择至少一份Word或PDF复盘文件');
    const progress=document.getElementById('ops-archive-progress'),results=[];state.archiveNotice='';
    for(let i=0;i<files.length;i++){
      if(progress)progress.innerHTML=`<div class="ops-notice">正在上传 ${i+1}/${files.length}：${E(files[i].name)}</div>`;
      try{await C.uploadArchive(files[i],currentMonth);results.push({name:files[i].name,ok:true});}
      catch(error){results.push({name:files[i].name,ok:false,error:error.message});}
    }
    const success=results.filter(x=>x.ok),failed=results.filter(x=>!x.ok);state.archiveNotice=`已成功上传${success.length}份${failed.length?'；失败'+failed.length+'份：'+failed.map(x=>x.name+'（'+x.error+'）').join('、'):''}`;
    form.reset();await refresh();notify(failed.length?`上传完成：成功${success.length}份，失败${failed.length}份`:`已上传${success.length}份复盘文件，公开页面已同步`);return;
  }
  if(form.id==='ops-task-form'){await save('task',M.uuid(),values);notify('推动动作已保存');return;}
  if(form.id==='ops-result-form'){const t=taskList(currentView).find(x=>x.key===values.key),parent=data().items.find(x=>x.key===t?.parentKey);if(!t||!parent)throw Error('记录已变化，请刷新');const update={action:values.action,title:values.action,owner:values.owner,due:values.due,status:values.status,result:values.result,resultAt:new Date().toISOString(),resultHistory:[...(t.resultHistory||[]),...(t.result&&t.result!==values.result?[{result:t.result,status:t.status,date:t.resultAt||''}]:[])]},body=t.embedded?{...parent.payload,tasks:parent.payload.tasks.map(x=>x.id===t.id?{...x,...update}:x)}:{...parent.payload,...update};await C.saveItem(currentMonth,parent.kind,parent.key.split('|').slice(3).join('|'),parent.region,parent.store,body,parent.updated_at);document.getElementById('ops-dialog').close();await refresh();notify('安排与结果已更新，复盘同步刷新');return;}
  if(form.id==='ops-quality-form'){const x=qualityData()?.records.find(x=>x.houseId===values.houseId);if(!x)throw Error('记录已变化，请刷新');if(values.createTask&&(!values.owner||!values.due||!values.nextAction.trim()))throw Error('加入追踪需补齐后续安排、负责人和日期');const previous=item('review','quality:'+x.houseId,x.store),tasks=previous?.payload.tasks||[];const next=values.createTask?W.mergeTasks(tasks,[{confirmed:true,source:values.nextAction,action:values.nextAction,title:values.nextAction,houseId:x.houseId,owner:values.owner,due:values.due}],new Date().toISOString(),M.uuid):tasks;await C.saveItem(currentMonth,'review','quality:'+x.houseId,x.region,x.store,{recordType:'quality',houseId:x.houseId,category:values.category,basis:values.basis,nextAction:values.nextAction,confirmed:true,sourceSignature:x.sourceSignature,tasks:next},previous?.updated_at);document.getElementById('ops-dialog').close();await refresh();notify('分类与安排已保存；公开概览随负责人刷新同步');return;}
  if(form.id==='ops-expense-form'){await saveExpense(form,values);return;}
  if(form.id==='ops-cash-form'){const amount=cents(values.amount);if(!Number.isInteger(amount)||amount<=0)throw Error('金额须大于0');const file=WBProofs.file(form);let proof={};if(file){const p=await C.uploadProof(file,currentMonth,scope().region,scope().store);proof={proofPath:p.path,proofName:p.name};}await save('expense','@@cash:'+M.uuid(),{...values,amount,recordType:'cash',...proof});notify('实际收付款已保存');return;}
  if(form.id==='ops-void-cash-form'){const x=state.finance.cashItems.find(x=>x.key===values.key);await save('expense',x.key.split('|').slice(3).join('|'),{...x.payload,voided:true,voidReason:values.reason});document.getElementById('ops-dialog').close();return;}
  if(form.id==='ops-ledger-head'){await save('expense','@@head',{...values,openingStore:cents(values.openingStore),openingRegion:cents(values.openingRegion)});notify('账本信息已保存');return;}
  if(form.id==='ops-rules-form'){const rules={...state.finance.rules};for(const k of ['cap','advisor','manager','storeContribution','regionContribution'])rules[k]=cents(values[k]);rules.extraMode=values.extraMode;rules.extraWeights=values.extraMode==='advisor'?[1,0,0]:values.extraMode==='equal'?[1,1,1]:[0,1,2].map(i=>Number(values['weight'+i]));if(rules.extraWeights.some(x=>!Number.isFinite(x)||x<0)||rules.extraWeights.reduce((a,b)=>a+b,0)<=0)throw Error('请填写有效的超额分摊比例');await save('rules','monthly',rules);notify('本店当月费用规则已保存');return;}
  if(form.id==='ops-goals-form'){const result=await saveMonthlyGoals(values);notify(result.refreshed?'当月目标与目标面见率已同步更新':'目标已保存，当前页面已更新；共享数据暂未刷新，请稍后刷新核对');return;}
  if(form.id==='ops-unlock-form'){await C.rpc('wb_set_period',{p_month:currentMonth,p_region:scope().region,p_store:scope().store,p_locked:false,p_summary:state.finance.ledger,p_reason:values.reason});document.getElementById('ops-dialog').close();await refresh();return;}
  if(form.id==='ops-customer-import-form'){
    state.customerPreview=null;const host=document.getElementById('ops-customer-import-preview');if(host)host.innerHTML='';
    if(!C.project)throw Error('仅项目负责人可导入全司客户数据');
    if(values.month!==currentMonth)throw Error('请先在左侧切换到数据所属月份，再导入');
    const file=form.elements.file.files?.[0];if(!file)throw Error('请选择全司完整月度累计原表');
    const sheets=await WBFiles.read(file),normalize=x=>String(x).normalize('NFKC').replace(/\s/g,'').toLowerCase(),candidate=sheets.filter(sheet=>Object.keys(sheet.rows?.[0]||{}).some(k=>['[a]客户面见','客户面见','客户面见次数','客户面见总次数'].includes(normalize(k))));
    if(!candidate.length)throw Error('未找到客户面见明细，请确认包含“店面、店组、客源维护人、[A] 客户面见”表头和明细行');
    if(candidate.length>1)throw Error('识别到多张客户面见工作表，请仅保留一张全司完整明细表后再上传，避免明细与汇总重复计入');
    const result=M.validateCustomerImport(candidate[0].rows||[],values.month,values.asOf,chinaToday());
    state.customerPreview={...result,filenames:[file.name]};if(host)host.innerHTML=customerPreviewHtml();return;
  }
  if(form.id==='ops-import-form'){
    const files=Array.from(form.elements.files.files);let base=[],meetings=[];for(const file of files)for(const sheet of await WBFiles.read(file)){const first=sheet.rows[0];if(!first)continue;if('面见反馈'in first&&'面见时间'in first)meetings.push(...sheet.rows);else if(('细分在售户数'in first||'在售户数'in first)&&'本月是否面见'in first)base.push(...sheet.rows);}
    const summary=M.validateImport(base,meetings,values.month,values.asOf,chinaToday());if(values.month!==currentMonth)throw Error('请先在左侧切换到数据所属月份，再导入');state.preview={month:values.month,asOf:values.asOf,base,meetings,filenames:files.map(f=>f.name)};
    document.getElementById('ops-import-preview').innerHTML=`<div class="ops-notice"><b>数据截至${E(values.asOf)}</b><p>底表${summary.housing}条｜主管理在售${summary.inSale}套｜已见${summary.met}套｜礼物登记${summary.gift}套｜当月反馈${summary.meetingRecords}条</p><button class="btn primary" type="button" data-ops="commit-import">核对无误，更新共享数据</button></div>`;return;
  }
 }catch(error){notify(error.message);}finally{if(form.id==='ops-expense-form')delete form.dataset.saving;if(button&&button.isConnected)button.disabled=false;}}
 async function qualityImage(){const q=qualityData();if(!q||q.pending)throw Error('质量数据尚未就绪，请稍后再试');const sel=qualitySelection(),blobs=await F.images({rows:q.private?sel.pageRows:[],summary:q.summary,scope:currentView.name,month:currentMonth,range:q.private?`本页${sel.pageRows.length}套 · 第${sel.filter.page+1}/${sel.pages}页`:'当前组织质量概览',topicCounts:q.private?F.counts(sel.pageRows):q.summary.topics});if(blobs.length===1&&navigator.clipboard?.write&&window.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blobs[0]})]);notify(q.private?'本页真实反馈图片已复制，包含完整原文':'质量概览图片已复制');return;}catch{}}const urls=blobs.map(b=>URL.createObjectURL(b));dialog(`<h2>业主面见 · 真实反馈图片</h2><p>${blobs.length>1?'原文较长，已自动分成'+blobs.length+'张，保留全部内容。':'图片已生成，可下载后分享。'}</p>${urls.map((url,i)=>`<div class="ops-actions"><a class="btn primary" href="${url}" download="${E(currentMonth+'_'+currentView.name)}_真实反馈_${sel.filter.page+1}_${i+1}.png">下载第${i+1}张</a></div><img alt="真实反馈图片${i+1}" src="${url}" style="max-width:100%">`).join('')}`);setTimeout(()=>urls.forEach(u=>URL.revokeObjectURL(u)),300000);}
 async function ledgerImage(){const text=ledgerText().split('\n'),canvas=document.createElement('canvas');canvas.width=1400;canvas.height=170+text.length*43;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#5b3a6d';ctx.fillRect(0,0,canvas.width,90);ctx.fillStyle='#fff';ctx.font='bold 30px Microsoft YaHei, sans-serif';ctx.fillText('伴手礼费用核账 · '+currentMonth,40,58);ctx.fillStyle='#29222d';ctx.font='23px Microsoft YaHei, sans-serif';text.forEach((line,i)=>ctx.fillText(line,40,145+i*43));const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败');if(navigator.clipboard&&window.ClipboardItem&&isSecureContext){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);notify('核账图片已复制，可粘贴微信');return;}catch{}}const u=URL.createObjectURL(blob);dialog(`<h2>核账图片</h2><a class="btn primary" href="${u}" download="${E(currentMonth)}_核账.png">下载图片</a><img src="${u}" alt="当前门店核账表" style="width:100%;margin-top:15px">`);}
 async function boot(){document.addEventListener('change',event=>{if(event.target.closest('#ops-expense-form')&&event.target.name==='houseLookup')applyExpenseProperty(event.target.closest('form'));if(event.target.closest('#ops-expense-form')&&event.target.name==='managerConfirmed')updateExpensePeople(event.target.closest('form'));if(event.target.closest('#ops-customer-import-form')){state.customerPreview=null;const preview=document.getElementById('ops-customer-import-preview');if(preview)preview.innerHTML='';}if(event.target.id==='quality-sort'){const sel=qualitySelection();sel.filter.sort=event.target.value;sel.filter.page=0;updateQualityPanel();}if(event.target.closest('[data-plan-index]'))readPlanEdits();});document.addEventListener('input',event=>{if(event.target.closest('#ops-goals-form')&&event.target.name)updateGoalRatePreview(event.target);if(event.target.closest('#ops-expense-form')&&['houseLookup','houseId','project','room'].includes(event.target.name))expensePropertyInput(event.target.closest('form'),event.target.name);if(event.target.closest('#ops-expense-form')&&['price','quantity'].includes(event.target.name))updateExpenseTotal(event.target.closest('form'));if(event.target.closest('#ops-expense-form')&&['payer','group','advisor','manager'].includes(event.target.name))updateExpensePeople(event.target.closest('form'),event.target.name);if(event.target.closest('[data-plan-index]'))readPlanEdits();if(event.target.id==='ops-scene'){state.sceneDrafts[sceneKey()]=event.target.value;}if(event.target.id==='ops-scene-analysis'){state.sceneAnalyses[sceneKey()]={...WBScene.analyze(sceneRaw()),text:event.target.value};}});WBProofs.onError=message=>notify(message);WBProofs.boot();document.addEventListener('click',handleClick);document.addEventListener('submit',handleSubmit);if(C.configured&&C.hasSession){try{await C.membership();await refresh();}catch(e){state.error=e.message;if(isMode(currentMode))render(viewFromUrl());}}}
 document.addEventListener('change',event=>{if(event.target.dataset?.srControl)updateReviewMeetingHighlights();});
 document.addEventListener('change',async event=>{if(event.target.id!=='ops-goals-file')return;const file=event.target.files?.[0];if(!file)return;try{const sheets=await WBFiles.read(file),rows=sheets.flatMap(s=>s.rows||[]);let count=0;for(const row of rows){const store=canonicalStore(row['店面']??row['门店']??row['店面名称']??'');const value=row['10月目标']??row['目标']??row['目标面见套数']??row['月度目标'];if(!store||value==null)continue;const input=[...document.querySelectorAll('#ops-goals-form input[name]')].find(x=>x.name===store);if(input){input.value=String(value).replace(/[^0-9.-]/g,'');updateGoalRatePreview(input);count++;}}const preview=document.getElementById('ops-goals-file-preview');if(preview)preview.innerHTML='<div class="ops-notice">已读取 '+count+' 家门店目标，请核对后点击“保存当月目标”。</div>';notify('目标文件读取完成，请核对后保存');}catch(e){notify(e.message||'目标文件读取失败');}});
 function novemberTargets(){
  const month=currentMonth,d=data(),owners=M.storeCatalog.filter(s=>s.ownerApplicable!==false),loaded=!!d&&d.reader===C.member;
  const key=month+'|goals|@@company|monthly',record=loaded?((d.items||[]).find(x=>x.key===key)||d.companyProgress?.items?.find(x=>x.key===key)):null;
  const saved=record?.payload||{},target=value=>{if(value==null||typeof value==='boolean'||String(value).trim()==='')return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;};
  const stores=owners.map(s=>({region:s.region,store:s.store,target:target(saved[s.store])}));
  const totalOf=rows=>rows.length&&rows.every(s=>s.target!==null)?rows.reduce((sum,s)=>sum+s.target,0):null;
  const regions=M.unique(stores.map(s=>s.region)).map(name=>({name,target:totalOf(stores.filter(s=>s.region===name))}));
  return {month,loaded,total:totalOf(stores),regions,stores,ownerStoreCount:owners.length,missingStores:stores.filter(s=>s.target===null).map(s=>s.store),updatedAt:record?.updated_at||'',error:state.error};
 }
 function ensurePlanningTargets(){if(!C.configured||currentMonth!=='2026-11'||state.loading||state.error)return;const d=data();if(d&&d.reader===C.member)return;return refresh();}
 root.WBOperations={isMode,emptyData,render,boot,refresh,ensurePlanningTargets,saveMonthlyGoals,goalRatePreview,updateGoalRatePreview,ledgerText,reviewMonthlyRate,reviewOrganizationRank,reviewRegionAnalysis,reviewRankSets,reviewPracticeEdition,reviewApprovedPractice,reviewHighlightSets,reviewSingleTone,reviewGroupSets,reviewGroupAnalysisText,reviewHighlightsHtml,reviewContext,reviewSavedMeetingRecord,reviewSavedNotesText,reviewReportSections,reviewScopedReportField,reviewCloudForHighlights,financePersonRows,expensePayerLabel,updateExpensePeople,reviewText:reviewTextWithNovember,qualityText,novemberTargets,buildSendPackage,buildPublicationPackage,saveSendConfig,projectSendConfig,novemberMessage,novemberRankedSelection,metHouseData,metHouseTable,metHouseImage,copyMetHousePreview,companyBenchmarkData,companyBenchmarkPanel,companyBenchmarkImage,copyBenchmarkPreview,state};
})(window);




