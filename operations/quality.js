/* Quality uses the same monthly active/met cohort as progress. Raw evidence stays private. */
(function(root){
 'use strict';
 const M=root.WBModel||(typeof require==='function'?require('./core.js'):null);
 const labels={P:'价格／底价／交易条件',M:'业主心态／真实出售动机',R:'关系粘合／客户反馈',E:'钥匙／委托／独家／挂牌',V:'看房方式／配合',C:'核实房源情况',O:'其他需求',U:'暂未形成明确结果'};
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const clean=v=>String(v??'').trim();
 function signature(rows){return JSON.stringify(rows.map(r=>[clean(r['面见id']),clean(r['面见时间']),clean(r['面见反馈'])]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
 function suggest(text){
  const hits=[];
  // Suggestions are never presented as a confirmed quality rating.
  const rules={P:/(降价|底价|报价|价格调整|价格可谈|价格不变|不降价|付款条件|交易条件|交意向金)/,M:/(不急卖|急售|急卖|置换|出售意愿|出售动机|不想卖|不愿卖|卖房原因)/,R:/(信任|认可|感谢|关系|粘合|客户反馈|顾客反馈)/,E:/(钥匙|委托|独家|挂牌)/,V:/(同意.{0,8}看房|愿意.{0,8}看房|配合.{0,8}看房|提前.{0,8}预约|看房.{0,8}(方便|时间|条件|配合))/,C:/(漏水|渗水|房况|装修情况|产权|抵押|面积核实)/,O:/(其他房产|另.{0,5}房.{0,5}(出售|出租)|买房需求|购房需求|租房需求)/};
  for(const [code,re] of Object.entries(rules))if(re.test(text))hits.push(code);
  return {category:hits[0]||'U',tags:hits};
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
   return {houseId,region:h['大区'],store:h['门店'],group:h['店组'],advisor:h['维护人姓名'],project:h['分盘']||h['总盘']||'',room:h['房间号']||'',feedbacks,sourceSignature,category,tags:suggestion.tags,missing:!feedbacks.length,reviewed:!!(saved&&saved.confirmed),basis:saved?.basis||'',nextAction:saved?.nextAction||'',method:saved?(saved.confirmed?'已核对':'沿用复盘归类'):'规则建议，待核对',changed:!!review&&review.sourceSignature!==sourceSignature};
  });
 }
 function summary(rows){const counts=Object.fromEntries(Object.keys(labels).map(k=>[k,0]));for(const r of rows)counts[r.category]++;return {total:rows.length,feedback:rows.filter(r=>!r.missing).length,missing:rows.filter(r=>r.missing).length,unclear:rows.filter(r=>r.category==='U'&&!r.missing).length,information:rows.filter(r=>!['U','R'].includes(r.category)).length,relationship:counts.R,reviewed:rows.filter(r=>r.reviewed).length,counts};}
 const scoped=(rows,s)=>rows.filter(r=>(!s.region||r.region===s.region)&&(!s.store||r.store===s.store)&&(!s.group||r.group===s.group));
 function publicSummary(rows,asOf,sourceVersion){
  const groups=[{scope:'company',region:'',store:'',group:'',...summary(rows)}];
  for(const region of M.unique(rows.map(r=>r.region))){const rr=scoped(rows,{region});groups.push({scope:'region',region,store:'',group:'',...summary(rr)});for(const store of M.unique(rr.map(r=>r.store))){const ss=scoped(rr,{store});groups.push({scope:'store',region,store,group:'',...summary(ss)});for(const group of M.unique(ss.map(r=>r.group)))groups.push({scope:'group',region,store,group,...summary(scoped(ss,{group}))});}}
  return {recordType:'public-quality',version:1,asOf,sourceVersion,groups};
 }
 root.WBQuality={canonical,labels,signature,suggest,records,summary,scoped,publicSummary};if(typeof module==='object')module.exports=root.WBQuality;
})(typeof window==='object'?window:globalThis);
