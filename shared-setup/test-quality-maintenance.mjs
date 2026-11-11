import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const Q=require('../operations/quality.js');

const cases=[
 ['日常粘合','R'],['反馈客户','R'],['道歉，日常送礼','R'],
 ['跟业主反馈了客户看房意见','R'],['反馈意向客户','R'],
 ['计划明天反馈客户并送礼','U'],['今天未送礼，也未反馈客户','U'],
 ['准备日常粘合','U'],['反馈客户尚未完成','U'],
 ['虽然未送礼，但已向业主反馈客户看房意见','R'],
 ['送礼后没有获得更多信息','R'],['原计划明天反馈客户，今天已经反馈客户','R'],
 ['计划明天面见，反馈客户并送礼','U'],['准备日常粘合，同时反馈客户','U'],
 ['下周给业主送礼','U'],['送礼计划明天进行','U'],['送礼计划已确定','U'],
 ['客户反馈尚未沟通','U'],['今天没有日常粘合，送礼也没进行','U'],
 ['已向业主反馈客户意见，明天再送礼','R'],['虽然未送礼，但已反馈客户','R'],
 ['日常粘合，同时确认底价为2600万','P'],
 ['日常送礼，业主已交钥匙并签署委托','E'],
 ['日常粘合，业主同意周末看房','V'],
 ['日常粘合，核实房屋存在抵押','C'],
 ['面见','U'],['','U']
];
for(const [text,expected] of cases)assert.equal(Q.suggest(text).category,expected,text);
assert.deepEqual(Q.suggest('日常粘合，同时确认底价为2600万').tags,['P','R']);
assert.equal(Q.labels.R,'关系维护／客户反馈沟通');

const housing=[
 {'房源编号':'A','细分在售户数':1,'本月是否面见':1,'大区':'甲区','门店':'甲店','店组':'甲组'},
 {'房源编号':'B','细分在售户数':1,'本月是否面见':1,'大区':'甲区','门店':'甲店','店组':'甲组'},
 {'房源编号':'C','细分在售户数':1,'本月是否面见':1,'大区':'乙区','门店':'乙店','店组':'乙组'}
];
const meetings=[
 {'房源编号':'A','面见id':'1','面见时间':'2026-11-01','面见反馈':'日常粘合'},
 {'房源编号':'A','面见id':'2','面见时间':'2026-11-02','面见反馈':'反馈客户'},
 {'房源编号':'A','面见id':'3','面见时间':'2026-11-03','面见反馈':'道歉，日常送礼'},
 {'房源编号':'B','面见id':'4','面见时间':'2026-11-03','面见反馈':'日常送礼，业主已交钥匙'}
];
const records=Q.records(housing,meetings,[],'2026-11','2026-11-10');
assert.equal(records[0].category,'R');
assert.equal(records[0].events.length,3);
assert.equal(records[1].category,'E');
assert.equal(records[2].missing,true);
const s=Q.summary(records);
assert.equal(s.total,3);assert.equal(s.counts.R,1);assert.equal(s.counts.E,1);assert.equal(s.counts.U,1);assert.equal(s.missing,1);
assert.equal(Object.values(s.counts).reduce((n,v)=>n+v,0),s.total);
const saved={kind:'review',payload:{recordType:'quality',houseId:'A',category:'V',confirmed:true,sourceSignature:Q.signature(meetings.slice(0,3)),basis:'人工核对保留'}};
assert.equal(Q.records(housing,meetings,[saved],'2026-11','2026-11-10')[0].category,'V');
const pub=Q.publicSummary(records,'2026-11-10','test-version');
for(const g of pub.groups)assert.equal(Object.values(g.counts).reduce((n,v)=>n+v,0),g.total);
assert.equal(pub.groups.filter(g=>g.scope==='store').reduce((n,g)=>n+g.counts.R,0),s.counts.R);
assert.equal(JSON.stringify(pub).includes('日常粘合'),false);
console.log(`PASS: ${cases.length} classification cases; priority, deduplication, manual review, missing feedback, and all-scope public summaries`);
