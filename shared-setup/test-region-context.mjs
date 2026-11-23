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
assert.equal(report.weekly.met,36);assert.equal(report.weekly.count,43);assert.equal(report.weekly.previousMet,22);
assert.equal(report.weekly.stores.reduce((n,[,before,after])=>n+after-before,0),28);
assert.match(report.observations.join(''),/较前一周22套增加14套（63.64%）/);
for(const [name,before,after] of [['陆家嘴滨江店A组',0,5],['陆家嘴旗舰店A组',1,5],['陆家嘴金融中心店A组',0,4],['顶级豪宅部B组',0,3]])assert.ok(report.observations.join('').includes(name+'单周'+before+'→'+after+'套'));
for(const token of ['房源供应链','每日外显','日、周复盘'])assert.ok(report.observations.join('').includes(token));
for(const token of ['滨江古北大区店总陪同门店TOP 0/9套（0.00%）','黄浦大区店总陪同门店TOP 0/12套（0.00%）','徐汇大区店总陪同门店TOP 1/6套（16.67%）','系统TOP标签是否准确','伙伴是否漏录或错录','亲自陪同面见','本周二（11月24日）','每天看目标、看进度、看差距'])assert.ok(report.reminder.join('').includes(token),token);
assert.match(report.reminder.join(''),/陆家嘴大区56套、黄浦大区42套/);
assert.equal(JSON.stringify(rows),original);
// Weekly facts cannot leak into a different import date, changed cohort, or partial regional slice.
for(const [cohort,day] of [[rows,'2026-11-15'],[rows,'2026-11-23'],[rows.slice(0,4),'2026-11-22'],[rows.map((r,i)=>i?{...r}:{...r,met:37}),'2026-11-22']]){
 const other=U.reviewRegionAnalysis(cohort,day);assert.equal(other.weekly,null);assert.doesNotMatch(other.observations.join(''),/上周提升：11月16—22日/);
}
const uncertain=rows.map(r=>r.region==='徐汇大区'?{...r,store_top_head_met_pending:1}:r);
assert.doesNotMatch(U.reviewRegionAnalysis(uncertain,'2026-11-22').reminder.join(''),/徐汇大区店总陪同门店TOP/);
const html=x.testRegion.reviewRegionAnalysisHtml(rows,'2026-11-22');
const text=x.testRegion.reviewRegionAnalysisText(rows,'2026-11-22');
for(const output of [html,text]){
 for(const token of ['目标覆盖率','全司贡献','40.54%','36.90%','陆家嘴滨江店A组单周0→5套','本周二（11月24日）','日复盘、日跟进'])assert.ok(output.includes(token),token);
 assert.doesNotMatch(output,/标杆大区|黑洞大区|主要补差承接|区内分布|面见率最高组织|面见率最低组织/);
}
assert.match(html,/五大区多维对照/);assert.match(html,/结果观察/);assert.match(html,/重点跟进/);

const unknown=rows.map(row=>({...row,_target:null,store_top_head_met_pending:1}));
const incomplete=U.reviewRegionAnalysis(unknown,'not-a-date');
assert.equal(incomplete.totalGap,null);assert.equal(incomplete.pace,null);
assert.match(incomplete.reminder.join(''),/目标尚未完整/);
assert.doesNotMatch(incomplete.reminder.join(''),/大区店总陪同门店TOP/,'unresolved companionship fields are not known zero');
assert.ok(!x.testRegion.reviewRegionAnalysisHtml(unknown).includes('NaN'));
assert.equal(U.reviewRegionAnalysis([{stock:0,met:0}]),null);
const untrusted=[{...rows[0],region:'<script>alert(1)</script>'}];
assert.ok(x.testRegion.reviewRegionAnalysisHtml(untrusted).includes('&lt;script&gt;'));
assert.ok(!x.testRegion.reviewRegionAnalysisHtml(untrusted).includes('<script>'));
console.log('PASS regional review: dated weekly store/group improvements, verified management methods, three-region TOP follow-up, stale-source guards, shared page/text output, unknown companionship and escaped prose.');
