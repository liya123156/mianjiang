/* A regional observation is not an automatic award for a small denominator or a low target. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const x={window:null,document:{addEventListener(){},getElementById(){return null;},querySelectorAll(){return [];}},console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:'2026-11',currentMode:'review',currentView:{scope:'company',name:'全司'},WBCloud:{member:{role:'project'},project:true},ARCHIVE:{months:{}},DATA:{meta:{}},viewKey:view=>view.scope+':'+view.name};
x.window=x;vm.createContext(x);
for(const name of ['core','quality-feed','quality-rules','quality'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x);
const source=fs.readFileSync(new URL('../operations/ui.js',import.meta.url),'utf8');
vm.runInContext(source.replace('root.WBOperations={','root.testRegion={reviewRegionAnalysisHtml,reviewRegionAnalysisText};root.WBOperations={'),x);
const M=x.WBModel,U=x.WBOperations;
const facts=[['花木大区',225,63,36,10,32,8,33,4],['陆家嘴大区',524,125,69,15,41,12,64,6],['徐汇大区',189,54,24,6,21,8,30,1],['滨江古北大区',74,30,22,9,15,5,15,0],['黄浦大区',296,78,36,12,31,6,45,0]];
const rows=facts.map(([region,stock,target,met,st,ss,ut,us,head])=>({_level:'region',region,stock,_target:target,met,met_count:met,met_rate:M.pct(met,stock),store_top_rate:M.pct(st,ss),unit_top_rate:M.pct(ut,us),store_top_head_met_base:st,store_top_head_met_confirmed:head,store_top_head_met_pending:0}));
const original=JSON.stringify(rows);
const report=U.reviewRegionAnalysis(rows,'2026-11-22');
assert.equal(report.totalMet,187);assert.equal(report.totalGap,163);
assert.equal(report.regions.find(row=>row.region==='滨江古北大区').targetCoverage,'40.54%');
assert.equal(report.regions.find(row=>row.region==='黄浦大区').targetCoverage,'26.35%');
assert.equal(report.regions.find(row=>row.region==='陆家嘴大区').contribution,'36.90%');
assert.match(report.observations.join(''),/面见量贡献：陆家嘴大区 69套/);
assert.match(report.observations.join(''),/覆盖表现：滨江古北大区 22\/74套/);
assert.match(report.reminder.join(''),/合计98套，占全司剩余差距60.12%/);
assert.match(report.reminder.join(''),/自然月时间进度参考73.33%/);
assert.match(report.reminder.join(''),/先核对漏录、标签和真实陪同情况/);
assert.ok(!report.reminder.find(line=>line.startsWith('目标进度待追赶')).includes('滨江古北大区'),'being on pace must not become a behind-pace warning');
assert.equal(JSON.stringify(rows),original);
const localStores=[{_level:'store',region:'滨江古北大区',store:'融创滨江壹号院店',stock:53,met:18,_target:20},{_level:'store',region:'滨江古北大区',store:'长宁古北店',stock:21,met:4,_target:10}];
const differentiated=U.reviewRegionAnalysis(rows,'2026-11-22',localStores);
assert.match(differentiated.observations.join(''),/融创滨江壹号院店贡献18套，占本区81.82%/);
assert.match(differentiated.observations.join(''),/长宁古北店完成4\/10套（40.00%）/);
assert.ok(!U.reviewRegionAnalysis(rows,'2026-11-22',localStores.slice(0,1)).observations.some(line=>line.startsWith('区内分布')),'an incomplete store slice cannot explain regional concentration');


const html=x.testRegion.reviewRegionAnalysisHtml(rows,'2026-11-22');
const text=x.testRegion.reviewRegionAnalysisText(rows,'2026-11-22');
for(const output of [html,text]){
  for(const token of ['目标覆盖率','全司贡献','40.54%','36.90%','60.12%','具体可借鉴做法'])assert.ok(output.includes(token),token);
  assert.doesNotMatch(output,/标杆大区|黑洞大区|面见率最高组织|面见率最低组织/);
}
assert.match(html,/五大区多维对照/);assert.match(html,/结果观察/);assert.match(html,/重点跟进/);

const unknown=rows.map(row=>({...row,_target:null,store_top_head_met_pending:1}));
const incomplete=U.reviewRegionAnalysis(unknown,'not-a-date');
assert.equal(incomplete.totalGap,null);assert.equal(incomplete.pace,null);
assert.match(incomplete.reminder.join(''),/目标尚未完整/);
assert.doesNotMatch(incomplete.reminder.join(''),/陪同登记待核实/,'unresolved companionship fields are not known zero');
assert.ok(!x.testRegion.reviewRegionAnalysisHtml(unknown).includes('NaN'));
assert.equal(U.reviewRegionAnalysis([{stock:0,met:0}]),null);
const untrusted=[{...rows[0],region:'<script>alert(1)</script>'}];
assert.ok(x.testRegion.reviewRegionAnalysisHtml(untrusted).includes('&lt;script&gt;'));
assert.ok(!x.testRegion.reviewRegionAnalysisHtml(untrusted).includes('<script>'));
console.log('PASS regional context: fair target intensity, independent contribution and coverage, gap ownership, pace checks, verified-zero reminders, no automatic awards/black-hole labels, shared page/text semantics, missing-data guards and escaped prose.');
