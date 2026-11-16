/* Simplification removes duplicate surfaces, while publication, evidence and finance remain usable. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const month='2026-11',company={scope:'company',name:'全司'},elements=new Map(),mounts=[];
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,setAttribute(){}});return elements.get(id);}
const document={getElementById:element,querySelector:element,querySelectorAll(){return [];},addEventListener(){},createElement(tag){return {tagName:tag,innerHTML:'',showModal(){},close(){}};},body:{append(){}}};
const storage=new Map(),member={role:'project',display_name:'项目负责人'};
const x={window:null,document,console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:month,currentMode:'daily',currentView:company,
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 WBCloud:{configured:false,member},WBVoice:{reset(){},field:()=>''},WBProofs:{field:()=>'<input data-proof-field>'},
 WBStoreReviews:{mount:ctx=>mounts.push(['stores',ctx])},WBCompanyWeekPlan:{mount:ctx=>mounts.push(['company',ctx])},
 DATA:{meta:{},regions:[],views:{}},ARCHIVE:{months:{}},isHistoryArchiveMonth:()=>false,
 renderTable:block=>`<table data-progress="${block.variant}" aria-label="${block.title}"><tr><td>进展表哨兵</td></tr></table>`,
 notify(){},monthLabel:()=> '11月',viewKey:view=>view.scope+':'+view.name,viewFromUrl:()=>company,updateUrl(){},
 resolveView:(region,store)=>store?{scope:'store',name:store,region,store}:region?{scope:'region',name:region,region}:company};
Object.defineProperty(x.WBCloud,'project',{get:()=>x.WBCloud.member?.role==='project'});
x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core','quality-feed','quality-rules','quality','workflow','scene','send-package','met-house-feedback','benchmark-board','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const U=x.WBOperations,M=x.WBModel,catalog=M.storeCatalog.filter(store=>store.ownerApplicable!==false),first=catalog[0];
const store={scope:'store',name:first.store,store:first.store,region:first.region},region={scope:'region',name:first.region,region:first.region};
const housing=catalog.map((entry,index)=>({'房源编号':'h'+index,'大区':entry.region,'门店':entry.store,'店组':entry.store+'A组','维护人姓名':'测试伙伴'+index,'分盘':'测试楼盘'+index,'房间号':'10'+index,'细分在售户数':1,'本月是否面见':1,'本月是否送礼物':1,'门店top户数':1,'户型top户数':1}));
const meetings=catalog.map((entry,index)=>({'房源编号':'h'+index,'面见id':'m'+index,'面见时间':'2026-11-12 10:30','面见人姓名':'实际面见人'+index,'面见反馈':'反馈原文保留哨兵，降50万'}));
const scene={key:month+'|scene|'+store.store+'|daily',kind:'scene',region:store.region,store:store.store,payload:{text:'既有推动原文哨兵：经理确认邀约卡点',analysisText:'既有整理结果哨兵',tasks:[{id:'saved-embedded',action:'既有内嵌动作哨兵',title:'既有内嵌动作哨兵',owner:'责任人甲',due:'2026-11-20',status:'planned',result:'既有执行结果哨兵'}]}};
const task={key:month+'|task|'+store.store+'|saved-task',kind:'task',region:store.region,store:store.store,payload:{title:'既有独立事项哨兵',action:'既有独立动作哨兵',owner:'责任人乙',due:'2026-11-21',status:'doing',result:'既有独立结果哨兵'}};
function install({actor=member,view=company,mode='daily',saved=true}={}){
 x.WBCloud.member=actor;x.currentView=view;x.currentMode=mode;x.currentMonth=month;U.state.loading=false;U.state.error='';elements.clear();mounts.length=0;
 const items=[{key:month+'|goals|@@company|monthly',kind:'goals',payload:Object.fromEntries(catalog.map(entry=>[entry.store,2]))},...(saved?[structuredClone(scene),structuredClone(task)]:[])];
 const data={reader:actor,housing,meetings,items,periods:[],snapshots:[],directory:[],imports:[{as_of:'2026-11-15',created_at:'version-1'}]};
 data.companyProgress={housing,meetings,items:items.filter(item=>item.kind==='goals'),imports:data.imports};U.state.cache[month]=data;
 const before=JSON.stringify(data);U.render(view);return {data,before,html:element('report').innerHTML,nav:element('nav').innerHTML};
}
function section(html,id){const start=html.indexOf('id="'+id+'"');assert.ok(start>=0,'missing section '+id);return html.slice(start,html.indexOf('</section>',start)+10);}
function closedDetailsContaining(html,className){const match=html.match(new RegExp('<details\\b([^>]*class="[^"]*'+className+'[^\"]*"[^>]*)>'));assert.ok(match,'missing details '+className);assert.doesNotMatch(match[1],/\bopen(?:\s|=|$)/,'details starts closed: '+className);return html.slice(match.index,html.indexOf('</details>',match.index)+10);}

// A single company board replaces the older local interview shortlist in every daily scope.
for(const view of [company,region,store]){
 const {data,html,nav,before}=install({view});
 assert.match(html,/id="daily-benchmark"/);assert.match(html,/全司面见标杆榜/);
 assert.doesNotMatch(html,/interview-shortlist|查看当前范围的标杆采访候选|<h3>店面TOP3<\/h3>|<h3>店组TOP5<\/h3>|<h3>个人TOP5<\/h3>/);
 assert.doesNotMatch(nav,/daily-actions/);assert.match(nav,/daily-package/);
 const message=section(html,'daily-message');assert.match(message,/id="ops-message"/);assert.match(message,/data-ops="copy-message"/);
 assert.doesNotMatch(message,/<h3>优先推动<\/h3>|<h3>进展与鼓励<\/h3>/,'no duplicated praise/priority cards above the announcement');
 assert.doesNotMatch(html,/id="ops-scene"|id="ops-task-form"|data-ops="(?:voice|generate-message|save-scene|new-task|edit-task)"/,'parked edit controls do not remain in the daily surface');
 const packages=section(html,'daily-package');assert.match(packages,/data-ops="all-publication-package"/);assert.match(packages,/全司＋5大区＋18门店/);
 assert.equal((packages.match(/name="(?:companyGroupName|regionGroup_\d+|storeGroup_\d+)"/g)||[]).length,24,'project owner can still configure all recipients');
 assert.ok(html.indexOf('id="daily-message"')<html.indexOf('id="daily-package"'),'publication download follows the announcement');
 assert.ok(packages.indexOf('data-ops="all-publication-package"')<packages.indexOf('name="companyGroupName"'),'download precedes recipient details');
 assert.equal(JSON.stringify(data),before,'rendering never removes or rewrites saved business records');
}

// Existing records remain readable behind a closed disclosure; no empty record panel is added.
let result=install({view:store});
const parked=closedDetailsContaining(result.html,'ops-parked-records');assert.match(parked,/查看已有推动记录/);assert.match(parked,/既有推动原文哨兵/);assert.match(result.html,/既有独立事项哨兵|既有独立动作哨兵/);
assert.equal(result.data.items.find(item=>item.key===scene.key).payload.text,scene.payload.text);
result=install({view:store,saved:false});assert.doesNotMatch(result.html,/ops-parked-records/);
result=install({view:store});result.data.reader={role:'project'};U.render(store);
assert.doesNotMatch(element('report').innerHTML,/ops-parked-records|既有推动原文哨兵|既有独立事项哨兵/,'a stale reader cannot expose saved private records');

// Project, regional and store download permissions stay distinct after moving the panel.
for(const actor of [{role:'region',region:store.region},{role:'store',region:store.region,store:store.store}]){
 const view=actor.role==='region'?region:store,{html}=install({actor,view});
 assert.match(section(html,'daily-package'),/data-ops="send-package"/);assert.doesNotMatch(html,/data-ops="all-publication-package"|name="companyGroupName"/);
}
result=install({actor:null,saved:false});assert.doesNotMatch(result.html,/data-ops="(?:all-publication-package|send-package)"|name="companyGroupName"/);assert.doesNotMatch(result.html,/既有推动原文哨兵/);

// A store review keeps evidence available, but starts with the useful summary and BP review.
result=install({view:store,mode:'review'});
const feedback=closedDetailsContaining(result.html,'review-feedback-source');assert.match(feedback,/查看逐房面见反馈原文/);assert.match(feedback,/反馈原文保留哨兵/);
assert.match(result.html,/业务经营主题/);assert.match(result.html,/id="review-regional"/);assert.match(result.html,/id="review-company-week-plan"/);assert.deepEqual(mounts.map(item=>item[0]),['stores','company']);

// The user's explicit exception: current-month finance remains fully accessible.
result=install({view:store,mode:'expense'});
for(const id of ['expense-todo','expense-head','expense-records','expense-settlement','expense-cash']){assert.match(result.html,new RegExp('id="'+id+'"'));assert.match(result.nav,new RegExp('#'+id));}
for(const id of ['ops-ledger-head','ops-rules-form','ops-cash-form'])assert.match(result.html,new RegExp('id="'+id+'"'));
for(const label of ['门店BP核账待办','账本与当月规则','费用分摊与收付款','实际收付款登记','保存本店当月规则','保存实际收付款'])assert.ok(result.html.includes(label),'finance remains unchanged: '+label);
assert.match(result.html,/data-ops="add-expense"/);assert.match(result.html,/data-ops="copy-ledger"/);assert.match(result.html,/data-ops="ledger-image"/);

console.log('PASS workbench simplification: one benchmark board, concise announcement, independent 24-scope publication/configuration, parked read-only records, closed review evidence, original role boundaries and complete finance retained.');
