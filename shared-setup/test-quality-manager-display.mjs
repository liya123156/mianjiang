/* Manager metadata is scoped by organization; meeting people and source feedback stay intact. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../operations/quality-feed.js',import.meta.url),'utf8');
const directory=fs.readFileSync(new URL('../operations/manager-directory.js',import.meta.url),'utf8');
function runtime(withDirectory=true){
 const canvases=[];
 const document={createElement(tag){
  assert.equal(tag,'canvas');
  const calls=[],context={font:'20px sans-serif',measureText(value){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||20);return {width:Array.from(String(value)).length*size};},fillText(value,...args){calls.push({value:String(value),args});},fillRect(){},strokeRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},createLinearGradient(){return {addColorStop(){}};}};
  const canvas={width:0,height:0,calls,getContext(){return context;},toBlob(done,type){done(new Blob([JSON.stringify({width:this.width,height:this.height})],{type}));}};
  canvases.push(canvas);return canvas;
 }};
 const x={window:null,document,Blob,console,WBQuality:{labels:{P:'获取价格信息／底价／交易条件'}}};x.window=x;vm.createContext(x);
 if(withDirectory)vm.runInContext(directory,x);
 vm.runInContext(source,x);return {x,F:x.WBFeedback,canvases};
}
const raw='降50万，已反馈客户。\n计划下周邀约，不等于已完成面见。';
function row(region,store,group,houseId){const feedbacks=[{'面见时间':'2026-11-12 09:00','面见人姓名':'顾问甲','面见反馈':raw},{'面见时间':'2026-11-13 10:00','面见人姓名':'顾问乙','面见反馈':'日常粘合，反馈客户'}];return {houseId,region,store,group,advisor:'维护顾问丙',project:'测试分盘',room:'101',category:'P',basis:'原文已明确价格变化',feedbacks,missing:false};}
const rows=[row('花木大区','御翠园店','御翠园店A组','h1'),row('徐汇大区','徐汇滨江店','徐汇滨江店C组','h2')];
const {x,F,canvases}=runtime();
const lookups=[],originalLookup=x.WBManagerDirectory.nameFor;x.WBManagerDirectory.nameFor=identity=>{lookups.push({...identity});return originalLookup(identity);};
for(const item of rows){
 const decorated=F.decorate(item);
 assert.deepEqual(Array.from(decorated.people),['顾问甲','顾问乙']);assert.equal(decorated.eventCount,2);assert.equal(decorated.category,'P');
 assert.match(F.meta(decorated),/经理：陈飞/);assert.match(F.meta(decorated),/本月已登记面见 2 次/);
 const card=F.card(decorated);assert.match(card,/经理：陈飞/);assert.match(card,/顾问甲/);assert.ok(card.includes(raw));
 assert.ok(!decorated.people.includes('陈飞'),'manager metadata does not change meeting-person attribution');
 const copied=F.text([item]);assert.match(copied,/经理：陈飞/);assert.ok(copied.includes(raw));assert.equal(item.feedbacks.length,2);
}
assert.ok(lookups.some(v=>v.region==='花木大区'&&v.store==='御翠园店'&&v.group==='御翠园店A组'));
assert.ok(lookups.some(v=>v.region==='徐汇大区'&&v.store==='徐汇滨江店'&&v.group==='徐汇滨江店C组'));
assert.match(F.meta(F.decorate({...rows[0],region:'徐汇大区'})),/经理：待补充/,'same group with wrong region is not matched by a person name');
assert.match(F.meta(F.decorate({...rows[0],group:'御翠园店Z组'})),/经理：待补充/);
assert.match(F.meta(F.decorate({...rows[0],group:''})),/经理：待补充/,'property feedback with a missing group cannot be mistaken for an aggregate');
const input={rows,summary:{total:2,feedback:2,missing:0},month:'2026-11',scope:'全司',range:'本页2套',topicCounts:F.counts(rows)};
const blobs=await F.images(input);assert.equal(blobs.length,1);assert.equal(blobs[0].type,'image/png');
const painted=canvases.at(-1).calls.map(c=>c.value).join('\n');assert.equal((painted.match(/经理：陈飞/g)||[]).length,2);assert.ok(painted.includes('面见人：顾问甲、顾问乙'));assert.ok(painted.includes('本月已登记面见 2 次'));assert.ok(painted.includes('降50万，已反馈客户。'));assert.ok(painted.includes('计划下周邀约，不等于已完成面见。'));assert.ok(painted.includes('业主面见 · 真实反馈'),'original title is preserved');
const absent=runtime(false),undecorated=absent.F.decorate(rows[0]);assert.match(absent.F.meta(undecorated),/经理：待补充/);assert.match(absent.F.card(undecorated),/经理：待补充/);assert.match(absent.F.text([rows[0]]),/经理：待补充/);const absentBlobs=await absent.F.images({...input,rows:[rows[0]]});assert.equal(absentBlobs.length,1);assert.ok(absent.canvases.at(-1).calls.some(c=>c.value.includes('经理：待补充')));
assert.deepEqual(JSON.parse(JSON.stringify(F.counts(rows))),JSON.parse(JSON.stringify(absent.F.counts(rows))),'manager metadata does not affect classification or counts');
console.log('PASS: organization-scoped managers in original feedback card/text/PNG, duplicate manager names, missing-directory fallback, unchanged meeting people, source text, classification and image title.');
