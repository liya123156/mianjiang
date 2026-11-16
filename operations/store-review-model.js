/* Aggregate-only store reviews. Source dates, confirmed goals and BP judgments stay distinct. */
(function(root){
 'use strict';
 const M=root.WBModel||(typeof require==='function'?require('./core.js'):null);
 const Q=root.WBQuality||(typeof require==='function'?require('./quality.js'):null);
 const text=value=>String(value??'').trim(),key=value=>text(value).replace(/[\s\u00a0]/g,''),dayMs=86400000;
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const isMonth=value=>/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(value));
 function isoDate(value){const s=text(value).slice(0,10);if(!/^20\d{2}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s?s:'';}
 function shiftDate(value,days){return new Date(new Date(value+'T00:00:00Z').valueOf()+days*dayMs).toISOString().slice(0,10);}
 function monthEnd(month){if(!isMonth(month))throw Error('复盘月份不正确');const [year,n]=month.split('-').map(Number);return new Date(Date.UTC(year,n,0)).toISOString().slice(0,10);}
 const numberOrNull=value=>value!==null&&value!==undefined&&value!==''&&Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;
 const pct=(n,d)=>d>0?((n/d)*100).toFixed(2)+'%':'—';
 function periods(month){
  const end=monthEnd(month),out=[];let start=month+'-01';
  while(start<=end){const weekday=new Date(start+'T00:00:00Z').getUTCDay(),last=[shiftDate(start,(7-weekday)%7),end].sort()[0];out.push({periodType:'weekly',periodStart:start,periodEnd:last,label:`${start.slice(5).replace('-','/')}—${last.slice(5).replace('-','/')}`});start=shiftDate(last,1);}
  return out;
 }
 function periodForDate(month,date){const rows=periods(month),day=isoDate(date);return rows.find(p=>day>=p.periodStart&&day<=p.periodEnd)||(day&&day<month+'-01'?rows[0]:rows.at(-1));}
 function validatePeriod(month,periodType,start,end){
  if(!isMonth(month)||!['weekly','monthly'].includes(periodType)||isoDate(start)!==start||isoDate(end)!==end||start>end||start.slice(0,7)!==month||end.slice(0,7)!==month)throw Error('复盘周期不正确');
  if(periodType==='monthly'&&(start!==month+'-01'||end!==monthEnd(month)))throw Error('月复盘须覆盖完整月份');
  if(periodType==='weekly'&&!periods(month).some(p=>p.periodStart===start&&p.periodEnd===end))throw Error('周复盘须按周一至周日划分，月初月末按当月截取');
 }
 function uniqueEvents(rows,houseIds,month,asOf){
  const events=new Map();
  for(const row of rows||[]){const id=key(row['房源编号']),date=isoDate(row['面见时间']);if(!houseIds.has(id)||!date||date.slice(0,7)!==month||(asOf&&date>asOf))continue;const eventId=key(row['面见id'])||JSON.stringify([id,text(row['面见时间']),text(row['面见人姓名'])]);if(!events.has(eventId))events.set(eventId,row);}
  return [...events.values()];
 }
 function sanitizeCounts(counts){const out={};for(const code of Object.keys(Q?.labels||{})){const value=numberOrNull(counts?.[code]);if(value!==null&&value>0)out[code]=value;}return out;}
 function makeSnapshot(input){
  const {month,region,periodType='weekly',periodStart,periodEnd}=input,store=M.canonicalStore(input.store),asOf=isoDate(input.asOf),sourceVersion=text(input.sourceVersion);
  validatePeriod(month,periodType,periodStart,periodEnd);
  if(asOf&&asOf.slice(0,7)!==month)throw Error('底表截止日须属于复盘月份');
  const catalog=M.storeCatalog.find(s=>s.store===store&&s.region===region&&s.ownerApplicable);if(!catalog)throw Error('门店与大区不匹配或不适用业主面见');
  const housing=M.active(M.inScope(input.housing||[],{region,store})),houseIds=new Set(housing.map(h=>key(h['房源编号']))),events=uniqueEvents(input.meetings,houseIds,month,asOf),datedIds=new Set(events.map(e=>key(e['房源编号']))),periodEvents=events.filter(e=>{const d=isoDate(e['面见时间']);return d>=periodStart&&d<=periodEnd;}),periodIds=new Set(periodEvents.map(e=>key(e['房源编号']))),pending=housing.filter(h=>M.flag(h['本月是否面见'])&&!datedIds.has(key(h['房源编号']))),metrics=M.metrics(housing,events),target=numberOrNull(input.goals?.[store]);
  const metHouses=periodType==='monthly'?housing.filter(h=>M.flag(h['本月是否面见'])):housing.filter(h=>periodIds.has(key(h['房源编号']))),metIdSet=new Set(metHouses.map(h=>key(h['房源编号']))),safeSummary=input.qualitySummary,hasFeedback=periodEvents.length>0&&periodEvents.every(e=>Object.hasOwn(e,'面见反馈'));
  let qualityAvailable=false,qualityCounts={};
  if(periodType==='monthly'&&safeSummary?.counts&&input.qualityAvailable!==false){const counts=sanitizeCounts(safeSummary.counts);if(Object.values(counts).reduce((sum,n)=>sum+n,0)===metHouses.length){qualityCounts=counts;qualityAvailable=true;}}
  else if(input.qualityAvailable!==false&&hasFeedback){
   qualityAvailable=true;const byHouse=new Map();for(const e of periodEvents){const id=key(e['房源编号']);if(!metIdSet.has(id))continue;if(!byHouse.has(id))byHouse.set(id,[]);byHouse.get(id).push(text(e['面见反馈']));}
   for(const h of metHouses){const code=Q.suggest((byHouse.get(key(h['房源编号']))||[]).join('\n')).category;qualityCounts[code]=(qualityCounts[code]||0)+1;}
  }
  const groups=M.unique(housing.map(h=>text(h['店组'])||'未分组')).sort(M.compareGroup).map(group=>{const homes=housing.filter(h=>(text(h['店组'])||'未分组')===group),ids=new Set(homes.map(h=>key(h['房源编号']))),selected=homes.filter(h=>metIdSet.has(key(h['房源编号'])));return {group,stock:homes.length,met:selected.length,meetingCount:periodType==='monthly'?M.metrics(homes,events).met_count:periodEvents.filter(e=>ids.has(key(e['房源编号']))).length,monthlyMet:homes.filter(h=>M.flag(h['本月是否面见'])).length,storeTopStock:homes.filter(h=>M.flag(h['门店top户数'])).length,storeTopMet:selected.filter(h=>M.flag(h['门店top户数'])).length,unitTopStock:homes.filter(h=>M.flag(h['户型top户数'])).length,unitTopMet:selected.filter(h=>M.flag(h['户型top户数'])).length};});
  const notes=[];
  if(!housing.length)notes.push('当前底表未提供本店在售房源，请核实本店数据是否完整。');
  if(!asOf)notes.push('底表截止日期待核实。');
  else if(asOf<periodEnd)notes.push(`数据仅截至${asOf}，本期尚未形成完整周期结果。`);
  else if(asOf>periodEnd)notes.push(`月度累计与在售基数截至${asOf}；本期面见按所选日期统计，不代表期末在售快照。`);
  if(pending.length)notes.push(`本月${pending.length}套已登记面见缺少有效日期明细，不能自动分配到某一周。`);
  const conflicting=housing.filter(h=>periodIds.has(key(h['房源编号']))&&!M.flag(h['本月是否面见'])).length;
  if(conflicting)notes.push(`${conflicting}套本期面见明细与月度面见标记不一致，请核实底表。`);
  if(!qualityAvailable)notes.push('本期收获分类未提供，请BP结合实际反馈补充；不据此判断面见无收获。');
  return {version:1,month,region,store,periodType,periodStart,periodEnd,asOf,sourceVersion,monthly:{target,stock:metrics.stock,met:metrics.met,meetingCount:metrics.met_count,storeTopStock:metrics.store_top_stock,storeTopMet:metrics.store_top_met,unitTopStock:metrics.unit_top_stock,unitTopMet:metrics.unit_top_met,gift:metrics.gift},period:{met:metHouses.length,meetingCount:periodType==='monthly'?metrics.met_count:periodEvents.length,storeTopMet:metHouses.filter(h=>M.flag(h['门店top户数'])).length,unitTopMet:metHouses.filter(h=>M.flag(h['户型top户数'])).length,pendingDateCount:pending.length,qualityAvailable,qualityCounts},groups,notes};
 }
 function analyze(snapshot,periodGoal){
  const s=snapshot,m=s.monthly,p=s.period,goal=numberOrNull(periodGoal),prefix=s.periodType==='monthly'?'本月':'本周',lines=[];
  if(goal===null)lines.push(`${prefix}已登记面见${p.met}套、${p.meetingCount}次；目标待BP确认，暂不计算完成率与目标差距。`);
  else if(goal===0)lines.push(`${prefix}确认目标为0套，实际已登记面见${p.met}套、${p.meetingCount}次，完成率不适用。`);
  else lines.push(`${prefix}目标${goal}套，已登记面见${p.met}套、${p.meetingCount}次，完成率${pct(p.met,goal)}，${p.met<goal?'尚差'+(goal-p.met)+'套':'已达到本期套数目标'}。`);
  if(m.target!==null)lines.push(`截至${s.asOf||'待核实'}，月度目标${m.target}套，累计面见${m.met}套，${m.target>0?'完成率'+pct(m.met,m.target)+'，':''}剩余差距${Math.max(0,m.target-m.met)}套。`);
  else lines.push('月度目标未录入，暂不测算月度差距和下期目标建议。');
  lines.push(`月度全盘面见率${pct(m.met,m.stock)}；门店TOP ${m.storeTopMet}/${m.storeTopStock}套（${pct(m.storeTopMet,m.storeTopStock)}），户型TOP ${m.unitTopMet}/${m.unitTopStock}套（${pct(m.unitTopMet,m.unitTopStock)}）。两类TOP可能重叠，不直接相加。`);
  const zero=(s.groups||[]).filter(g=>g.stock>0&&g.met===0),lead=[...(s.groups||[])].filter(g=>g.met>0).sort((a,b)=>b.met-a.met||M.compareGroup(a.group,b.group))[0];
  if(lead&&p.met>0)lines.push(`${prefix}面见主要贡献组为${lead.group}：${lead.met}套，占全店本期面见${pct(lead.met,p.met)}。`);
  if(zero.length)lines.push(`${zero.map(g=>g.group).join('、')}${prefix}暂无已登记日期明细的面见；请结合实际邀约和执行情况核实。`);
  const opportunity=[...(s.groups||[])].filter(g=>g.storeTopStock+g.unitTopStock>0).sort((a,b)=>((b.storeTopStock+b.unitTopStock)/(1+b.met)-(a.storeTopStock+a.unitTopStock)/(1+a.met))||a.met-b.met||M.compareGroup(a.group,b.group))[0];
  if(opportunity)lines.push(`可优先核实${opportunity.group}的安排：门店TOP在售${opportunity.storeTopStock}套、户型TOP在售${opportunity.unitTopStock}套，本期已登记面见${opportunity.met}套；是否需要邀约、分工或物料支持，由BP判断。`);
  return [...lines,...(s.notes||[])];
 }
 function suggestNext(snapshot){
  const s=snapshot,start=shiftDate(s.periodEnd,1),month=start.slice(0,7),type=s.periodType;
  let end;if(type==='monthly')end=monthEnd(month);else end=periodForDate(month,start).periodEnd;
  const base={periodType:type,periodStart:start,periodEnd:end,goal:null,actions:'',explanation:''};
  if(s.asOf&&s.asOf>=end){base.explanation='下一周期已结束，当前属于历史回看；请在对应周期查看原目标与实际结果，不再生成新的下期目标。';}
  else if(s.asOf&&s.asOf>=start){base.explanation='下一周期已开始，当前底表已包含该周期部分结果；请在对应周期复盘中结合原目标与实际进展确认，不再用月度剩余差距推算完整周目标。';}
  else if(month!==s.month){base.explanation='下一周期进入新月份，需先确认次月月度目标，再确定本期目标。';}
  else if(!s.asOf){base.explanation='底表截止日待核实，暂不自动测算下期目标。';}
  else if(s.monthly.target===null){base.explanation='月度目标待录入，暂不自动建议下期套数。';}
  else{
   const gap=Math.max(0,s.monthly.target-s.monthly.met),reference=s.asOf,remaining=Math.max(0,(new Date(monthEnd(month)+'T00:00:00Z')-new Date(reference+'T00:00:00Z'))/dayMs),days=(new Date(end+'T00:00:00Z')-new Date(start+'T00:00:00Z'))/dayMs+1;
   base.goal=gap===0?0:remaining>0?Math.min(gap,Math.ceil(gap*Math.min(days,remaining)/remaining)):null;
   base.explanation=base.goal===null?'当前底表已到月末，需BP结合实际情况确定下期目标。':`依据截至${s.asOf||'待核实'}的月度剩余差距${gap}套，按剩余${remaining}天与下期${days}天比例测算。此为建议，可由BP调整。`;
  }
  const focus=[...(s.groups||[])].filter(g=>g.stock>0).sort((a,b)=>((b.storeTopStock+b.unitTopStock)/(1+b.met)-(a.storeTopStock+a.unitTopStock)/(1+a.met))||a.met-b.met||M.compareGroup(a.group,b.group))[0];
  base.actions=[focus?`与${focus.group}经理核实重点房源的邀约机会、伙伴分工及所需支持，确认下一步安排。`:'与店总确认本期重点房源和店组，落实邀约安排。','延续已核实有效的做法；对尚未解决的卡点明确责任人与复查时间。','到约定时间核对实际面见及反馈收获，再决定是否调整支持。'].join('\n');
  return base;
 }
 function report({snapshot:s,fields={},status='draft',updatedBy='',updatedAt=''}={}){
  if(!s)throw Error('缺少本店复盘数据');const m=s.monthly,p=s.period,monthly=s.periodType==='monthly',periodLabel=monthly?'月':'周',goal=numberOrNull(fields.periodGoal),next=numberOrNull(fields.nextGoal),value=(v,placeholder)=>text(v)||placeholder,quality=Object.entries(p.qualityCounts||{}).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]).map(([code,count])=>`${Q.labels[code]||code}：${count}套（${pct(count,p.met)}）`);
  const nextPeriod=suggestNext(s),statusLabel=status==='confirmed'?'已确认复盘':'待BP确认';
  return {title:`${s.store} · 面见${periodLabel}复盘`,subtitle:`${s.region}｜${s.periodStart}—${s.periodEnd}`,meta:[statusLabel,`业主数据截至${s.asOf||'待核实'}`,updatedBy?'更新人：'+text(updatedBy):'',updatedAt?'更新：'+text(updatedAt).replace('T',' ').slice(0,16):''].filter(Boolean).join(' · '),sections:[
   {title:'一、目标与达成／数据分析',lines:[...analyze(s,goal),...(quality.length?['本期面见收获：',...quality]:[])]},
   {title:'二、核心动作与执行情况',lines:[[text(fields.actions),text(fields.execution)?'实际执行结果：'+text(fields.execution):''].filter(Boolean).join('\n')||'待BP补充核心动作与实际执行结果；未填写不代表未执行']},
   {title:'三、有效做法与标杆分享',lines:[value(fields.highlights,'待BP补充具体场景、关键动作、实际变化和可借鉴做法')]},
   {title:'四、需要提升与卡点问题分析',lines:[value(fields.blockers,'待BP补充已核实的卡点、原因、尝试及所需支持')]},
   {title:`五、下${periodLabel}目标与核心举措`,lines:[`下一周期：${nextPeriod.periodStart}—${nextPeriod.periodEnd}`,`下${periodLabel}目标：${next===null?'待BP调整确认':next+'套（BP填入／调整）'}`,value(fields.nextActions,'待BP补充核心举措'),`责任人：${value(fields.owner,'待明确')}｜完成／复查日期：${value(fields.due,'待明确')}`]}
  ]};
 }
 async function images(value){
  if(!root.document?.createElement)throw Error('当前环境不支持生成图片');
  const width=1500,pad=64,contentWidth=width-2*pad,font='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif',maxHeight=5600,header=230,footer=70,measure=root.document.createElement('canvas').getContext('2d');
  function wrap(raw,size,max=contentWidth-48){measure.font=`${size}px ${font}`;const lines=[];for(const part of String(raw??'').split(/\r?\n/)){let line='';for(const ch of part){if(line&&measure.measureText(line+ch).width>max){lines.push(line);line='';}line+=ch;}lines.push(line);}return lines;}
  const segments=[];
  for(const section of value.sections||[]){const all=(section.lines||[]).flatMap(line=>wrap(line,24)),maxLines=Math.floor((maxHeight-header-footer-100)/38);for(let i=0;i<Math.max(1,all.length);i+=maxLines){const lines=all.slice(i,i+maxLines),titles=wrap(section.title+(i?'（续）':''),28);segments.push({titles,lines,height:48+titles.length*42+lines.length*38});}}
  const pages=[];let page=[],height=header+footer;for(const segment of segments){if(page.length&&height+segment.height+20>maxHeight){pages.push(page);page=[];height=header+footer;}page.push(segment);height+=segment.height+20;}if(page.length)pages.push(page);if(!pages.length)throw Error('暂无可生成的复盘内容');
  const blobs=[];
  for(let pi=0;pi<pages.length;pi++){
   const blocks=pages[pi],canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=header+footer+blocks.reduce((n,b)=>n+b.height+20,0);const ctx=canvas.getContext('2d');ctx.fillStyle='#f8f4fc';ctx.fillRect(0,0,width,canvas.height);const gradient=ctx.createLinearGradient(0,0,width,header-26);gradient.addColorStop(0,'#9c60c1');gradient.addColorStop(1,'#c190dc');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,header-26);
   function draw(t,x,y,size,color,bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.fillText(t,x,y);}
   const titleLines=wrap(value.title,38,contentWidth);titleLines.forEach((line,i)=>draw(line,pad,30+i*46,38,'#fff',true));draw(value.subtitle,pad,88+Math.max(0,titleLines.length-1)*46,23,'#fff');const meta=wrap(value.meta,18,contentWidth);meta.slice(0,2).forEach((line,i)=>draw(line,pad,132+i*27+Math.max(0,titleLines.length-1)*46,18,'#fff'));
   let y=header;for(const block of blocks){ctx.fillStyle='#fff';ctx.strokeStyle='#e6d9ed';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(pad-15,y,contentWidth+30,block.height,14);ctx.fill();ctx.stroke();let cy=y+23;for(const line of block.titles){draw(line,pad+10,cy,28,'#71408b',true);cy+=42;}for(const line of block.lines){draw(line,pad+10,cy,24,'#4e4159');cy+=38;}y+=block.height+20;}
   draw(`${value.title}｜第${pi+1}/${pages.length}页 · 原始执行情况由BP核实`,pad,y+12,18,'#8d7798');
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('复盘图片生成失败')),'image/png'));blobs.push(blob);
  }
  return blobs;
 }
 root.WBStoreReviewModel={periods,periodForDate,makeSnapshot,analyze,suggestNext,report,images,escapeHtml,isoDate,numberOrNull};
 if(typeof module==='object')module.exports=root.WBStoreReviewModel;
})(typeof window==='object'?window:globalThis);

