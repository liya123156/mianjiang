/* Shared business calculations. Amounts are integer cents; monthly history is immutable. */
(function(root){
  'use strict';
  const text=v=>String(v??'').trim(), number=v=>Number.isFinite(Number(v))?Number(v):0;
  function uuid(){if(root.crypto.randomUUID)return root.crypto.randomUUID();const b=root.crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((n,i)=>([4,6,8,10].includes(i)?'-':'')+n.toString(16).padStart(2,'0')).join('');}
  const flag=v=>v===true||['1','是','true'].includes(text(v).toLowerCase());
  const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0), unique=a=>[...new Set(a)], pct=(n,d)=>d?`${(n/d*100).toFixed(2)}%`:'—';
  const columns=[['region','大区'],['store','店面'],['group','店组'],['name','姓名'],['target','目标套数'],['target_rate','目标面见率'],['stock','在售套数'],['met','面见量'],['met_count','面见次数'],['met_rate','面见率'],['gift','面见送礼物数量'],['gift_rate','面见送礼物覆盖率'],['store_top_stock','在售套数'],['store_top_met','面见量'],['store_top_met_count','面见次数'],['store_top_rate','面见率'],['unit_top_stock','在售套数'],['unit_top_met','面见量'],['unit_top_met_count','面见次数'],['unit_top_rate','面见率']].map(([key,label])=>({key,label}));
  const groups=month=>[{label:`${Number(month.slice(5))}月目标制定`,keys:['target','target_rate'],tone:'target'},{label:'全盘（月度进展）',keys:['stock','met','met_count','met_rate','gift','gift_rate'],tone:'whole'},{label:'门店Top业主（月度进展）',keys:['store_top_stock','store_top_met','store_top_met_count','store_top_rate'],tone:'store-top'},{label:'户型Top业主（月度进展）',keys:['unit_top_stock','unit_top_met','unit_top_met_count','unit_top_rate'],tone:'unit-top'}];
  function active(rows){return rows.filter(r=>flag(r['细分在售户数']??r['在售户数']));}
  function inScope(rows,scope){return rows.filter(r=>(!scope.region||r['大区']===scope.region)&&(!scope.store||r['门店']===scope.store)&&(!scope.group||r['店组']===scope.group));}
  function metrics(rows,meetings=[]){
    const a=active(rows), met=a.filter(r=>flag(r['本月是否面见'])), gift=met.filter(r=>flag(r['本月是否送礼物']));
    const top=a.filter(r=>flag(r['门店top户数'])),unit=a.filter(r=>flag(r['户型top户数']));
    const ids=new Set(a.map(r=>text(r['房源编号']))), topIds=new Set(top.map(r=>text(r['房源编号']))), unitIds=new Set(unit.map(r=>text(r['房源编号'])));
    const validMeetings=(meetings||[]).filter(r=>ids.has(text(r['房源编号'])));
    const meetingCount=validMeetings.length||met.length;
    const topMeetingCount=(meetings||[]).filter(r=>topIds.has(text(r['房源编号']))).length||top.filter(r=>flag(r['本月是否面见'])).length;
    const unitMeetingCount=(meetings||[]).filter(r=>unitIds.has(text(r['房源编号']))).length||unit.filter(r=>flag(r['本月是否面见'])).length;
    return {stock:a.length,met:met.length,met_count:meetingCount,gift:gift.length,met_rate:pct(met.length,a.length),gift_rate:pct(gift.length,met.length),store_top_stock:top.length,store_top_met:top.filter(r=>flag(r['本月是否面见'])).length,store_top_met_count:topMeetingCount,store_top_rate:pct(top.filter(r=>flag(r['本月是否面见'])).length,top.length),unit_top_stock:unit.length,unit_top_met:unit.filter(r=>flag(r['本月是否面见'])).length,unit_top_met_count:unitMeetingCount,unit_top_rate:pct(unit.filter(r=>flag(r['本月是否面见'])).length,unit.length),metIds:met.map(r=>text(r['房源编号'])),giftIds:gift.map(r=>text(r['房源编号']))};
  }
  function target(rows,level,name,goals){
    if(level==='store')return goals[name]!=null&&Number.isFinite(Number(goals[name]))?Number(goals[name]):null;
    if(level==='group'||level==='advisor')return null;
    const stores=unique(active(rows).map(r=>r['门店']));
    return stores.length&&stores.every(s=>goals[s]!=null)?sum(stores,s=>number(goals[s])):null;
  }
  function table(rows,scope,goals,month,meetings=[]){
    const scoped=inScope(rows,scope), output=[];
    function add(g,level,name,identity){const houseIds=new Set(g.map(r=>text(r['房源编号'])));const m=metrics(g,(meetings||[]).filter(x=>houseIds.has(text(x['房源编号'])))),t=target(g,level,name,goals);output.push({...identity,...m,target:t??'—',target_rate:t==null?'—':pct(t,m.stock),_level:level,_target:t,_tone:level==='company'||level==='region'?'purple':''});}
    if(!scope.region&&!scope.store)add(scoped,'company','全司',{region:'全司',store:'/',group:'/',name:'—'});
    const regions=unique(active(scoped).map(r=>r['大区']));
    for(const region of regions){const r=scoped.filter(x=>x['大区']===region);if(!scope.store)add(r,'region',region,{region,store:'/',group:'/',name:'—'});
      for(const store of unique(active(r).map(x=>x['门店']))){const s=r.filter(x=>x['门店']===store);add(s,'store',store,{region,store,group:'/',name:'—'});
        if(scope.region||scope.store)for(const group of unique(active(s).map(x=>x['店组']))){const g=s.filter(x=>x['店组']===group);add(g,'group',group,{region,store,group,name:'—'});
          if(scope.store)for(const name of unique(active(g).map(x=>x['维护人姓名']))){add(g.filter(x=>x['维护人姓名']===name),'advisor',name,{region,store,group,name});}
        }
      }
    }
    return {type:'table',variant:'progress',title:`${scope.store||scope.region||'全司'}面见及礼物进展`,columns,columnGroups:groups(month),rows:output};
  }
  function snapshot(rows,goals,asOf){return unique(active(rows).map(r=>r['门店'])).map(store=>{const g=rows.filter(r=>r['门店']===store);return {region:g[0]['大区'],store,payload:{asOf,...metrics(g),target:goals[store]??null,groups:unique(active(g).map(r=>r['店组'])).map(group=>({group,...metrics(g.filter(r=>r['店组']===group))}))}};});}
  function delta(current,previous){
    if(!previous)return {known:false,newMet:0,newGift:0};
    return {known:true,newMet:current.metIds.filter(id=>!previous.metIds.includes(id)).length,newGift:current.giftIds.filter(id=>!previous.giftIds.includes(id)).length,removedMet:previous.metIds.filter(id=>!current.metIds.includes(id)).length};
  }
  function validateImport(base,meetings,month,asOf,today){
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||asOf.slice(0,7)!==month||asOf>today)throw Error('请选择本月且不晚于今天的数据截止日');
    if(!base.length||base.length>10000)throw Error('底表须包含1—10000条房源记录');
    const ids=new Set();for(const r of base){if(!text(r['房源编号']))throw Error('底表缺少房源编号');if(flag(r['细分在售户数']??r['在售户数'])&&(!text(r['大区'])||!text(r['门店'])||!text(r['店组'])))throw Error('主管理在售房源缺少大区、门店或店组');if(ids.has(text(r['房源编号'])))throw Error('底表房源编号重复，请先核对');ids.add(text(r['房源编号']));
      if(flag(r['本月是否面见'])&&r['面见时间']&&text(r['面见时间']).slice(0,10)>asOf)throw Error('底表面见时间晚于所选截止日，请核对日期');}
    const scopedMeetings=meetings.filter(r=>text(r['面见时间']).slice(0,7)===month);
    if(scopedMeetings.some(r=>text(r['面见时间']).slice(0,10)>asOf))throw Error('面见明细含晚于截止日的记录，请核对');
    return {housing:base.length,inSale:active(base).length,...metrics(base),meetingRecords:scopedMeetings.length};
  }
  function split(total,weights){const w=sum(weights,x=>x);if(!w)throw Error('超额承担比例合计须大于0');const exact=weights.map(x=>total*x/w),a=exact.map(Math.floor);let remain=total-sum(a,x=>x);const order=exact.map((x,i)=>({i,r:x-a[i]})).sort((x,y)=>y.r-x.r||x.i-y.i);for(let i=0;i<remain;i++)a[order[i].i]++;return a;}
  function ledger(expenses,rules,head={}){
    const r={cap:3000,advisor:300,manager:500,storeContribution:30000,regionContribution:0,extraWeights:[1,1,1],...rules};
    for(const key of ['cap','advisor','manager','storeContribution','regionContribution'])if(!Number.isInteger(r[key])||r[key]<0)throw Error('费用规则须为非负分币整数');
    const result={actual:0,advisor:0,manager:0,store:0,region:0,company:0,storeConsumed:0,regionConsumed:0,extraStore:0,missing:0,lines:[],balances:[]};
    let remainder=0;
    for(const e of expenses){const price=number(e.priceCents);if(!Number.isInteger(price)||price<=0){result.missing++;continue;}
      const base=Math.min(price,r.cap),a=Math.min(base,r.advisor),m=Math.min(base-a,r.manager),extra=split(Math.max(0,price-r.cap),r.extraWeights);
      result.actual+=price;result.advisor+=a+extra[0];result.manager+=m+extra[1];result.extraStore+=extra[2];remainder+=base-a-m;
      if(!e.payer||!e.manager||!e.advisor||!e.proofPath)result.missing++;
      result.lines.push({...e,advisorShare:a+extra[0],managerShare:m+extra[1],extraStoreShare:extra[2]});
    }
    const openingStore=number(head.openingStore),openingRegion=number(head.openingRegion);
    if(!Number.isInteger(openingStore)||openingStore<0||!Number.isInteger(openingRegion)||openingRegion<0)throw Error('期初余额须为非负分币整数');
    result.storeConsumed=Math.min(remainder,openingStore+r.storeContribution);
    result.regionConsumed=Math.min(remainder-result.storeConsumed,openingRegion+r.regionContribution);
    result.company=remainder-result.storeConsumed-result.regionConsumed;
    result.store=result.storeConsumed+result.extraStore;result.region=result.regionConsumed;
    result.closingStore=openingStore+r.storeContribution-result.storeConsumed;result.closingRegion=openingRegion+r.regionContribution-result.regionConsumed;
    const balances=new Map(),change=(name,v)=>{if(name)balances.set(name,(balances.get(name)||0)+v);};
    result.lines.forEach(e=>{change(e.payer,e.priceCents);change(e.advisor,-e.advisorShare);change(e.manager,-e.managerShare);});
    change(head.storeHead,-r.storeContribution-result.extraStore);change(head.regionHead,-r.regionContribution);change('公司（待财务报销）',-result.company);
    result.balances=[...balances].filter(([,amount])=>amount!==0).map(([name,amount])=>({name,amount}));
    if(!head.storeHead||(r.regionContribution&&!head.regionHead))result.missing++;
    if(result.actual!==result.advisor+result.manager+result.store+result.region+result.company)throw Error('费用分摊未对平');
    return result;
  }
  function expenseCandidates(rows,month){return active(rows).filter(r=>flag(r['本月是否送礼物'])).map(r=>({id:month+'|'+r['房源编号'],houseId:text(r['房源编号']),region:r['大区'],store:r['门店'],group:r['店组'],advisor:r['维护人姓名'],project:r['分盘']||r['总盘']||'',room:r['房间号']||''}));}
  function expenseRecords(rows,items,month,scope){
    const saved=items.filter(x=>x.kind==='expense'&&x.payload.houseId),assigned=new Map(saved.map(x=>[x.payload.houseId,x]));
    const output=new Map(expenseCandidates(inScope(rows,scope),month).filter(x=>!assigned.has(x.houseId)||assigned.get(x.houseId).store===scope.store).map(x=>[x.houseId,x]));
    for(const x of saved.filter(x=>(!scope.region||x.region===scope.region)&&(!scope.store||x.store===scope.store))){const existing=output.get(x.payload.houseId);output.set(x.payload.houseId,{...existing,...x.payload,region:x.region,store:x.store,retained:!existing});}
    return [...output.values()];
  }
  function cashSettlement(ledger,entries){
    const balances=new Map(ledger.balances.map(x=>[x.name,x.amount]));let received=0,refunded=0,companyReceived=0;
    for(const e of entries.filter(x=>!x.voided)){
      if(!['receive','refund','company'].includes(e.type)||!Number.isInteger(e.amount)||e.amount<=0)throw Error('收付款须填写有效的类型与金额');
      const name=e.type==='company'?'公司（待财务报销）':text(e.name);if(!name)throw Error('收付款须填写姓名');
      const delta=e.type==='refund'?-e.amount:e.amount;balances.set(name,(balances.get(name)||0)+delta);
      if(e.type==='receive')received+=e.amount;else if(e.type==='refund')refunded+=e.amount;else companyReceived+=e.amount;
    }
    return {received,refunded,companyReceived,balances:[...balances].filter(([,amount])=>amount!==0).map(([name,amount])=>({name,amount}))};
  }
  root.WBModel={text,number,flag,pct,unique,active,inScope,metrics,table,snapshot,delta,validateImport,split,ledger,expenseCandidates,expenseRecords,cashSettlement,uuid};
  if(typeof module==='object')module.exports=root.WBModel;
})(typeof window==='object'?window:globalThis);
