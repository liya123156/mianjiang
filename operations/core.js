/* Shared business calculations. Amounts are integer cents; monthly history is immutable. */
(function(root){
  'use strict';
  const text=v=>String(v??'').trim(), number=v=>Number.isFinite(Number(v))?Number(v):0;
  function uuid(){if(root.crypto.randomUUID)return root.crypto.randomUUID();const b=root.crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((n,i)=>([4,6,8,10].includes(i)?'-':'')+n.toString(16).padStart(2,'0')).join('');}
  const flag=v=>v===true||['1','是','true'].includes(text(v).toLowerCase());
  const sum=(a,f)=>a.reduce((n,x)=>n+f(x),0), unique=a=>[...new Set(a)], pct=(n,d)=>d?`${(n/d*100).toFixed(2)}%`:'—';
  function canonicalStore(value){const s=text(value).normalize('NFKC').replace(/\s/g,'');if(s==='徐汇二店')return '徐汇一店';if(/^hmall中心店$/i.test(s))return 'Hmall中心店';if(/^hmall旗舰店$/i.test(s))return 'Hmall旗舰店';return s;}
  const storeCatalog=[
    ['花木大区','仁恒河滨城店'],['花木大区','碧云店'],['花木大区','御翠园店'],['花木大区','浦东别墅旗舰店'],
    ['陆家嘴大区','星河湾店'],['陆家嘴大区','陆家嘴金融中心店'],['陆家嘴大区','陆家嘴旗舰店'],['陆家嘴大区','陆家嘴滨江店'],['陆家嘴大区','顶级豪宅部'],
    ['徐汇大区','嘉御庭公馆店'],['徐汇大区','尚海湾店'],['徐汇大区','徐汇滨江店'],['徐汇大区','徐汇一店',false],
    ['滨江古北大区','融创滨江壹号院店'],['滨江古北大区','长宁古北店'],['滨江古北大区','Hmall中心店',false],['滨江古北大区','Hmall旗舰店',false],
    ['黄浦大区','黄浦滨江店'],['黄浦大区','新天地一店'],['黄浦大区','新天地二店'],['黄浦大区','复兴香园店']
  ].map(([region,store,ownerApplicable=true])=>Object.freeze({region,store,ownerApplicable}));
  const catalogByStore=new Map(storeCatalog.map(s=>[s.store,s]));
  const canonicalGroup=value=>text(value).replace(/^徐汇二店/,'徐汇一店');
  function customerRow(r){const store=canonicalStore(r.store??r['店面']??r['门店']),aggregateOnly=r.aggregateOnly===true;return {region:text(r.region??r['大区'])||catalogByStore.get(store)?.region||'',store,group:aggregateOnly?'':canonicalGroup(r.group??r['店组'])||'未分组',name:aggregateOnly?'':text(r.name??r['客源维护人'])||'未填写',count:number(r.count??r['[A] 客户面见']??r['[A]客户面见']??r['客户面见次数']),aggregateOnly};}
  function customerInScope(rows,scope={}){return rows.filter(r=>(!scope.region||r.region===scope.region)&&(!scope.store||r.store===canonicalStore(scope.store))&&(!scope.group||r.group===canonicalGroup(scope.group)));}
  const columns=[['region','大区'],['store','店面'],['group','店组'],['name','姓名'],['target','目标套数'],['target_rate','目标面见率'],['stock','在售套数'],['met','面见量'],['met_count','面见次数'],['met_rate','面见率'],['gift','面见送礼物数量'],['gift_rate','面见送礼物覆盖率'],['store_top_stock','在售套数'],['store_top_met','面见量'],['store_top_met_count','面见次数'],['store_top_rate','面见率'],['unit_top_stock','在售套数'],['unit_top_met','面见量'],['unit_top_met_count','面见次数'],['unit_top_rate','面见率']].map(([key,label])=>({key,label}));
  const groups=month=>[{label:`${Number(month.slice(5))}月目标制定`,keys:['target','target_rate'],tone:'target'},{label:'全盘（月度进展）',keys:['stock','met','met_count','met_rate','gift','gift_rate'],tone:'whole'},{label:'门店Top业主（月度进展）',keys:['store_top_stock','store_top_met','store_top_met_count','store_top_rate'],tone:'store-top'},{label:'户型Top业主（月度进展）',keys:['unit_top_stock','unit_top_met','unit_top_met_count','unit_top_rate'],tone:'unit-top'}];
  function active(rows){return rows.filter(r=>flag(r['细分在售户数']??r['在售户数']));}
  function inScope(rows,scope){return rows.filter(r=>(!scope.region||r['大区']===scope.region)&&(!scope.store||canonicalStore(r['门店'])===canonicalStore(scope.store))&&(!scope.group||canonicalGroup(r['店组'])===canonicalGroup(scope.group)));}
  function metrics(rows,meetings=[]){
    const a=active(rows), met=a.filter(r=>flag(r['本月是否面见'])), gift=met.filter(r=>flag(r['本月是否送礼物']));
    const top=a.filter(r=>flag(r['门店top户数'])),unit=a.filter(r=>flag(r['户型top户数']));
    const houseKey=value=>text(value).replace(/[\s\u00a0]/g,'');
    const eventCounts=new Map();for(const r of meetings||[]){const id=houseKey(r['房源编号']);if(id)eventCounts.set(id,(eventCounts.get(id)||0)+1);}
    // Reconcile each property before aggregation. When the base table marks a property as met
    // but has no separate event detail, the base-table count is exactly one.
    function counts(houses,key){let confirmed=0,pending=0;for(const r of houses){const n=eventCounts.get(houseKey(r['房源编号']))||0;confirmed+=n;if(!n&&flag(r['本月是否面见']))pending++;}return {[key]:confirmed+pending,[key+'_confirmed']:confirmed,[key+'_pending']:pending};}
    return {stock:a.length,met:met.length,...counts(a,'met_count'),gift:gift.length,met_rate:pct(met.length,a.length),gift_rate:pct(gift.length,met.length),store_top_stock:top.length,store_top_met:top.filter(r=>flag(r['本月是否面见'])).length,...counts(top,'store_top_met_count'),store_top_rate:pct(top.filter(r=>flag(r['本月是否面见'])).length,top.length),unit_top_stock:unit.length,unit_top_met:unit.filter(r=>flag(r['本月是否面见'])).length,...counts(unit,'unit_top_met_count'),unit_top_rate:pct(unit.filter(r=>flag(r['本月是否面见'])).length,unit.length),metIds:met.map(r=>text(r['房源编号'])),giftIds:gift.map(r=>text(r['房源编号']))};
  }
  function meetingCountValue(row,key){return row?.[key];}
  function meetingCountLabel(row,key){return row?.[key]==='/'?'':'按底表面见次数合计';}
  function target(rows,level,name,goals){
    if(level==='store')return goals[name]!=null&&Number.isFinite(Number(goals[name]))?Number(goals[name]):null;
    if(level==='group'||level==='advisor')return null;
    const stores=unique(active(rows).map(r=>r['门店']));
    return stores.length&&stores.every(s=>goals[s]!=null)?sum(stores,s=>number(goals[s])):null;
  }
  function table(rows,scope,goals,month,meetings=[],options={}){
    scope={...scope,store:scope.store?canonicalStore(scope.store):''};
    const includeAllLevels=options.includeAllLevels===true;
    const customerEnabled=options.showCustomer===true&&(month==='2026-11'||options.customerImported===true||(options.customerRows||[]).length>0);
    const catalog=(options.storeCatalog||(customerEnabled?storeCatalog:[])).map(s=>({...s,store:canonicalStore(s.store),ownerApplicable:s.ownerApplicable??catalogByStore.get(canonicalStore(s.store))?.ownerApplicable??true}));
    const storeScope={...scope,group:''},selectedCatalog=customerInScope(catalog,storeScope),allCustomerRows=customerEnabled?(options.customerRows||[]).map(customerRow):[],customerRows=customerInScope(allCustomerRows,scope),customerImported=customerEnabled&&options.customerImported===true;
    const aggregateRows=customerInScope(allCustomerRows,storeScope).filter(r=>r.aggregateOnly);
    const normalized=rows.map(r=>({...r,'门店':canonicalStore(r['门店']),'店组':canonicalGroup(r['店组'])}));
    const scoped=inScope(normalized,scope).filter(r=>catalogByStore.get(r['门店'])?.ownerApplicable!==false), output=[];
    function add(g,c,level,name,identity){
      const m=metrics(g,meetings),t=target(g,level,name,goals),applicable=!(customerEnabled&&identity.store!=='/'&&catalogByStore.get(identity.store)?.ownerApplicable===false);
      const row={...identity,...m,target:t??'—',target_rate:t==null?'—':pct(t,m.stock),_level:level,_target:t,_ownerApplicable:applicable,_tone:level==='company'||level==='region'?'purple':''};
      if(!applicable){for(const column of columns.slice(4))row[column.key]='/';row._target=null;for(const key of ['met_count','store_top_met_count','unit_top_met_count']){row[key+'_confirmed']=0;row[key+'_pending']=0;}}
      if(customerEnabled){
        const hasAggregate=aggregateRows.some(r=>level==='company'||(level==='region'?r.region===identity.region:r.store===identity.store));
        const unavailable=hasAggregate&&(!!scope.group||level==='group'||level==='advisor');
        row._customerDetailAvailable=!hasAggregate;
        row._customerCountUnavailable=unavailable;
        row.customer_count=customerImported?(unavailable?'—':sum(c,r=>r.count)):'待导入';
      }
      output.push(row);
    }
    if(!scope.region&&!scope.store)add(scoped,customerRows,'company','全司',{region:'全司',store:'/',group:'/',name:'—'});
    const regions=unique([...active(scoped).map(r=>r['大区']),...selectedCatalog.map(r=>r.region),...customerRows.map(r=>r.region)]).filter(Boolean);
    for(const region of regions){const r=scoped.filter(x=>x['大区']===region),cr=customerRows.filter(x=>x.region===region),rc=selectedCatalog.filter(x=>x.region===region);if(!scope.store)add(r,cr,'region',region,{region,store:'/',group:'/',name:'—'});
      for(const store of unique([...active(r).map(x=>x['门店']),...rc.map(x=>x.store),...cr.map(x=>x.store)])){
        const s=r.filter(x=>x['门店']===store),cs=cr.filter(x=>x.store===store);add(s,cs,'store',store,{region,store,group:'/',name:'—'});
        if(scope.region||scope.store||includeAllLevels)for(const group of unique([...active(s).map(x=>x['店组']),...cs.filter(x=>!x.aggregateOnly).map(x=>x.group)])){
          if(scope.group&&group!==canonicalGroup(scope.group))continue;
          const g=s.filter(x=>x['店组']===group),cg=cs.filter(x=>!x.aggregateOnly&&x.group===group);add(g,cg,'group',group,{region,store,group,name:'—'});
          if(scope.store||includeAllLevels)for(const name of unique([...active(g).map(x=>x['维护人姓名']),...cg.map(x=>x.name)])){add(g.filter(x=>x['维护人姓名']===name),cg.filter(x=>x.name===name),'advisor',name,{region,store,group,name});}
        }
      }
    }
    const tableColumns=customerEnabled?[...columns,{key:'customer_count',label:'本月累计次数'}]:columns;
    const columnGroups=groups(month);if(customerEnabled)columnGroups.push({label:'客户面见',keys:['customer_count'],tone:'customer'});
    return {type:'table',variant:'progress',title:`${scope.store||scope.region||'全司'}面见及礼物进展`,columns:tableColumns,columnGroups,rows:output};
  }
  const rankedRates={met_rate:['met','stock'],store_top_rate:['store_top_met','store_top_stock'],unit_top_rate:['unit_top_met','unit_top_stock']};
  const rateRankStoreKey=row=>JSON.stringify([text(row.region),text(row.store)]);
  function rateRankCounts(row,key){
    const fields=rankedRates[key];if(!fields||row?._level!=='store'||!text(row.store))return null;
    const raw=fields.map(field=>row[field]);
    if(raw.some(value=>value==null||typeof value==='boolean'||text(value)===''))return null;
    const [count,base]=raw.map(Number);
    return Number.isFinite(count)&&Number.isFinite(base)&&count>=0&&base>0?{count,base}:null;
  }
  // Keep display percentages untouched. Compare original counts across all company stores,
  // so rounded percentages and the currently selected organization cannot change the ranks.
  function withRateRanks(block,companyRows=[]){
    if(!block)return block;
    const ranks=new Map(),stores=(companyRows||[]).filter(row=>row._level==='store');
    const compare=(a,b)=>a.count*b.base-b.count*a.base;
    for(const key of Object.keys(rankedRates)){
      const eligible=stores.map(row=>({row,counts:rateRankCounts(row,key)})).filter(entry=>entry.counts);
      if(eligible.length<2)continue;
      let lowest=eligible[0].counts,highest=lowest;
      for(const {counts} of eligible){if(compare(counts,lowest)<0)lowest=counts;if(compare(counts,highest)>0)highest=counts;}
      if(compare(lowest,highest)===0)continue;
      for(const {row,counts} of eligible){
        const rank=compare(counts,highest)===0?'highest':compare(counts,lowest)===0?'lowest':'';
        if(rank){const id=rateRankStoreKey(row),marks=ranks.get(id)||{};marks[key]=rank;ranks.set(id,marks);}
      }
    }
    return {...block,rows:(block.rows||[]).map(row=>({...row,_rateRanks:row._level==='store'?{...(ranks.get(rateRankStoreKey(row))||{})}:{}}))};
  }
  function rateRankSymbol(row,key){const rank=row?._level==='store'?row._rateRanks?.[key]:null;return rank==='highest'?'👍':rank==='lowest'?'❗':'';}
  function rateRankLabel(row,key){const rank=row?._level==='store'?row._rateRanks?.[key]:null;return rank==='highest'?'全司单店最高（含并列）':rank==='lowest'?'全司单店最低（含并列）':'';}
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
  function validateCustomerImport(rawRows,month,asOf,today){
    const date=new Date(asOf+'T00:00:00Z');
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==asOf||asOf.slice(0,7)!==month||asOf>today)throw Error('请选择所选月份内且不晚于今天的数据截止日');
    if(!Array.isArray(rawRows)||!rawRows.length||rawRows.length>20000)throw Error('客户面见原表须包含1—20000条明细记录');
    const header=value=>text(value).normalize('NFKC').replace(/[\s\uFEFF]/g,'').toLowerCase();
    const aliases={store:['店面','门店','store'],group:['店组','group'],name:['客源维护人','客户维护人','name'],count:['[a]客户面见','客户面见','客户面见次数','客户面见总次数','count']};
    const fields={};for(const key of unique(rawRows.flatMap(r=>Object.keys(r||{})))){const h=header(key);for(const field of Object.keys(aliases))if(aliases[field].includes(h)){if(fields[field]&&fields[field]!==key)throw Error('客户原表存在重复的'+({store:'店面',group:'店组',name:'客源维护人',count:'客户面见次数'}[field])+'列，请保留一列');fields[field]=key;}}
    for(const [field,label] of [['store','店面'],['group','店组'],['name','客源维护人'],['count','[A] 客户面见']])if(!fields[field])throw Error('客户原表缺少“'+label+'”列');
    const rows=[];let ignoredSummaryRows=0,ignoredBlankRows=0;
    const summary=value=>/^(?:全司|全部|总计|合计|小计|总合计|grand\s*total)$/i.test(text(value))||/(?:小计|合计)$/.test(text(value));
    for(const [i,r] of rawRows.entries()){
      if(Object.values(r||{}).every(v=>text(v)==='')){ignoredBlankRows++;continue;}
      const store=canonicalStore(r[fields.store]),group=canonicalGroup(r[fields.group]),name=text(r[fields.name]),value=r[fields.count];
      if([store,group,name].some(summary)){ignoredSummaryRows++;continue;}
      const entry=catalogByStore.get(store);if(!entry)throw Error(`第${i+2}行门店“${store||'空白'}”无法匹配21家门店，请核对名称`);
      if(typeof value==='boolean'||text(value)===''||!(/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/).test(text(value)))throw Error(`第${i+2}行客户面见次数须为非负整数`);
      const count=Number(text(value).replace(/,/g,''));if(!Number.isSafeInteger(count)||count<0)throw Error(`第${i+2}行客户面见次数须为非负整数`);if(count>1000000000)throw Error(`第${i+2}行客户面见次数超出有效范围，请核对原表`);
      rows.push({region:entry.region,store,group:group||'未分组',name:name||'未填写',count});
    }
    if(!rows.length)throw Error('客户原表没有可导入的门店明细，请保留明细行（次数可为0）');
    const total=sum(rows,r=>r.count);if(!Number.isSafeInteger(total)||total>20000000000000)throw Error('客户面见合计超出有效整数范围，请核对原表');
    const stores=storeCatalog.map(s=>({region:s.region,store:s.store,count:sum(rows.filter(r=>r.store===s.store),r=>r.count)}));
    return {month,asOf,rows,total,recordCount:rows.length,ignoredSummaryRows,ignoredBlankRows,stores};
  }
  function split(total,weights){const w=sum(weights,x=>x);if(!w)throw Error('超额承担比例合计须大于0');const exact=weights.map(x=>total*x/w),a=exact.map(Math.floor);let remain=total-sum(a,x=>x);const order=exact.map((x,i)=>({i,r:x-a[i]})).sort((x,y)=>y.r-x.r||x.i-y.i);for(let i=0;i<remain;i++)a[order[i].i]++;return a;}
  function expenseId(e={}){return text(e.expenseId)||text(e.houseId)||(text(e.key).includes('|')?text(e.key).split('|').slice(3).join('|'):'')||text(e.id);}
  function expenseQuantity(e={}){
    const raw=e.quantity;
    if(raw==null||text(raw)==='')return 1;
    const value=typeof raw==='boolean'?NaN:Number(raw);
    return Number.isSafeInteger(value)&&value>0?value:NaN;
  }
  function expenseAmount(e={}){
    const unit=typeof e.priceCents==='boolean'?NaN:Number(e.priceCents),quantity=expenseQuantity(e),total=unit*quantity;
    return Number.isSafeInteger(unit)&&unit>0&&Number.isSafeInteger(total)&&total>0?total:NaN;
  }
  const expenseAddressPart=value=>text(value).normalize('NFKC').replace(/[\s\u00a0]/g,'').toLowerCase();
  const expenseAddress=e=>expenseAddressPart(e.project)&&expenseAddressPart(e.room)?expenseAddressPart(e.project)+'|'+expenseAddressPart(e.room):'';
  function sameExpenseScope(a,b){return (!a.month||!b.month||a.month===b.month)&&(!a.region||!b.region||a.region===b.region)&&(!a.store||!b.store||canonicalStore(a.store)===canonicalStore(b.store));}
  function findExpenseDuplicates(candidate,records=[]){
    const id=expenseId(candidate),house=text(candidate.houseId),address=expenseAddress(candidate);
    return records.filter(e=>!e.voided&&(!id||expenseId(e)!==id)&&sameExpenseScope(candidate,e)&&((house&&text(e.houseId)===house)||((!house||!text(e.houseId))&&address&&expenseAddress(e)===address)));
  }
  function ledger(expenses,rules,head={}){
    const r={cap:3000,advisor:300,manager:500,storeContribution:30000,regionContribution:0,extraWeights:[1,1,1],...rules};
    for(const key of ['cap','advisor','manager','storeContribution','regionContribution'])if(!Number.isSafeInteger(r[key])||r[key]<0)throw Error('费用规则须为非负分币整数');
    if(!Array.isArray(r.extraWeights)||r.extraWeights.length!==3||r.extraWeights.some(w=>!Number.isFinite(w)||w<0)||!Number.isFinite(sum(r.extraWeights,w=>w))||sum(r.extraWeights,w=>w)<=0)throw Error('超额承担比例须为非负数且合计大于0');
    const result={actual:0,quantity:0,advisor:0,manager:0,store:0,region:0,company:0,storeConsumed:0,regionConsumed:0,extraStore:0,missing:0,lines:[],balances:[]};
    let remainder=0;
    for(const e of expenses){
      if(e.voided)continue;
      const price=typeof e.priceCents==='boolean'?NaN:Number(e.priceCents),quantity=expenseQuantity(e),amount=expenseAmount(e);
      if(!Number.isSafeInteger(amount)||amount<=0){result.missing++;continue;}
      const base=Math.min(price,r.cap),a=Math.min(base,r.advisor),m=Math.min(base-a,r.manager),extra=split(Math.max(0,price-r.cap),r.extraWeights);
      const advisorShare=(a+extra[0])*quantity,managerShare=(m+extra[1])*quantity,extraStoreShare=extra[2]*quantity;
      result.actual+=amount;result.quantity+=quantity;result.advisor+=advisorShare;result.manager+=managerShare;result.extraStore+=extraStoreShare;remainder+=(base-a-m)*quantity;
      if([result.actual,result.quantity,result.advisor,result.manager,result.extraStore,remainder].some(n=>!Number.isSafeInteger(n)))throw Error('费用金额或数量超出有效范围，请核对明细');
      if(!e.payer||!e.manager||!e.advisor||!e.proofPath)result.missing++;
      if(e.duplicateWarning)result.missing++;
      result.lines.push({...e,expenseId:expenseId(e),priceCents:price,quantity,amountCents:amount,advisorShare,managerShare,extraStoreShare});
    }
    const openingStore=number(head.openingStore),openingRegion=number(head.openingRegion);
    if(!Number.isSafeInteger(openingStore)||openingStore<0||!Number.isSafeInteger(openingRegion)||openingRegion<0||!Number.isSafeInteger(openingStore+r.storeContribution)||!Number.isSafeInteger(openingRegion+r.regionContribution))throw Error('期初余额须为有效的非负分币整数');
    result.storeConsumed=Math.min(remainder,openingStore+r.storeContribution);
    result.regionConsumed=Math.min(remainder-result.storeConsumed,openingRegion+r.regionContribution);
    result.company=remainder-result.storeConsumed-result.regionConsumed;
    result.store=result.storeConsumed+result.extraStore;result.region=result.regionConsumed;
    result.closingStore=openingStore+r.storeContribution-result.storeConsumed;result.closingRegion=openingRegion+r.regionContribution-result.regionConsumed;
    const balances=new Map(),change=(name,v)=>{if(name){const next=(balances.get(name)||0)+v;if(!Number.isSafeInteger(next))throw Error('收付款金额超出有效范围，请核对明细');balances.set(name,next);}};
    result.lines.forEach(e=>{change(e.payer,e.amountCents);change(e.advisor,-e.advisorShare);change(e.manager,-e.managerShare);});
    change(head.storeHead,-r.storeContribution-result.extraStore);change(head.regionHead,-r.regionContribution);change('公司（待财务报销）',-result.company);
    result.balances=[...balances].filter(([,amount])=>amount!==0).map(([name,amount])=>({name,amount}));
    if(!head.storeHead||(r.regionContribution&&!head.regionHead))result.missing++;
    if(result.actual!==result.advisor+result.manager+result.store+result.region+result.company)throw Error('费用分摊未对平');
    return result;
  }
  function expenseCandidates(rows,month){return active(rows).filter(r=>flag(r['本月是否送礼物'])&&text(r['房源编号'])).map(r=>({id:month+'|'+r['房源编号'],expenseId:text(r['房源编号']),month,source:'system',houseId:text(r['房源编号']),region:r['大区'],store:canonicalStore(r['门店']),group:r['店组'],advisor:r['维护人姓名'],project:r['分盘']||r['总盘']||'',room:r['房间号']||''}));}
  function expenseRecords(rows,items,month,scope={}){
    const saved=(items||[]).filter(x=>x.kind==='expense'&&(!x.month||x.month===month)&&x.payload&&(x.payload.recordType==='gift'||text(x.payload.houseId))).map(x=>({...x.payload,expenseId:expenseId({...x.payload,key:x.key}),month,region:x.region,store:canonicalStore(x.store),key:x.key,updated_at:x.updated_at}));
    const inExpenseScope=e=>(!scope.region||e.region===scope.region)&&(!scope.store||canonicalStore(e.store)===canonicalStore(scope.store));
    const assigned=new Map(saved.filter(e=>text(e.houseId)).map(e=>[text(e.houseId),e]));
    const candidates=expenseCandidates(inScope(rows||[],scope),month).filter(e=>!assigned.has(e.houseId)||inExpenseScope(assigned.get(e.houseId)));
    const output=new Map(candidates.map(e=>[e.expenseId,e]));
    const local=saved.filter(inExpenseScope);
    for(const e of local){
      const id=expenseId(e);if(!id)continue;
      const existing=text(e.houseId)?output.get(text(e.houseId)):output.get(id);
      output.set(id,{...existing,...e,retained:!existing});
    }
    // A later import may supply a house ID for an already entered manual gift.
    // Absorb only an unambiguous same-store address candidate; keep the saved ID
    // stable until an explicit server-side link, and never merge two real IDs.
    const unresolved=local.filter(e=>!e.voided&&!text(e.houseId)&&e.source==='manual'&&expenseAddress(e));
    for(const manual of unresolved){
      const matches=candidates.filter(c=>sameExpenseScope(manual,c)&&expenseAddress(c)===expenseAddress(manual));
      const peers=unresolved.filter(e=>sameExpenseScope(e,manual)&&expenseAddress(e)===expenseAddress(manual));
      if(matches.length===1&&peers.length===1&&!assigned.has(matches[0].houseId)){
        const c=matches[0];output.delete(c.expenseId);output.set(expenseId(manual),{...c,...manual,matchedHouseId:c.houseId,houseId:'',retained:false});
      }else if(matches.length||peers.length>1){const current=output.get(expenseId(manual));output.set(expenseId(manual),{...current,duplicateWarning:'同一门店存在相似房源费用，请核实是否重复后再结账。'});}
    }
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
  root.WBModel={text,number,flag,pct,unique,canonicalStore,storeCatalog,active,inScope,metrics,meetingCountValue,meetingCountLabel,table,withRateRanks,rateRankSymbol,rateRankLabel,snapshot,delta,validateImport,validateCustomerImport,split,ledger,expenseId,expenseQuantity,expenseAmount,findExpenseDuplicates,expenseCandidates,expenseRecords,cashSettlement,uuid};
  if(typeof module==='object')module.exports=root.WBModel;
})(typeof window==='object'?window:globalThis);
