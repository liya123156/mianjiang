import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const x={window:null,document:{addEventListener(){}},currentMonth:'2026-11',WBCloud:{},WBQuality:{labels:{}},console};x.window=x;vm.createContext(x);
for(const file of ['core','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+file+'.js',import.meta.url),'utf8'),x,{filename:file+'.js'});
const api=x.WBOperations;
const row=(name,met,rate,level='store',stock=100)=>({_level:level,store:level==='store'?name:'测试店',group:name,stock,met,met_rate:rate+'%',gift:met,store_top_met:0,store_top_rate:'0.00%',unit_top_met:0,unit_top_rate:'0.00%'});
const names=rows=>Array.from(rows,r=>r._level==='group'?r.group:r.store).sort();
const select=(rows,level='store')=>api.novemberRankedSelection(rows,level);
// Separate volume and rate ranks matter; offsetting advantages remain tied, without arbitrary tie-breaks.
const balanced=[row('A店',12,10),row('B店',10,20),row('C店',8,40),row('D店',2,5)];
const tied=select(balanced);
assert.deepEqual(names(tied.best),['A店','B店','C店']);assert.deepEqual(names(tied.low),['D店']);
assert.deepEqual(Array.from(tied.ranked,r=>[r.volumeRank,r.rateRank,r.score]),[[1,3,4],[2,2,4],[3,1,4],[4,4,8]]);
assert.deepEqual(names(select([...balanced].reverse()).best),names(tied.best),'import order cannot change a tied first place');
// Competition ranking leaves gaps after ties, and every tied last place is retained.
const competition=select([row('A店',8,40),row('B店',8,40),row('C店',2,10),row('D店',2,10)]);
assert.deepEqual(Array.from(competition.ranked,r=>r.score),[2,2,6,6]);
assert.deepEqual(names(competition.best),['A店','B店']);assert.deepEqual(names(competition.low),['C店','D店']);
// Zero-owner-stock rows never participate; zero meetings never become benchmarks.
const zeros=select([row('A店',0,0),row('B店',0,0),row('无在售店',99,100,'store',0)]);
assert.equal(zeros.best.length,0);assert.deepEqual(names(zeros.low),['A店','B店']);assert.equal(zeros.ranked.length,2);
assert.equal(select([]).best.length,0);assert.equal(select([]).low.length,0);
const positiveTie=select([row('A店',1,10),row('B店',1,10)]);assert.equal(positiveTie.best.length,2);assert.equal(positiveTie.low.length,0,'do not both praise and remind the same tied objects');
const only=select([row('唯一店',1,10)]);assert.equal(only.best.length,1);assert.equal(only.low.length,0);
const roundedTie=select([row('A店',1,1.23,'store',81),row('B店',1,1.23,'store',82)]);assert.equal(roundedTie.best.length,2,'the visible rounded rate defines rate ties');
// Scope and level selection: company -> stores; region -> stores and groups; store -> groups.
const scopeRows=[row('第一店',10,20),row('第二店',1,1),row('第一店A组',8,30,'group'),row('第一店B组',1,2,'group'),row('第二店A组',0,0,'group'),row('第二店B组',0,0,'group')];
const message=view=>api.novemberMessage(view,{rows:scopeRows},{...scopeRows[0],_ownerApplicable:true},20,'业主数据截至2026-11-12');
const sections=text=>({best:text.split('🏅 ')[1].split('\n\n')[0],low:text.split('⚠️ ')[1].split('\n\n')[0]});
const company=sections(message({scope:'company',name:'全司'}));assert.match(company.best,/第一店：/);assert.match(company.low,/第二店：/);assert.doesNotMatch(company.best+company.low,/组：/);
const region=sections(message({scope:'region',name:'测试大区',region:'测试大区'}));assert.match(region.best,/第一店：/);assert.match(region.best,/第一店A组：/);assert.match(region.low,/第二店：/);assert.match(region.low,/第二店A组：/);assert.match(region.low,/第二店B组：/);assert.doesNotMatch(region.low,/第一店B组：/,'only the tied last group band is reminded');
const storeRows=scopeRows.filter(r=>r._level==='group'&&r.group.startsWith('第一店'));
const storeText=api.novemberMessage({scope:'store',name:'第一店'},{rows:storeRows},scopeRows[0],20,'业主数据截至2026-11-12'),store=sections(storeText);
assert.match(store.best,/第一店A组：/);assert.match(store.low,/第一店B组：/);assert.doesNotMatch(store.best+store.low,/第二店/);
for(const result of [tied,competition,zeros,positiveTie,only])assert.ok(result.best.every(r=>!result.low.includes(r)));
console.log('PASS publication rankings: equally weighted competition ranks, first/last bands only, all ties, zero and stock exclusions, no duplicate praise/reminder, and company/region/store levels.');
if(process.env.RANKING_SNAPSHOT_FILE){
 const snapshot=JSON.parse(fs.readFileSync(process.env.RANKING_SNAPSHOT_FILE,'utf8')),M=x.WBModel;
 const inScope=view=>M.table(snapshot.housing,view,{},'2026-11',snapshot.meetings).rows;
 const company=select(inScope({scope:'company',name:'全司'}));
 assert.deepEqual(names(company.best),['御翠园店']);assert.deepEqual(names(company.low),['仁恒河滨城店']);
 assert.equal(company.ranked.find(r=>r.row.store==='御翠园店').score,3);assert.equal(company.ranked.find(r=>r.row.store==='仁恒河滨城店').score,34);
 const huamu=inScope({scope:'region',name:'花木大区',region:'花木大区'});
 assert.deepEqual(names(select(huamu).best),['御翠园店']);assert.deepEqual(names(select(huamu).low),['仁恒河滨城店']);
 assert.deepEqual(names(select(huamu,'group').best),['御翠园店A组']);
 assert.deepEqual(names(select(huamu,'group').low),['仁恒河滨城店A组','仁恒河滨城店B组','浦东别墅旗舰店D组','碧云店A组','碧云店D组'].sort());
 assert.deepEqual(Array.from(select(huamu,'group').low,r=>r.group),['仁恒河滨城店A组','仁恒河滨城店B组','碧云店A组','碧云店D组','浦东别墅旗舰店D组'],'tied groups keep store order, then group letters');
 const renheng=select(inScope({scope:'store',name:'仁恒河滨城店',store:'仁恒河滨城店',region:'花木大区'}),'group');
 assert.deepEqual(names(renheng.best),['仁恒河滨城店E组']);assert.deepEqual(names(renheng.low),['仁恒河滨城店A组','仁恒河滨城店B组']);
 const binjiang=select(inScope({scope:'region',name:'滨江古北大区',region:'滨江古北大区'}));
 assert.deepEqual(names(binjiang.best),['融创滨江壹号院店','长宁古北店'].sort());assert.equal(binjiang.low.length,0);
 console.log('PASS supplied live snapshot: company, Huamu stores/groups, Renheng groups, and two-store offsetting-rank tie expectations.');
}
