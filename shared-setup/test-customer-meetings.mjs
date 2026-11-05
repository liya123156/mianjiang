import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../operations/core.js');
const month='2026-11',asOf='2026-11-05';
const raw=[
  {'店面':'徐汇一店','店组':'徐汇一店A组','客源维护人':'测试甲','[A] 客户面见':3},
  {'店面':'黄浦滨江店','店组':'黄浦滨江店B组','客源维护人':'测试乙','[A] 客户面见':1},
  {'店面':'合计','店组':'','客源维护人':'','[A] 客户面见':4}
];
const imported=M.validateCustomerImport(raw,month,asOf,asOf);
assert.equal(imported.total,4,'sum the exported count, not its row count');
assert.equal(imported.recordCount,2);
assert.equal(imported.ignoredSummaryRows,1,'exported total must not be counted twice');
assert.equal(imported.stores.length,21);
assert.equal(imported.stores.filter(s=>s.count===0).length,19,'absent stores in a complete snapshot mean zero');
const options={customerRows:imported.rows,customerImported:true};
const block=M.table([],{}, {},month,[],options);
assert.equal(block.rows.filter(r=>r._level==='store').length,21);
assert.equal(block.rows.filter(r=>r._level==='region').length,5);
assert.equal(block.columns.at(-1).key,'customer_count');
assert.equal(block.columnGroups.at(-1).label,'客户面见');
assert.equal(block.rows[0].customer_count,4);
assert.equal(block.rows.filter(r=>r._level==='region').reduce((s,r)=>s+r.customer_count,0),4);
assert.equal(block.rows.filter(r=>r._level==='store').reduce((s,r)=>s+r.customer_count,0),4);
for(const store of ['徐汇一店','Hmall中心店','Hmall旗舰店']){
  const row=block.rows.find(r=>r._level==='store'&&r.store===store);
  assert.equal(row._ownerApplicable,false);
  for(const field of ['target','target_rate','stock','met','met_count','met_rate','gift','gift_rate','store_top_stock','store_top_met','store_top_met_count','store_top_rate','unit_top_stock','unit_top_met','unit_top_met_count','unit_top_rate'])assert.equal(row[field],'/',field+' not applicable');
}
assert.equal(M.table([],{}, {},month).rows[0].customer_count,'待导入');
assert.equal(M.table([],{}, {},'2026-10').columns.some(c=>c.key==='customer_count'),false,'do not rewrite historical owner-only tables');
assert.equal(M.table([],{}, {},'2026-10',[],{customerRows:[],customerImported:false}).columns.some(c=>c.key==='customer_count'),false,'empty customer options do not change historical tables');
const xu=M.table([],{store:'徐汇一店'}, {},month,[],options);
assert.deepEqual(xu.rows.map(r=>r._level),['store','group','advisor']);
assert.deepEqual(xu.rows.map(r=>r.customer_count),[3,3,3]);
assert.equal(xu.rows.at(-1).name,'测试甲');
const region=M.table([],{region:'徐汇大区'}, {},month,[],options);
assert.equal(region.rows[0].customer_count,3);
assert.equal(region.rows.filter(r=>r._level==='store').length,4);
const aliasRaw=[{'店面':'徐汇二店','店组':'徐汇二店A组','客源维护人':'测试甲','[Ａ]　客户面见':'3'},{'店面':'hmall中心店','店组':'A组','客源维护人':'测试乙','[Ａ]　客户面见':2}];
const alias=M.validateCustomerImport(aliasRaw,month,asOf,asOf);
assert.equal(alias.rows[0].store,'徐汇一店');
assert.equal(alias.rows[0].group,'徐汇一店A组');
assert.equal(alias.rows[1].store,'Hmall中心店');
assert.equal(M.table([],{store:'徐汇二店'}, {},month,[],{customerRows:alias.rows,customerImported:true}).rows[0].customer_count,3);

// Replacing a cumulative snapshot must not add the previous month's/import's rows.
const newer=M.validateCustomerImport([{...raw[0],'[A] 客户面见':5}],month,asOf,asOf);
const replaced=M.table([],{}, {},month,[],{customerRows:newer.rows,customerImported:true});
assert.equal(replaced.rows[0].customer_count,5);
assert.equal(replaced.rows.find(r=>r.store==='黄浦滨江店').customer_count,0);
assert.deepEqual(M.validateCustomerImport(raw,month,asOf,asOf),imported,'identical inputs remain idempotent');
for(const value of [-1,1.2,'abc','',true,Infinity,'1,2'])assert.throws(()=>M.validateCustomerImport([{...raw[0],'[A] 客户面见':value}],month,asOf,asOf),/非负整数/);
assert.throws(()=>M.validateCustomerImport([{...raw[0],'店面':'不存在店'}],month,asOf,asOf),/无法匹配/);
assert.throws(()=>M.validateCustomerImport([{...raw[0],'[A] 客户面见':1000000001}],month,asOf,asOf),/超出有效范围/);
assert.throws(()=>M.validateCustomerImport([{'店面':'徐汇一店','客户面见':3}],month,asOf,asOf),/缺少/);
assert.throws(()=>M.validateCustomerImport(raw,month,'2026-11-31','2026-12-01'),/截止日/);
assert.throws(()=>M.validateCustomerImport(raw,month,'2026-11-06',asOf),/截止日/);
assert.equal(M.validateCustomerImport([{...raw[0],'[A] 客户面见':0}],month,asOf,asOf).total,0,'an explicit zero row imports a valid all-zero month');

// A bottom-table met flag with missing event detail previously vanished in aggregates.
const house=(store,id,met=true)=>({'大区':'花木大区','门店':store,'店组':store+'A组','维护人姓名':'测试','房源编号':id,'细分在售户数':1,'本月是否面见':met?1:0,'门店top户数':1,'户型top户数':1});
const housing=[house('仁恒河滨城店','1'),house('碧云店','2'),house('御翠园店','3'),house('浦东别墅旗舰店','4')];
const meetings=[{'房源编号':' 1 '},{'房源编号':'3'},{'房源编号':'4'}];
const counted=M.table(housing,{}, {},month,meetings,options);
const excluded=M.table([...housing,{...house('徐汇一店','no-owner'),'大区':'徐汇大区'}],{}, {},month,meetings,options);
assert.equal(excluded.rows[0].stock,4,'non-owner stores never enter owner stock or rate denominators');
const flower=counted.rows.find(r=>r._level==='region'&&r.region==='花木大区');
for(const key of ['met_count','store_top_met_count','unit_top_met_count']){
  assert.equal(flower[key],4);
  assert.equal(flower[key+'_confirmed'],3);
  assert.equal(flower[key+'_pending'],1);
  assert.equal(counted.rows[0][key],4);
  assert.equal(counted.rows.filter(r=>r._level==='store').reduce((s,r)=>s+(typeof r[key]==='number'?r[key]:0),0),4);
  assert.equal(M.meetingCountValue(flower,key),'≥4');
  assert.match(M.meetingCountLabel(flower,key),/1套已面见房源待补明细/);
}
const fixed=M.table(housing,{}, {},month,[...meetings,{'房源编号':'2'},{'房源编号':'2'}],options);
assert.equal(fixed.rows[0].met_count,5,'two confirmed visits to the same property both count');
assert.equal(fixed.rows[0].met_count_pending,0);
assert.equal(M.meetingCountValue(fixed.rows[0],'met_count'),5);
assert.equal(fixed.rows[0].met,4,'meeting occurrences do not change distinct property count');
const ranked=M.withRateRanks(counted,counted.rows);
assert.ok(ranked.rows.filter(r=>r._ownerApplicable===false).every(r=>Object.keys(r._rateRanks).length===0),'customer-only stores never enter owner rate ranking');

// Customer-only groups/advisors coexist with owner-only groups without multiplying totals.
const multi=M.table([house('黄浦滨江店','9')],{store:'黄浦滨江店'}, {},month,[],{customerImported:true,customerRows:[{region:'黄浦大区',store:'黄浦滨江店',group:'客户B组',name:'测试B',count:4}]});
assert.equal(multi.rows.find(r=>r._level==='group'&&r.group==='客户B组').customer_count,4);
assert.equal(multi.rows.filter(r=>r._level==='advisor').reduce((s,r)=>s+r.customer_count,0),4);

// Public totals do not invent advisor/group identities or imply unavailable counts are zero.
const publicCustomerRows=[{region:'徐汇大区',store:'徐汇一店',group:'',name:'',count:3,aggregateOnly:true},{region:'花木大区',store:'碧云店',group:'',name:'',count:2,aggregateOnly:true}];
const publicOptions={customerRows:publicCustomerRows,customerImported:true};
const publicCompany=M.table(housing,{}, {},month,meetings,publicOptions);
assert.equal(publicCompany.rows[0].customer_count,5);
assert.equal(publicCompany.rows[0]._customerDetailAvailable,false);
assert.equal(publicCompany.rows.filter(r=>r._level==='store').reduce((s,r)=>s+r.customer_count,0),5);
const publicXu=M.table([],{store:'徐汇一店'}, {},month,[],publicOptions);
assert.deepEqual(publicXu.rows.map(r=>r._level),['store'],'a store aggregate must not create fake blank groups or advisors');
assert.equal(publicXu.rows[0].customer_count,3);
const publicBiyun=M.table(housing,{store:'碧云店'}, {},month,meetings,publicOptions);
assert.equal(publicBiyun.rows[0].customer_count,2);
for(const row of publicBiyun.rows.filter(r=>r._level==='group'||r._level==='advisor')){
  assert.equal(row.customer_count,'—');
  assert.equal(row._customerDetailAvailable,false);
  assert.equal(row._customerCountUnavailable,true);
}
const filteredGroup=M.table(housing,{store:'碧云店',group:'碧云店A组'}, {},month,meetings,publicOptions);
assert.ok(filteredGroup.rows.length>0);
assert.ok(filteredGroup.rows.every(r=>r.customer_count==='—'),'an explicit group filter cannot turn an inaccessible aggregate into zero');
const mixedRows=[publicCustomerRows[0],{region:'花木大区',store:'碧云店',group:'碧云店A组',name:'测试',count:2}];
const permitted=M.table(housing,{store:'碧云店'}, {},month,meetings,{customerRows:mixedRows,customerImported:true});
assert.ok(permitted.rows.every(r=>r.customer_count===2));
assert.ok(permitted.rows.every(r=>r._customerDetailAvailable===true));
assert.equal(M.table(housing,{}, {},month,meetings,{customerRows:mixedRows,customerImported:true}).rows[0].customer_count,5,'mixed permitted details and other-store aggregates sum only once');
console.log('PASS: cumulative customer import, 21 stores, alias handling, missing-zero semantics, hierarchy, non-applicable owner fields, and additive confirmed/minimum counts.');
