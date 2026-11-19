import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../operations/core.js');
const head='本月最近一次面见是否店总陪同',manager='本月最近一次面见是否店经理陪同';
const house=(id,store,options={})=>({'房源编号':id,'大区':'黄浦大区','门店':store,'店组':store+'A组','维护人姓名':'伙伴'+id,'细分在售户数':1,'本月是否面见':1,'门店top户数':0,'户型top户数':0,[head]:0,[manager]:0,...options});
const rows=[
 house('a1','黄浦滨江店',{'门店top户数':1,'户型top户数':1,[head]:1,[manager]:'是'}),
 house('a2','黄浦滨江店',{'门店top户数':1,[head]:'否'}),
 house('a3','黄浦滨江店',{'店组':'黄浦滨江店B组','门店top户数':1,'本月是否面见':0,[head]:1}),
 house('b1','新天地一店',{'门店top户数':1,'户型top户数':1,[head]:true,[manager]:false}),
 house('b2','新天地一店',{'户型top户数':1,[manager]:'true'}),
 house('b3','新天地一店',{'户型top户数':1,'本月是否面见':0,[manager]:1})
];
const before=JSON.stringify(rows),goals={'黄浦滨江店':10,'新天地一店':10};
const company=M.table(rows,{},goals,'2026-11').rows[0];
for(const prefix of ['store_top_head','unit_top_manager']){
 assert.equal(company[prefix+'_met'],2);
 assert.equal(company[prefix+'_confirmed'],2);
 assert.equal(company[prefix+'_pending'],0);
 assert.equal(company[prefix+'_stock'],4);
 assert.equal(company[prefix+'_met_base'],3);
 assert.equal(company[prefix+'_rate'],'50.00%');
 assert.equal(company[prefix+'_share'],'66.67%');
}
assert.equal(company.met,4,'existing whole-stock met count includes both TOP types once');
assert.equal(company.stock,6);
const region=M.table(rows,{region:'黄浦大区'},goals,'2026-11');
const storeA=region.rows.find(row=>row._level==='store'&&row.store==='黄浦滨江店');
const storeB=region.rows.find(row=>row._level==='store'&&row.store==='新天地一店');
assert.equal(storeA.store_top_head_met,1);
assert.equal(storeA.store_top_head_rate,'33.33%');
assert.equal(storeA.store_top_head_share,'50.00%');
assert.equal(storeB.store_top_head_rate,'100.00%');
assert.notEqual(company.store_top_head_rate,((33.33+100)/2).toFixed(2)+'%','company rates use total properties, not an average of store rates');
assert.equal(region.rows[0].store_top_head_rate,'50.00%');
const group=region.rows.find(row=>row._level==='group'&&row.group==='黄浦滨江店A组');
assert.equal(group.store_top_head_met,1);
assert.equal(group.store_top_head_rate,'50.00%');
assert.equal(group.store_top_head_share,'50.00%');
assert.equal(region.rows.find(row=>row._level==='group'&&row.group==='黄浦滨江店B组').store_top_head_share,'—');

// Dual-TOP properties participate in both applicable role metrics, never in a summed TOP total.
const dual=M.metrics([rows[0]]);
assert.equal(dual.store_top_head_met,1);assert.equal(dual.unit_top_manager_met,1);assert.equal(dual.met,1);
assert.ok(!Object.hasOwn(dual,'top_accompanied_total'));
const duplicate=M.metrics([...rows,{...rows[0],'房源编号':' a1 '}]);
assert.equal(duplicate.store_top_head_met,company.store_top_head_met);
assert.equal(duplicate.store_top_head_rate,company.store_top_head_rate);
assert.equal(duplicate.unit_top_manager_share,company.unit_top_manager_share);
assert.equal(duplicate.stock,7,'new companion deduplication does not silently rewrite older stock metrics');
const conflict=M.metrics([rows[0],{...rows[0],[head]:0}]);
assert.equal(conflict.store_top_head_met,'待核实（已确认0套）');
assert.equal(conflict.store_top_head_pending,1);assert.equal(conflict.store_top_head_rate,'待核实');
assert.equal(conflict.unit_top_manager_met,1,'one role conflict does not contaminate the other role');
const missingId=M.metrics([{...rows[0],'房源编号':''}]);
assert.equal(missingId.store_top_head_pending,1,'unknown identity is not a confirmed distinct property');

for(const value of ['',undefined,null,'未知','2']){
 const unknown=M.metrics([rows[0],house('unknown','黄浦滨江店',{'门店top户数':1,[head]:value})]);
 assert.equal(unknown.store_top_head_confirmed,1);
 assert.equal(unknown.store_top_head_met,'待核实（已确认1套）');
 assert.equal(unknown.store_top_head_pending,1);
 assert.equal(unknown.store_top_head_met_pending,1);
 assert.equal(unknown.store_top_head_rate,'待核实');
 assert.equal(unknown.store_top_head_share,'待核实');
}
for(const value of [0,'0',false,'false','否'])assert.equal(M.metrics([house('zero','黄浦滨江店',{'门店top户数':1,[head]:value})]).store_top_head_met,0);
for(const value of [1,'1',true,'true','是'])assert.equal(M.metrics([house('one','黄浦滨江店',{'门店top户数':1,[head]:value})]).store_top_head_met,1);
const inactive=M.metrics([{...rows[0],'细分在售户数':0}]);
assert.equal(inactive.store_top_head_met,0);assert.equal(inactive.store_top_head_rate,'—');assert.equal(inactive.unit_top_manager_share,'—');
const unmet=M.metrics([{...rows[0],'本月是否面见':0,[head]:null,[manager]:null}]);
assert.equal(unmet.store_top_head_met,0);assert.equal(unmet.store_top_head_rate,'0.00%');assert.equal(unmet.store_top_head_share,'—');
assert.equal(unmet.store_top_head_pending,0,'unmet houses do not create missing accompaniment flags');

const november=M.table(rows,{},goals,'2026-11'),october=M.table(rows,{},goals,'2026-10');
assert.equal(november.columns.length,october.columns.length+6);
for(const definition of M.accompanimentDefinitions){
 for(const suffix of ['met','rate','share'])assert.ok(november.columns.some(column=>column.key===definition.prefix+'_'+suffix));
 assert.ok(!october.columns.some(column=>column.key.startsWith(definition.prefix)));
}
assert.match(november.columnGroups.find(group=>group.tone==='store-top').label,/店总陪同/);
assert.match(november.columnGroups.find(group=>group.tone==='unit-top').label,/店经理陪同/);
assert.equal(october.columnGroups.find(group=>group.tone==='store-top').label,'门店Top业主（月度进展）');
const customerOnly=M.table([],{store:'徐汇一店'}, {},'2026-11',[],{showCustomer:true,customerImported:true,customerRows:[{region:'徐汇大区',store:'徐汇一店',group:'A组',name:'测试',count:1}]}).rows[0];
assert.equal(customerOnly._ownerApplicable,false);
for(const definition of M.accompanimentDefinitions)for(const suffix of ['met','rate','share'])assert.equal(customerOnly[definition.prefix+'_'+suffix],'/');
assert.match(M.accompanimentNote,/最近一次/);assert.match(M.accompanimentNote,/不能直接相加/);
assert.equal(JSON.stringify(rows),before,'metrics and table do not mutate the imported rows');
console.log('PASS accompaniment model: exact latest-visit flags, distinct-property counts, weighted scope rates, separate dual TOPs, missing/conflicting flags, zero bases, six November-only columns, customer-only applicability and unchanged base data.');
