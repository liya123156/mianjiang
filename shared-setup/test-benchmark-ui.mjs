/* The company board stays global while its private source and export remain account/version bound. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const notices=[],elements=new Map(),writes=[];
const document={addEventListener(){},getElementById(id){return elements.get(id)||null;},querySelectorAll(){return [];},createElement(tag){return {tagName:tag,innerHTML:'',open:false,showModal(){this.open=true;}};},body:{append(element){elements.set(element.id,element);}}};
const company={scope:'company',name:'全司'},member={role:'project',login_id:'0921'};
const x={window:null,document,console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:'2026-11',currentMode:'daily',currentView:company,isSecureContext:true,navigator:{clipboard:{async write(items){writes.push(items);}}},ClipboardItem:class{constructor(value){this.value=value;}},notify:value=>notices.push(value),viewKey:view=>view.scope+':'+view.name,WBCloud:{member},ARCHIVE:{months:{}},DATA:{meta:{}}};
Object.defineProperty(x.WBCloud,'project',{get:()=>x.WBCloud.member?.role==='project'});
x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core','quality-feed','quality-rules','quality','benchmark-board','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const U=x.WBOperations,catalog=x.WBModel.storeCatalog.filter(store=>store.ownerApplicable!==false);
const region={scope:'region',name:catalog[0].region,region:catalog[0].region},store={scope:'store',name:catalog[0].store,store:catalog[0].store,region:catalog[0].region};
function install(){
 x.WBCloud.member=member;x.currentView=company;x.currentMonth='2026-11';x.currentMode='daily';U.state.loading=false;U.state.benchmarkBusy=false;delete U.state.benchmarkPreview;
 U.state.cache['2026-11']={reader:member,housing:catalog.map((entry,index)=>({'房源编号':'h'+index,'大区':entry.region,'门店':entry.store,'店组':entry.store+'A组','维护人姓名':'私有标杆伙伴'+index,'分盘':'私有分盘'+index,'房间号':'10'+index,'细分在售户数':1,'本月是否面见':1,'门店top户数':1,'户型top户数':1})),meetings:catalog.map((entry,index)=>({'房源编号':'h'+index,'面见id':'m'+index,'面见时间':'2026-11-12 10:30','面见人姓名':'实际面见人'+index,'面见反馈':'本次私有原文哨兵降50万'})),items:[],imports:[{as_of:'2026-11-15',created_at:'version-1'}]};
 writes.length=0;notices.length=0;elements.clear();return U.state.cache['2026-11'];
}
install();const board=U.companyBenchmarkData(),signature=JSON.stringify(board);
assert.equal(board.summary.stores,18);assert.equal(board.summary.met,18);assert.equal(board.title,'全司面见标杆榜');
for(const view of [region,store]){x.currentView=view;assert.equal(JSON.stringify(U.companyBenchmarkData()),signature,'region/store filters do not change the complete company board');}
let html=U.companyBenchmarkPanel();
assert.equal((html.match(/<table\b/g)||[]).length,3);assert.match(html,/<th scope="col">经理<\/th>/);assert.match(html,/<th scope="col">姓名<\/th>/);assert.ok(!html.includes('经理姓名'),'manager and maintainer have separate fields');assert.equal((html.match(/<th scope="col">面见后正反馈<\/th>/g)||[]).length,3);assert.equal((html.match(/<th scope="col">面见率<\/th>/g)||[]).length,2,'organizational coverage is visible');assert.ok(html.includes('100.00%'));for(const cell of html.matchAll(/<td class="cb-feedbackText">([\s\S]*?)<\/td>/g))assert.ok(!cell[1].includes('%'),'positive-feedback cells contain counts only');assert.ok(html.includes('私有标杆伙伴0'));assert.ok(html.includes('卢海威'),'directory manager is rendered separately');
for(const line of ['💥多面见 多沟通 多服务💥','🔥面见打造看得见信任 提供温度和专业服务🔥'])assert.ok(html.includes(line),'exact Unicode slogan is preserved');
assert.match(html,/复制全司标杆榜/);assert.match(html,/预览全司标杆榜/);

const blob=new Blob(['one complete company board'],{type:'image/png'});let imageInput;
x.WBCompanyBenchmark.image=async input=>{imageInput=input;return blob;};
await U.companyBenchmarkImage();assert.equal(JSON.stringify(imageInput),signature);assert.equal(writes.length,1);assert.equal(writes[0].length,1);assert.equal(writes[0][0].value['image/png'],blob);assert.equal(U.state.benchmarkBusy,false);
await U.companyBenchmarkImage(true);html=elements.get('ops-dialog').innerHTML;
assert.equal((html.match(/<img\b/g)||[]).length,1);assert.equal((html.match(/download=/g)||[]).length,1);assert.match(html,/下载整张榜单/);assert.ok(!html.includes('第1张'));
x.currentView={scope:'region',name:'徐汇大区',region:'徐汇大区'};await U.copyBenchmarkPreview();assert.equal(writes.at(-1).length,1);assert.equal(writes.at(-1)[0].value['image/png'],blob,'the global preview may be copied after a local filter changes');
U.state.cache['2026-11'].imports[0].created_at='changed-in-place';await assert.rejects(U.copyBenchmarkPreview(),/底表已变化/);

// Clipboard denial keeps one complete image available for preview and download.
install();x.WBCompanyBenchmark.image=async()=>blob;const clipboard=x.navigator.clipboard;x.navigator.clipboard={async write(){throw Error('denied');}};await U.companyBenchmarkImage();html=elements.get('ops-dialog').innerHTML;assert.equal((html.match(/<img\b/g)||[]).length,1);assert.equal((html.match(/download=/g)||[]).length,1);x.navigator.clipboard=clipboard;

// No stale/private export succeeds while an asynchronous image render is in flight.
for(const change of ['account','month','version-in-place','date-in-place','reader','source-object','data-object','mode','loading']){
 const data=install();let resolve;x.WBCompanyBenchmark.image=()=>new Promise(done=>resolve=done);const pending=U.companyBenchmarkImage();assert.equal(U.state.benchmarkBusy,true);await assert.rejects(U.companyBenchmarkImage(),/正在生成/);
 if(change==='account')x.WBCloud.member={role:'project',login_id:'1317'};
 if(change==='month')x.currentMonth='2026-12';
 if(change==='version-in-place')data.imports[0].created_at='version-2';
 if(change==='date-in-place')data.imports[0].as_of='2026-11-16';
 if(change==='reader')data.reader={...member};
 if(change==='source-object')data.imports[0]={...data.imports[0]};
 if(change==='data-object')U.state.cache['2026-11']={...data};
 if(change==='mode')x.currentMode='review';
 if(change==='loading')U.state.loading=true;
 resolve(blob);await assert.rejects(pending,/账号、月份或底表已变化/);assert.equal(writes.length,0,change+' aborts before clipboard');assert.equal(elements.has('ops-dialog'),false,change+' does not expose a stale preview');assert.equal(U.state.benchmarkBusy,false);
}

// A local view change during rendering is allowed because the board is company-wide.
install();let resolve;x.WBCompanyBenchmark.image=()=>new Promise(done=>resolve=done);const pending=U.companyBenchmarkImage();x.currentView=store;resolve(blob);await pending;assert.equal(writes.length,1);

for(const change of ['stale-reader','incomplete-source','loading']){
 const data=install();if(change==='stale-reader')data.reader={...member};if(change==='incomplete-source')data.housing=data.housing.filter(home=>home['门店']!==catalog.at(-1).store);if(change==='loading')U.state.loading=true;
 assert.throws(()=>U.companyBenchmarkData(),/刷新|18家门店完整底表/);html=U.companyBenchmarkPanel();assert.ok(!html.includes('<table'));assert.ok(!html.includes('私有标杆伙伴'));await assert.rejects(U.companyBenchmarkImage(),/刷新|18家门店完整底表/);assert.equal(writes.length,0);
}
for(const actor of [null,{role:'region',region:region.region},{role:'store',stores:[store.store]}]){
 install();x.WBCloud.member=actor;html=U.companyBenchmarkPanel();assert.ok(!html.includes('<table'));assert.ok(!html.includes('私有标杆伙伴'));assert.ok(!html.includes('私有分盘'));assert.ok(!html.includes('本次私有原文哨兵'));assert.ok(!html.includes('卢海威'));assert.match(html,/登录|项目负责人/);assert.throws(()=>U.companyBenchmarkData(),/登录|项目负责人/);await assert.rejects(U.companyBenchmarkImage(),/登录|项目负责人/);assert.equal(writes.length,0);
}

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),order=['manager-directory','core','quality-feed','quality-rules','quality','benchmark-board','ui'].map(name=>index.indexOf('src="operations/'+name+'.js'));
assert.ok(order.every(position=>position>=0));assert.ok(order.every((position,i)=>i===0||position>order[i-1]),'directory/core/quality/board modules load in dependency order before UI');assert.ok(index.includes('operations/benchmark-board.css'));
console.log('PASS company benchmark UI: signed complete global source, stable local filters, separate managers, exact slogans/count-only outcomes, one PNG clipboard/preview, async account/month/reader/import isolation and no private company board for other roles.');
