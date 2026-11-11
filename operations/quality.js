/* Quality uses the same monthly active/met cohort as progress. Raw evidence stays private. */
(function(root){
 'use strict';
 const F=root.WBFeedback||(typeof require==='function'?require('./quality-feed.js'):null);
 const M=root.WBModel||(typeof require==='function'?require('./core.js'):null);
 const S=root.WBQualityRules||(typeof require==='function'?require('./quality-rules.js'):null);
 const labels=S.labels,standards=S.standards;
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const clean=v=>String(v??'').trim();
 function signature(rows){return JSON.stringify(rows.map(r=>[clean(r['面见id']),clean(r['面见时间']),clean(r['面见反馈'])]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
 // R records maintenance/feedback communication, not proof that trust improved.
 // Evaluate separate clauses so an unperformed gift does not hide completed feedback.
 function relationshipCommunication(text){
  const source=clean(text).replace(/(反馈[^。；;\n]{0,18})[，,]\s*((?:客户|顾客)(?:情况|状态|出价|看房意见))/g,'$1、$2');
  for(const sentence of source.split(/[。；;！!？?\n]/)){
   let planned=false;
   const futurePattern=/计划|准备|打算|预计|拟|待|需要|想要|将|明天|后天|下周|下月|下次|后续|改天|稍后/g;
   for(const clause of sentence.split(/[，,]|但是|但|同时|并且|以及/)){
   const matches=clause.matchAll(/信任|认可|感谢|关系维护|关系|粘合|送礼|(?:客户|顾客)反馈|(?:反馈|传递|同步)(?:了|过)?[^，,。；;！!？?\n]{0,10}?(?:客户|顾客)|反馈(?:了|过)?出价|(?:聊了?|沟通|交流).{0,8}(?:客户|顾客)|(?:客户|顾客).{0,8}(?:一对一)?沟通|(?:带了|送了|送上).{0,8}(?:水果|伴手礼|礼物)/g);
   for(const match of matches){
    const before=clause.slice(0,match.index),after=clause.slice(match.index+match[0].length);
    const future=[...before.matchAll(futurePattern)].at(-1);
    const negated=/维护|粘合|送礼|反馈|传递|同步|聊|沟通|交流|带了|送了|送上/.test(match[0])?[...before.matchAll(/尚未|还未|还没|没有|未|没|不再|不愿|不想|不曾|不/g)].at(-1):null;
    const blocked=Math.max(future?.index??-1,negated?.index??-1),done=[...before.matchAll(/已经|已|完成|进行了|做了/g)].at(-1)?.index??-1;
    if(blocked>=0&&done<=blocked)continue;
    if(planned&&done<0&&!/今天|今日|本次|刚刚|刚才|昨天/.test(before))continue;
    if(/^(?:也|仍|还)?(?:尚未|还未|未|没有|还没|没|待)(?:完成|进行|落实|沟通|开展|实施|执行)|^(?:的)?(?:安排|计划|动作)(?:尚未|未|待|还没)|^(?:的)?(?:计划|准备|打算|预计)/.test(after))continue;
    return true;
   }
   if([...clause.matchAll(futurePattern)].length)planned=true;
   }
  }
  return false;
 }
 function suggest(text){
  const result=S.analyze(text);
  if(relationshipCommunication(text)){
   result.tags.push('R');
   if(result.category==='U'){result.category='R';result.basis='已开展关系维护／客户反馈沟通；不直接认定关系改善。';}
  }
  return result;
 }
 function records(housing,meetings,items,month,asOf){
  const byHouse=new Map(),events=new Map();
  for(const r of meetings||[]){const date=clean(r['面见时间']).slice(0,10);if(date.slice(0,7)!==month||(asOf&&date>asOf))continue;const key=clean(r['面见id'])||JSON.stringify([r['房源编号'],r['面见时间'],r['面见人姓名']]);events.set(key,r);}
  for(const r of events.values()){const id=clean(r['房源编号']);if(!byHouse.has(id))byHouse.set(id,[]);byHouse.get(id).push(r);}
  const reviews=new Map((items||[]).filter(x=>x.kind==='review'&&x.payload.recordType==='quality').map(x=>[x.payload.houseId,x.payload]));
  const seeds=new Map((items||[]).filter(x=>x.kind==='review'&&x.payload.recordType==='quality-seed').flatMap(x=>x.payload.records||[]).map(x=>[x.houseId,x]));
  return M.active(housing||[]).filter(r=>M.flag(r['本月是否面见'])).map(h=>{
   const houseId=clean(h['房源编号']),raw=(byHouse.get(houseId)||[]).sort((a,b)=>clean(a['面见时间']).localeCompare(clean(b['面见时间']))),feedbacks=raw.filter(r=>clean(r['面见反馈'])&&!/^(无|暂无|无反馈|暂无反馈|无内容|—|-)$/.test(clean(r['面见反馈']))),sourceSignature=signature(raw),text=feedbacks.map(r=>clean(r['面见反馈'])).join('\n');
   const review=reviews.get(houseId),seed=seeds.get(houseId),saved=review?.sourceSignature===sourceSignature?review:seed?.sourceSignature===sourceSignature?seed:null,suggestion=suggest(text);
   const category=feedbacks.length?(saved&&labels[saved.category]?saved.category:suggestion.category):'U';
   return {houseId,region:h['大区'],store:h['门店'],group:h['店组'],advisor:h['维护人姓名'],project:h['分盘']||h['总盘']||'',room:h['房间号']||'',events:raw,feedbacks,sourceSignature,category,tags:suggestion.tags,missing:!feedbacks.length,reviewed:!!(saved&&saved.confirmed),basis:saved?saved.basis||'':suggestion.basis||'',nextAction:saved?.nextAction||'',method:saved?(saved.confirmed?'已核对':'沿用复盘归类'):'规则建议，待核对',changed:!!review&&review.sourceSignature!==sourceSignature};
  });
 }
 function summary(rows){const counts=Object.fromEntries(Object.keys(labels).map(k=>[k,0]));for(const r of rows)counts[r.category]++;return {total:rows.length,feedback:rows.filter(r=>!r.missing).length,missing:rows.filter(r=>r.missing).length,unclear:rows.filter(r=>r.category==='U'&&!r.missing).length,information:rows.filter(r=>!['U','R'].includes(r.category)).length,relationship:counts.R,reviewed:rows.filter(r=>r.reviewed).length,counts,topics:F.counts(rows)};}
 const scoped=(rows,s)=>rows.filter(r=>(!s.region||r.region===s.region)&&(!s.store||r.store===s.store)&&(!s.group||r.group===s.group));
 function publicSummary(rows,asOf,sourceVersion){
  const groups=[{scope:'company',region:'',store:'',group:'',...summary(rows)}];
  for(const region of M.unique(rows.map(r=>r.region))){const rr=scoped(rows,{region});groups.push({scope:'region',region,store:'',group:'',...summary(rr)});for(const store of M.unique(rr.map(r=>r.store))){const ss=scoped(rr,{store});groups.push({scope:'store',region,store,group:'',...summary(ss)});for(const group of M.unique(ss.map(r=>r.group)))groups.push({scope:'group',region,store,group,...summary(scoped(ss,{group}))});}}
  return {recordType:'public-quality',version:2,asOf,sourceVersion,groups};
 }
 root.WBQuality={canonical,labels,standards,signature,relationshipCommunication,suggest,records,summary,scoped,publicSummary};if(typeof module==='object')module.exports=root.WBQuality;
})(typeof window==='object'?window:globalThis);

