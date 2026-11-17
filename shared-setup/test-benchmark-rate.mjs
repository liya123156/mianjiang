import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const draw=[];
const ctx={font:'',scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},roundRect(){},createLinearGradient(){return {addColorStop(){}};},measureText(value){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||25);return {width:Array.from(String(value)).reduce((n,c)=>n+(/^[\x00-\x7f]$/.test(c)?.55:1),0)*size};},fillText(value,x,y){draw.push({value:String(value),x,y,size:Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||25)});}};
const canvases=[];
const x={window:null,console,Intl,Date,Blob,document:{fonts:{ready:Promise.resolve()},createElement(){const c={width:0,height:0,getContext:()=>ctx,toBlob(fn,type){fn(new Blob(['png'],{type}));}};canvases.push(c);return c;}}};x.window=x;vm.createContext(x);
for(const module of ['core','quality-feed','quality-rules','quality','benchmark-board'])vm.runInContext(fs.readFileSync(new URL('../operations/'+module+'.js',import.meta.url),'utf8'),x,{filename:module});
const B=x.WBCompanyBenchmark,M=x.WBModel,catalog=M.storeCatalog.filter(s=>s.ownerApplicable!==false);
const common=(store,group,met,stock,meetingCount=met)=>({store,group,name:store,level:'store',met,stock,meetingCount});
const volumeLeader=common('大盘门店','A',10,100,10),rateLeader=common('覆盖门店','B',4,10,4);
assert.equal(B.rank([volumeLeader,rateLeader],1,'store')[0].store,'覆盖门店','organizational rank uses coverage before volume');
assert.equal(B.rank([volumeLeader,rateLeader],1,'advisor')[0].store,'大盘门店','individual ranking still uses met count');
const precision=[common('先排序','A',5,100000,5),common('后排序','B',5,99999,5)];
assert.equal(B.rateText(precision[0]),B.rateText(precision[1]));
assert.equal(B.rank(precision,1,'group')[0].store,'后排序','unrounded fractions distinguish equal displayed rates');
const sameRate=[common('甲','A',5,10,5),common('乙','B',6,12,6),common('丙','C',6,12,7),common('丁','D',6,12,7)];
const tied=B.rank(sameRate,1,'group');assert.deepEqual(Array.from(tied,r=>r.store),['丙','丁']);assert.deepEqual(Array.from(tied,r=>r.rank),[1,1]);
const cutoff=B.rank([5,4,3,2,1,1].map((n,i)=>common('门店'+i,'A',n,10,n)),5,'store');
assert.equal(cutoff.length,6);assert.deepEqual(Array.from(cutoff,r=>r.rank),[1,2,3,4,5,5]);
assert.equal(B.rank([common('无在售','A',1,0),common('未面见','A',0,10),rateLeader],5,'store').length,1,'ineligible zero stock or met never becomes a benchmark');

// The eligibility floor is monthly unique houses, applied before rate ranking only for groups.
assert.equal(M.groupBenchmarkMinimum,5);
const thresholdRows=[common('高率三套','A',3,3,30),common('四套边界','B',4,4,40),common('五套达标','C',5,10,5),common('六套达标','D',6,20,6)];
const thresholdSource=JSON.stringify(thresholdRows),eligible=B.rank(thresholdRows,5,'group');
assert.deepEqual(Array.from(eligible,r=>r.store),['五套达标','六套达标']);
assert.equal(eligible.length,2,'fewer than five qualifying groups are not filled by lower-volume teams');
assert.equal(JSON.stringify(thresholdRows),thresholdSource,'ranking never mutates imported metrics');
assert.equal(B.rank(thresholdRows,1,'store')[0].store,'四套边界','store benchmarks retain their original coverage criteria');
assert.equal(B.rank(thresholdRows,1,'advisor')[0].store,'六套达标','personal benchmarks retain volume criteria');
assert.equal(B.rank(thresholdRows.map(r=>({...r,level:'group'})),5).length,2,'group rows infer the same eligibility when level is omitted');
const groupCutoff=B.rank([10,9,8,7,5,5].map((n,i)=>common('达标店组'+i,'A',n,100,n)),5,'group');
assert.equal(groupCutoff.length,6);assert.deepEqual(Array.from(groupCutoff,r=>r.rank),[1,2,3,4,5,5],'the qualifying fifth-place tie is retained');

const housing=[],meetings=[];let serial=0;
function add(entry,group,stock,met,person){for(let i=0;i<stock;i++){const houseId='rate-test-'+serial++;housing.push({房源编号:houseId,大区:entry.region,门店:entry.store,店组:entry.store+group+'组',维护人姓名:person,细分在售户数:1,本月是否面见:i<met?1:0,门店top户数:0,户型top户数:0});if(i<met)meetings.push({房源编号:houseId,面见id:houseId,面见时间:'2026-11-15 10:00',面见反馈:'确认最新价格',面见人姓名:'测试面见人'});}}
add(catalog[0],'A',80,8,'数量标杆');add(catalog[0],'B',20,2,'大盘伙伴');add(catalog[1],'A',10,5,'覆盖伙伴甲');add(catalog[1],'B',6,2,'覆盖伙伴乙');
for(const [i,entry] of catalog.entries())if(i>1)housing.push({房源编号:'coverage-'+i,大区:entry.region,门店:entry.store,店组:entry.store+'A组',维护人姓名:'未执行占位',细分在售户数:0,本月是否面见:0});
const board=B.build({month:'2026-11',businessData:{housing,meetings,items:[],imports:[{as_of:'2026-11-15',created_at:'rate-version'}]}});
assert.equal(board.sections[0].rows[0].store,catalog[1].store);assert.equal(board.sections[0].rows[0].stock,16);assert.equal(board.sections[0].rows[0].rate,7/16);assert.equal(board.sections[0].rows[0].met_rate,'43.75%');
assert.equal(board.sections[1].rows[0].group,catalog[1].store+'A组');assert.equal(board.sections[1].rows[0].rate,.5);assert.equal(board.sections[1].rows.length,2);assert.ok(board.sections[1].rows.every(r=>r.met>=5));
assert.equal(board.sections[2].rows[0].name,'数量标杆');assert.equal(board.sections[2].rows[0].met,8);
assert.equal((B.html(board).match(/<th scope="col">面见率<\/th>/g)||[]).length,3,'all tiers keep independent coverage columns');
const rendered=B.html(board);assert.ok(rendered.includes('43.75%'));assert.ok(rendered.includes('50.00%'));assert.ok(board.notes[0].includes('面见率'));assert.ok(board.notes.some(line=>line.includes('至少5套')));assert.match(rendered,/月度面见至少5套/);
for(const row of board.rows)assert.ok(!row.feedbackText.includes('%'),'positive feedback stays count-only');
const blob=await B.image(board);assert.equal(blob.type,'image/png');assert.ok(draw.some(t=>t.value==='43.75%'&&t.size>=40),'rate is prominent in company poster');assert.ok(draw.some(t=>t.value==='8套'&&t.size>=40),'personal count stays readable in its own metric');
for(const label of ['面见次数','面见套数','面见率'])assert.ok(draw.some(t=>t.value===label),label+' has an independent horizontal metric');assert.ok(canvases.at(-1).height<3100);assert.ok(draw.some(t=>t.value===board.slogans[0]));
console.log('PASS group floor5 and organizational benchmark rates: exact coverage primary, count/time secondary, true cutoff ties, zero-stock exclusion, individual volume preserved, full-source aggregation, count-only feedback and compact rate presentation.');
