import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const notices=[],elements=new Map(),buttons=[{disabled:false,isConnected:true},{disabled:false,isConnected:true}],writes=[];
const document={addEventListener(){},getElementById(id){return elements.get(id)||null;},querySelectorAll(){return buttons;},createElement(tag){return {tagName:tag,innerHTML:'',open:false,showModal(){this.open=true;}};},body:{append(el){elements.set(el.id,el);}}};
const member={role:'project'},store={scope:'store',name:'御翠园店',store:'御翠园店',region:'花木大区'};
const x={window:null,document,console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:'2026-11',currentMode:'daily',currentView:store,isSecureContext:true,navigator:{clipboard:{async write(items){writes.push(items);}}},ClipboardItem:class{constructor(value){this.value=value;}},notify:v=>notices.push(v),viewKey:v=>v.scope+':'+v.name,WBCloud:{member},ARCHIVE:{months:{}},DATA:{meta:{}}};
x.window=x;vm.createContext(x);
for(const name of ['core','quality-feed','quality-rules','quality','met-house-feedback','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const U=x.WBOperations;
const housing=[{房源编号:'h1',大区:store.region,门店:store.store,店组:store.store+'A组',维护人姓名:'维护人甲',分盘:'楼盘甲',房间号:'101',细分在售户数:1,本月是否面见:1,门店top户数:1,户型top户数:1}];
function install(){x.WBCloud.member=member;x.currentView=store;x.currentMonth='2026-11';x.currentMode='daily';U.state.loading=false;U.state.cache['2026-11']={reader:member,housing,meetings:[{房源编号:'h1',面见id:'m1',面见时间:'2026-11-12 10:30',面见人姓名:'面见人乙',面见反馈:'本次原文哨兵降50万，后续计划再谈委托'}],items:[],imports:[{as_of:'2026-11-15',created_at:'version-1'}]};writes.length=0;notices.length=0;}
install();let html=U.metHouseTable(store);
assert.match(html,/面见时间/);assert.match(html,/面见的正反馈/);assert.match(html,/降50万/);assert.match(html,/🌟/);assert.match(html,/门店TOP/);assert.match(html,/复制完整图片/);assert.match(html,/预览图片/);
assert.equal((html.match(/<table\b/g)||[]).length,2,'one merged detail table plus the collapsed classification standard table');
assert.ok(!html.includes('quality-story'),'daily detail is not duplicated as a feedback card');
const blob=new Blob(['one complete image'],{type:'image/png'});let observed;
x.WBMetHouseFeedback.image=async table=>{observed=table;return blob;};
await U.metHouseImage();assert.equal(observed.rows.length,1);assert.equal(writes.length,1);assert.equal(writes[0].length,1);assert.equal(writes[0][0].value['image/png'],blob);assert.equal(U.state.metHouseImageBusy,false);assert.ok(buttons.every(b=>!b.disabled));
await U.metHouseImage(true);html=elements.get('ops-dialog').innerHTML;assert.equal((html.match(/<img\b/g)||[]).length,1);assert.equal((html.match(/download=/g)||[]).length,1);assert.match(html,/下载整张图片/);assert.ok(!html.includes('第1张'));
await U.copyMetHousePreview();assert.equal(writes.at(-1).length,1);x.currentView={...store,name:'碧云店',store:'碧云店'};await assert.rejects(U.copyMetHousePreview(),/来源已变化/);
install();let resolve;x.WBMetHouseFeedback.image=()=>new Promise(r=>resolve=r);const pending=U.metHouseImage();assert.equal(U.state.metHouseImageBusy,true);await assert.rejects(U.metHouseImage(),/正在生成/);x.currentView={...store,name:'碧云店',store:'碧云店'};resolve(blob);await assert.rejects(pending,/查看范围或底表已变化/);assert.equal(writes.length,0);assert.equal(U.state.metHouseImageBusy,false);
install();x.WBCloud.member=null;html=U.metHouseTable(store);assert.ok(!html.includes('本次原文哨兵'));assert.ok(!html.includes('楼盘甲'));await assert.rejects(U.metHouseImage(),/登录/);
install();U.state.cache['2026-11'].reader={role:'project'};assert.match(U.metHouseTable(store),/刷新共享数据/);await assert.rejects(U.metHouseImage(),/刷新/);
const ui=fs.readFileSync(new URL('../operations/ui.js',import.meta.url),'utf8');
assert.ok(!ui.includes("block('daily-quality'"),'daily quality shares the merged module');assert.ok(!ui.includes("['daily-quality','面见质量']"),'no duplicate daily navigation');assert.ok(ui.includes("qualityPanel(view)"),'review quality panel remains');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(index.indexOf('operations/met-house-feedback.js')<index.indexOf('operations/ui.js'));
console.log('PASS merged daily UI: single detail table, raw feedback and TOP star, one PNG clipboard item, single preview/download, scope abort, guest/stale-reader protection and no duplicate daily module.');
