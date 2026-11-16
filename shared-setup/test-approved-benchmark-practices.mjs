/* User-approved benchmark methods are public report content, separate from rate rankings. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const company={scope:'company',name:'全司'},document={addEventListener(){},getElementById(){return null;},querySelectorAll(){return [];}};
const x={window:null,document,console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:'2026-11',currentMode:'review',currentView:company,WBCloud:{member:null,project:false},ARCHIVE:{months:{}},DATA:{meta:{}},viewKey:view=>view.scope+':'+view.name};
x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core','quality-feed','quality-rules','quality','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const U=x.WBOperations,M=x.WBModel,plain=value=>JSON.parse(JSON.stringify(value));
for(const key of ['reviewPracticeEdition','reviewApprovedPractice','reviewHighlightSets'])assert.equal(typeof U[key],'function',key+' is available to shared report renderers');
const catalog=M.storeCatalog.filter(row=>row.ownerApplicable!==false),housing=[],meetings=[];
const sample={'御翠园店':[59,13],'融创滨江壹号院店':[52,9],'嘉御庭公馆店':[42,6],'复兴香园店':[83,10],'仁恒河滨城店':[73,2],'陆家嘴旗舰店':[122,5],'新天地二店':[70,3]};
for(const store of catalog){
 const [stock,met]=sample[store.store]||[100,6];
 for(let i=0;i<stock;i++){
  const id='approved-'+housing.length;
  housing.push({'房源编号':id,'大区':store.region,'门店':store.store,'店组':store.store+'A组','维护人姓名':'测试伙伴','细分在售户数':1,'本月是否面见':i<met?1:0});
  if(i<met)meetings.push({'房源编号':id,'面见id':'meeting-'+id,'面见时间':'2026-11-15 10:00','面见反馈':'已沟通最新价格'});
 }
}
const d={housing,meetings,items:[],imports:[{as_of:'2026-11-15',created_at:'approved-fixture-v1'}]};
U.state.cache['2026-11']=d;
const context=view=>U.reviewContext(view),expected=['御翠园店','融创滨江壹号院店','复兴香园店'];
const viewFor=store=>{const row=catalog.find(row=>row.store===store);return {scope:'store',name:store,store,region:row.region};};
const benchmarkPart=html=>{const end=html.indexOf('进展偏慢门店');return end<0?html:html.slice(0,end);};
const marker={
 '御翠园店':'目标与房商机咬合，带动面见动作落地',
 '融创滨江壹号院店':'把用心准备，转化为顾客感受到的服务',
 '复兴香园店':'店总主动带动，让面见形成店内氛围'
};
const approvedParagraphs={
 '复兴香园店':'亮点是店内面见氛围较浓、店总带动较好。值得借鉴的是管理者主动关注面见，把伙伴的服务行动和正反馈及时分享出来，让伙伴感受到这件事受到重视，也让主动服务业主的伙伴被看见、被认可。',
 '融创滨江壹号院店':'伙伴主动在上海联系果园，开车采摘应季水果，包装后作为伴手礼送给顾客，收获了顾客认可。这一做法的价值，在于将时令、新意和伙伴亲自准备的心意融入服务。其他门店可以借鉴提前联系、按需准备的方式，结合自身顾客特点选择礼品，让伴手礼成为自然连接和沟通的契机。'
};

// The original statistical ranking still puts Jia Yuting third; public method cards replace only presentation selection.
const ctx=context(company),raw=U.reviewRankSets(ctx),presented=U.reviewHighlightSets(ctx);
assert.deepEqual(plain(raw.bench.map(row=>row.store)),['御翠园店','融创滨江壹号院店','嘉御庭公馆店']);
assert.deepEqual(plain(presented.bench.map(row=>row.store)),expected);
assert.equal(presented.practiceEdition,true);
assert.deepEqual(plain(presented.remind),plain(raw.remind),'slow-progress selection remains rate-driven');
const original=JSON.stringify(d),html=U.reviewHighlightsHtml(ctx),part=benchmarkPart(html),copy=U.reviewText(company);
assert.match(part,/标杆门店[\s\S]*有效做法萃取/);
assert.equal((part.match(/class="review-rank-card benchmark"/g)||[]).length,3);
assert.doesNotMatch(part,/嘉御庭公馆店|月度全盘面见率TOP3/);
for(const store of expected){
 assert.ok(part.includes(store),store+' is visible without signing in');
 assert.ok(part.includes(marker[store]),store+' has an approved method title');
 assert.ok(copy.includes(marker[store]),store+' method is copied with the report');
 const row=ctx.progress.rows.find(row=>row._level==='store'&&row.store===store),practice=U.reviewApprovedPractice(ctx,row);
 assert.ok(practice,store+' resolves its own approved method');
 const sections=U.reviewReportSections(ctx,row,'benchmark',false),body=sections.flatMap(section=>section.paragraphs).join('\n');
 assert.ok(body.length>70,'a real method paragraph is present, rather than only metrics');
 if(approvedParagraphs[store]){assert.ok(part.includes(approvedParagraphs[store]));assert.ok(copy.includes(approvedParagraphs[store]));}
 if(store==='御翠园店'){for(const value of ['A组','大区总','经理','房商机','面见'])assert.ok(body.includes(value),'Yucui method retains '+value);}
 assert.doesNotMatch(body,/待BP确认|已保存草稿|本周安排|卡点分析/);
 const group={...row,_level:'group',group:store+'A组'};
 assert.deepEqual(plain(U.reviewReportSections(ctx,group,'benchmark',true)),[],'store methods are not attributed to unverified groups');
}
assert.equal(JSON.stringify(d),original,'reading approved report text leaves imported source untouched');

// Regional and single-store views cannot relabel another store's method as their own.
for(const [region,stores] of [['花木大区',['御翠园店']],['滨江古北大区',['融创滨江壹号院店']],['黄浦大区',['复兴香园店']],['徐汇大区',[]],['陆家嘴大区',[]]]){
 const scoped=context({scope:'region',name:region,region}),selection=U.reviewHighlightSets(scoped),regionalHtml=benchmarkPart(U.reviewHighlightsHtml(scoped));
 assert.deepEqual(plain(selection.bench.map(row=>row.store)),stores,region+' uses only matching approved methods');
 for(const store of expected){
  assert.equal(regionalHtml.includes(marker[store]),stores.includes(store),region+' does not borrow '+store+' method');
  assert.equal(U.reviewText(scoped.view).includes(marker[store]),stores.includes(store),region+' copy keeps the same method scope');
 }
}
for(const store of expected){
 const scoped=context(viewFor(store)),row=scoped.root,singleHtml=U.reviewHighlightsHtml(scoped);
 assert.equal(U.reviewSingleTone(scoped,row),'benchmark');
 assert.ok(singleHtml.includes(marker[store]));assert.ok(U.reviewText(scoped.view).includes(marker[store]),store+' method is present in single-store copied text');
 for(const other of expected.filter(name=>name!==store))assert.ok(!singleHtml.includes(marker[other]),store+' does not copy '+other+' method');
}
const jiaCtx=context(viewFor('嘉御庭公馆店'));
assert.equal(U.reviewSingleTone(jiaCtx,jiaCtx.root),'neutral');
assert.doesNotMatch(benchmarkPart(U.reviewHighlightsHtml(jiaCtx)),/class="review-rank-card benchmark"/);

// Stale or private BP drafts remain private even though the three expressly approved methods are public.
const staleMember={login_id:'prior-actor',display_name:'旧账号'},sentinel='PRIVATE_BP_DRAFT_NEVER_PUBLIC';
const period={periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15'};
const privateRows=catalog.map(store=>({month:'2026-11',kind:'review',region:store.region,store:store.store,payload:{recordType:'store-period-review',...period,fields:{highlights:sentinel,blockers:sentinel,nextActions:sentinel}}}));
x.WBStoreReviews={state:{actor:'prior-actor',context:{month:'2026-11',privateData:{...d,reader:staleMember}},cache:new Map([['2026-11',{items:privateRows}]]),drafts:new Map()},selectedPeriod:()=>period,text:()=>''};
U.state.reviewNotesReaders.set('2026-11',staleMember);
for(const view of [company,...expected.map(viewFor),viewFor('嘉御庭公馆店')]){
 const scoped=context(view),publicHtml=U.reviewHighlightsHtml(scoped),publicCopy=U.reviewText(view);
 assert.doesNotMatch(publicHtml,/PRIVATE_BP_DRAFT_NEVER_PUBLIC/);assert.doesNotMatch(publicCopy,/PRIVATE_BP_DRAFT_NEVER_PUBLIC/);
}
// A valid signed-in cache cannot replace approved publication text with a different draft.
x.WBCloud.member=staleMember;x.WBCloud.project=true;
for(const store of expected){
 const scoped=context(viewFor(store)),sections=U.reviewReportSections(scoped,scoped.root,'benchmark',false);
 assert.doesNotMatch(JSON.stringify(sections),/PRIVATE_BP_DRAFT_NEVER_PUBLIC/);assert.match(JSON.stringify(sections),new RegExp(marker[store]));
}
x.WBCloud.member=null;x.WBCloud.project=false;

// Publication content is a November edition, not a template silently reused in later or historical months.
for(const month of ['2026-10','2026-12']){
 x.currentMonth=month;U.state.cache[month]={...d,imports:[{as_of:month+'-15',created_at:month+'-fixture'}]};
 const other=context(company);
 assert.ok(!U.reviewPracticeEdition(other));
 assert.deepEqual(plain(U.reviewHighlightSets(other).bench),plain(U.reviewRankSets(other).bench));
 for(const store of expected){
  const row=other.progress.rows.find(row=>row._level==='store'&&row.store===store);
  assert.equal(U.reviewApprovedPractice(other,row),null);
  assert.ok(!U.reviewHighlightsHtml(other).includes(marker[store]));
 }
}
x.currentMonth='2026-11';
console.log('PASS approved benchmark practices: three public method cards, Jia Yuting replaced only in presentation, truthful rate ranking, complete copied prose, region/store isolation, unchanged slow-progress selection, private-cache isolation, November-only edition and source immutability.');
