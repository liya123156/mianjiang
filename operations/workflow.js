/* One source note, reviewed task suggestions, reusable action/result history. */
(function(root){
 'use strict';
 const clean=v=>String(v??'').trim();
 function addDays(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 function dateIn(text,today){if(/后天/.test(text))return addDays(today,2);if(/明天/.test(text))return addDays(today,1);if(/今天|今日/.test(text))return today;const full=text.match(/(20\d{2})[-年](\d{1,2})[-月](\d{1,2})日?/),short=text.match(/(\d{1,2})月(\d{1,2})[日号]/);let day=full?`${full[1]}-${full[2].padStart(2,'0')}-${full[3].padStart(2,'0')}`:short?`${today.slice(0,4)}-${short[1].padStart(2,'0')}-${short[2].padStart(2,'0')}`:'';const parsed=new Date(day+'T00:00:00Z');return day&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===day?day:'';}
 function candidates(source,today,houses=[],names=[]){
  const parts=[...new Set(clean(source).split(/[。！？!?；;\n]+/).map(clean).filter(Boolean))];
  return parts.filter(s=>/(计划|将|准备|明天|后天|本周|下周|需要|希望|请|待|安排|负责|跟进|邀约)/.test(s)&&!(/^(已|已经|今天已|今日已)/.test(s)&&!/(计划|明天|后天|需要|希望|下一步|将)/.test(s))).map((action,i)=>{
   const matched=houses.filter(h=>[h.houseId,h['房源编号']].some(v=>v&&action.includes(v))||((h.room||h['房间号'])&&action.includes(h.room||h['房间号'])&&(h.project||h['分盘'])&&action.includes(h.project||h['分盘'])));
   const people=[...new Set(names.filter(n=>n&&action.includes(n)))];
   return {id:'suggestion-'+i,title:action,action,source:action,owner:people.length===1?people[0]:'',due:dateIn(action,today),houseId:matched.length===1?(matched[0].houseId||matched[0]['房源编号']):'',confirmed:false};
  });
 }
 function allTasks(items,scope={}){return (items||[]).filter(x=>(!scope.region||x.region===scope.region)&&(!scope.store||x.store===scope.store)).flatMap(x=>x.kind==='task'?[{...x.payload,id:x.key,key:x.key,parentKey:x.key,embedded:false,region:x.region,store:x.store}]:(x.kind==='scene'||x.kind==='review'&&x.payload.recordType==='quality')?(x.payload.tasks||[]).map(t=>({...t,key:x.key+'#'+t.id,parentKey:x.key,embedded:true,region:x.region,store:x.store})):[]);}
 const done=t=>['done','cancelled'].includes(t.status);
 function stateOf(t,today){return t.status==='done'?'已完成':t.status==='cancelled'?'已取消':t.status==='blocked'?'需要支持':!t.owner||!t.due?'待明确安排':t.due<today?'已到期未完成':t.due===today?'今天跟进':'进行中';}
 function ordered(tasks,today){const rank=t=>done(t)?9:t.status==='blocked'?0:t.due&&t.due<today?1:t.due===today?2:!t.owner||!t.due?3:4;return [...tasks].sort((a,b)=>rank(a)-rank(b)||(a.due||'9999').localeCompare(b.due||'9999'));}
 function mergeTasks(previous,candidates,now,uuid){const next=[...(previous||[])];for(const c of candidates.filter(x=>x.confirmed)){if(!clean(c.owner)||!/^\d{4}-\d{2}-\d{2}$/.test(c.due)||!clean(c.action))throw Error('请为勾选的动作补齐负责人、计划日期和具体动作');if(!next.some(t=>t.source===c.source&&t.due===c.due&&t.owner===c.owner)){next.push({...c,id:uuid(),title:c.title||c.action,status:'open',createdAt:now,confirmed:undefined});}}return next;}
 function expenseNeeds(e){return {price:!(e.priceCents>0),proof:!e.proofPath,people:!e.payer||!e.manager||!e.advisor,payment:e.paymentStatus!=='settled'};}
 function needsMatch(e,filter){const n=expenseNeeds(e);return filter==='all'||filter==='todo'&&Object.values(n).some(Boolean)||!!n[filter];}
 root.WBWorkflow={addDays,dateIn,candidates,allTasks,done,stateOf,ordered,mergeTasks,expenseNeeds,needsMatch};if(typeof module==='object')module.exports=root.WBWorkflow;
})(typeof window==='object'?window:globalThis);
