/* Organization reviews and daily announcements share rate-first rankings and global group evidence. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const company={scope:'company',name:'全司'},member={role:'project'},document={addEventListener(){},getElementById(){return null;},querySelectorAll(){return [];}};
const x={window:null,document,console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:'2026-11',currentMode:'review',currentView:company,WBCloud:{member,project:true},ARCHIVE:{months:{}},DATA:{meta:{}},viewKey:view=>view.scope+':'+view.name};
x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core','quality-feed','quality-rules','quality','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const U=x.WBOperations,M=x.WBModel,catalog=M.storeCatalog.filter(store=>store.ownerApplicable!==false),plain=value=>JSON.parse(JSON.stringify(value));
const metric=(store,met,stock,met_count=met,extra={})=>({_level:'store',store,region:'测试大区',met,stock,met_count,met_rate:M.pct(met,stock),_target:100,store_top_rate:'0.00%',unit_top_rate:'0.00%',...extra});

// A larger numerator cannot outrank better inventory coverage; small stores cannot be warned for size alone.
const regions=[metric('/',41,543,54,{_level:'region',region:'陆家嘴大区'}),metric('/',12,75,19,{_level:'region',region:'滨江古北大区'}),metric('/',24,306,29,{_level:'region',region:'黄浦大区'})];
const analysis=U.reviewRegionAnalysis(regions);
assert.match(analysis.benchmark.join(''),/滨江古北大区/);assert.doesNotMatch(analysis.benchmark.join(''),/陆家嘴大区/);
assert.match(analysis.reminder.join(''),/陆家嘴大区/);assert.doesNotMatch(analysis.reminder.join(''),/黄浦大区/);
const stores=[metric('仁恒河滨城店',2,73),metric('长宁古北店',3,23),metric('新天地二店',3,70),metric('御翠园店',13,59),metric('顶级豪宅部',12,87),metric('星河湾店',12,137),metric('浦东别墅旗舰店',10,76)];
const ranks=U.reviewRankSets({view:company,progress:{rows:stores}});
assert.deepEqual(plain(ranks.bench.map(row=>row.store)),['御翠园店','顶级豪宅部','浦东别墅旗舰店']);
assert.deepEqual(plain(ranks.remind.map(row=>row.store)),['仁恒河滨城店','新天地二店','星河湾店']);
assert.ok(!ranks.remind.some(row=>row.store==='长宁古北店'));
const regional=U.reviewRankSets({view:{scope:'region'},progress:{rows:stores}});
assert.deepEqual(plain(regional.bench.map(row=>row.store)),['御翠园店']);assert.deepEqual(plain(regional.remind.map(row=>row.store)),['仁恒河滨城店']);

// Exact, unrounded rates win; counts and repeat visits break rate ties, numeric ties are kept at a cutoff.
let rows=[metric('甲',1,30001),metric('乙',1,30000),metric('丙',2,60000,3),metric('丁',2,60000,3),metric('停用',99,0)];
const before=JSON.stringify(rows),top=U.reviewOrganizationRank(rows,1,true,true);
assert.deepEqual(plain(top.map(row=>row.store)),['丙','丁']);assert.equal(JSON.stringify(rows),before);
assert.equal(U.reviewOrganizationRank(rows,1,false)[0].store,'甲');assert.equal(U.reviewMonthlyRate(rows.at(-1)),null);
const daily=U.novemberRankedSelection(stores,'store');
assert.equal(daily.best[0].store,'御翠园店');assert.equal(daily.low[0].store,'仁恒河滨城店');
const tied=U.novemberRankedSelection([metric('甲',1,10,2),metric('乙',1,10,2),metric('丙',0,10)],'store');
assert.deepEqual(plain(tied.best.map(row=>row.store)),['甲','乙']);assert.equal(tied.low[0].store,'丙');

// Complete company inventory is the source of TOP5 even when the user is looking at one region or store.
const housing=[],meetings=[];
function add(store,group,count,met,active=1){
 const entry=catalog.find(row=>row.store===store);assert.ok(entry,store);
 for(let i=0;i<count;i++){const id='h'+housing.length;housing.push({'房源编号':id,'大区':entry.region,'门店':store,'店组':group,'维护人姓名':'测试伙伴','细分在售户数':active,'本月是否面见':i<met?1:0});if(i<met)meetings.push({'房源编号':id,'面见id':'m'+id,'面见时间':'2026-11-15 10:00','面见反馈':'已反馈最新价格'});}
}
add('仁恒河滨城店','仁恒河滨城店A组',2,0);add('仁恒河滨城店','仁恒河滨城店B组',2,1);add('仁恒河滨城店','仁恒河滨城店D组',1,0);add('仁恒河滨城店','仁恒河滨城店E组',3,2);
add('仁恒河滨城店','仁恒河滨城店A组',25,0,0);
add('碧云店','碧云店A组',1,1);add('碧云店','碧云店B组',3,2);
add('御翠园店','御翠园店A组',4,3);add('浦东别墅旗舰店','浦东别墅旗舰店A组',5,4);add('星河湾店','星河湾店A组',6,5);
for(const row of catalog.filter(row=>!housing.some(home=>home['门店']===row.store)))add(row.store,row.store+'A组',2,0);
// Unknown group labels never become named management warnings or global benchmarks.
add('长宁古北店','未分组',2,0);
const d={reader:member,housing,meetings,items:[],imports:[{as_of:'2026-11-15',created_at:'version-1'}]};
U.state.cache['2026-11']=d;
const ctx=view=>({view,d,s:{region:view.region||'',store:view.scope==='store'?view.store:''},progress:M.table(housing,{region:view.region||'',store:view.scope==='store'?view.store:''},{},'2026-11',meetings,{showCustomer:false}),quality:{groups:[]}});
const original=JSON.stringify(d),global=U.reviewGroupSets(ctx(company));
assert.equal(global.benchmarkReady,true);assert.equal(global.benchmark.length,6,'fifth place numerical tie is preserved');
assert.deepEqual(plain(global.benchmark.map(row=>row.group)),['碧云店A组','星河湾店A组','浦东别墅旗舰店A组','御翠园店A组','仁恒河滨城店E组','碧云店B组']);
const store={scope:'store',name:'仁恒河滨城店',store:'仁恒河滨城店',region:'花木大区'},region={scope:'region',name:'花木大区',region:'花木大区'};
for(const view of [region,store])assert.deepEqual(plain(U.reviewGroupSets(ctx(view)).benchmark),plain(global.benchmark));
const local=U.reviewGroupSets(ctx(store));
assert.deepEqual(plain(local.slow.map(row=>row.group)),['仁恒河滨城店A组']);
assert.equal(local.slow[0].stock,2);assert.equal(local.slow[0].storeStock,8);assert.equal(local.slow[0].stockShare,.25);
const text=U.reviewGroupAnalysisText(ctx(store));
assert.match(text,/仁恒河滨城店A组｜经理卢海威：面见0\/2套，面见率0.00%；在售占本店25.00%（2\/8套）/);
assert.ok(global.slow.every(row=>row.group!=='未分组'));assert.equal(JSON.stringify(d),original,'review reads do not mutate business source records');

// A saved complete companyProgress can back a scoped source; incomplete data must not claim global TOP5.
const scoped={...d,housing:housing.filter(home=>home['门店']===store.store),companyProgress:d};
assert.equal(U.reviewGroupSets({...ctx(store),d:scoped}).benchmark.length,6);
const incomplete={...d,housing:housing.filter(home=>home['门店']!==catalog.at(-1).store)};
const missing=U.reviewGroupSets({...ctx(store),d:incomplete});assert.equal(missing.benchmarkReady,false);assert.equal(missing.benchmark.length,0);
assert.match(U.reviewGroupAnalysisText({...ctx(store),d:incomplete}),/全司18家门店数据未完整/);

// The report appends a real data table with managers and inventory-share evidence below the store cards.
const reportCtx=ctx(company);reportCtx.root=reportCtx.progress.rows.find(row=>row._level==='company');
const rendered=U.reviewHighlightsHtml(reportCtx);
assert.match(rendered,/标杆店组｜全司店组排名TOP5/);assert.match(rendered,/进展偏慢店组/);assert.match(rendered,/<th>经理<\/th>/);assert.match(rendered,/25.00%（2\/8套）/);
assert.ok(rendered.indexOf('进展偏慢门店')<rendered.indexOf('店组表现分析'));
assert.doesNotMatch(rendered,/每周重点预警本月进展倒数3家|先按本月面见量从低到高排序/);

// Benchmark prose reuses only saved records from the existing authorized review API.
member.login_id='0921';let period={periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15'};
const saved=(store,fields,status='draft')=>{const region=catalog.find(row=>row.store===store).region;return {month:'2026-11',kind:'review',region,store,key:'2026-11|review|'+store+'|store-period-review:weekly:2026-11-09:2026-11-15',payload:{recordType:'store-period-review',...period,status,fields}};};
const noteRows=[saved('仁恒河滨城店',{highlights:'店面有效做法哨兵',blockers:'<script>门店卡点</script>',nextActions:'核实邀约并准备服务资料'}),saved('星河湾店',{highlights:'跨大区门店已核实做法',nextActions:'跨大区门店本周安排'},'confirmed')];
const rs={actor:'0921',context:{month:'2026-11',privateData:d},cache:new Map(),drafts:new Map([['unsaved',{fields:{highlights:'未保存输入绝不展示'}}]])};
x.WBStoreReviews={state:rs,selectedPeriod:()=>period};
assert.equal(U.reviewSavedNotesText(ctx(store),local.slow[0]),'','unbound or prior-account caches cannot provide meeting prose');
const notesHost={innerHTML:''};document.getElementById=id=>id==='ops-review-highlights-content'?notesHost:null;
const timers=[];x.setTimeout=callback=>{timers.push(callback);return timers.length;};let calls=0;
x.WBCloud.storeReview=async()=>{calls++;return {items:noteRows,businessData:d};};
const reviewCloud=U.reviewCloudForHighlights(),loaded=await reviewCloud.storeReview('load',{month:'2026-11'});
rs.cache.set('2026-11',loaded);while(timers.length)timers.shift()();
assert.equal(calls,1,'the bridge reuses the review request rather than issuing an extra fetch');
assert.match(notesHost.innerHTML,/跨大区门店本周安排/,'the completed load refreshes only the existing benchmark content host');
const noteText=U.reviewSavedNotesText(ctx(store),local.slow[0]);
assert.match(noteText,/周会复盘与本周安排（2026-11-09—2026-11-15；已保存草稿，待BP确认）/);
assert.match(noteText,/有效做法：店面有效做法哨兵/);assert.match(noteText,/提升与卡点：<script>门店卡点<\/script>/);assert.match(noteText,/本周安排：核实邀约并准备服务资料/);
const withNotes=U.reviewHighlightsHtml(ctx(store));
assert.ok(withNotes.includes('&lt;script&gt;门店卡点&lt;/script&gt;'));assert.ok(!withNotes.includes('<script>'));
assert.match(withNotes,/所属门店星河湾店｜周会复盘与本周安排/);assert.match(withNotes,/门店本周安排：跨大区门店本周安排/);
assert.doesNotMatch(withNotes,/未保存输入绝不展示|星河湾店A组已完成/);
const savedBefore=JSON.stringify(loaded);U.reviewSavedNotesText(ctx(store),local.slow[0]);assert.equal(JSON.stringify(loaded),savedBefore);
period={periodType:'weekly',periodStart:'2026-11-16',periodEnd:'2026-11-22'};assert.equal(U.reviewSavedNotesText(ctx(store),local.slow[0]),'','no silent fallback to a different period');period={periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15'};
for(const flag of ['loading','error']){loaded[flag]=flag==='loading'?true:'load failed';assert.equal(U.reviewSavedNotesText(ctx(store),local.slow[0]),'');delete loaded[flag];}
loaded.items=noteRows.slice(0,1);assert.doesNotMatch(U.reviewHighlightsHtml(ctx(store)),/跨大区门店已核实做法|跨大区门店本周安排/,'global rate rankings do not grant access to other stores\' saved prose');loaded.items=noteRows;
for(const actor of [null,{...member}]){x.WBCloud.member=actor;assert.equal(U.reviewSavedNotesText(ctx(store),local.slow[0]),'','anonymous and newly selected accounts cannot read prior-account prose');}x.WBCloud.member=member;
rs.context.privateData={...d,reader:{...member}};assert.equal(U.reviewSavedNotesText(ctx(store),local.slow[0]),'');rs.context.privateData=d;
U.state.reviewNotesReaders.delete('2026-11');await reviewCloud.storeReview('load',{month:'2026-11'});x.WBCloud.member={...member};while(timers.length)timers.shift()();assert.equal(U.state.reviewNotesReaders.has('2026-11'),false,'an account switch before deferred refresh cannot bind old results');x.WBCloud.member=member;
console.log('PASS rate-first review: exact ratios, consistent daily first/last, stable numeric ties, company TOP3/bottom3 and regional first/last, global group TOP5, manager mapping, >=25% zero-met warnings, active inventory and source immutability.');
console.log('PASS saved meeting prose: signed API cache reuse, selected-period binding, saved draft/confirmed labels, remote global-group store context, no unsaved/group-specific claims, HTML escaping and account/source/loading guards.');
