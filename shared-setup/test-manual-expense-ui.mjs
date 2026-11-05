import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

// Fixture-only integration: no network, real records or cloud writes.
const root=new URL('../',import.meta.url).pathname;
const dialog={innerHTML:'',open:false,showModal(){this.open=true;},close(){this.open=false;}};
const notifications=[],saves=[],uploads=[];let pendingSave=null;
const x={console,Intl,URL,Date,Set,Map,crypto:webcrypto,Uint8Array,
 document:{addEventListener(){},getElementById(id){return id==='ops-dialog'?dialog:null;},querySelectorAll(){return [];}},
 currentMonth:'2026-11',currentMode:'expense',currentView:{scope:'store',name:'甲店',store:'甲店',region:'一区'},
 DATA:{regions:[{name:'一区',stores:['甲店','乙店']}],views:{}},ARCHIVE:{months:{}},
 notify:message=>notifications.push(message),
 WBProofs:{field:label=>`<label class="wide">${label}<input name="proof" type="file"></label>`,file:form=>form.file||null},
 FormData:class {constructor(form){return new Map(Object.entries(form.values));}}
};
x.window=x;
x.WBCloud={configured:false,member:{role:'store',region:'一区',store:'甲店'},project:false,
 async uploadProof(file,month,region,store){uploads.push({file,month,region,store});return {path:[month,region,store,file.name].join('/'),name:file.name};},
 async saveItem(...args){saves.push(args);if(pendingSave)await pendingSave;}
};
vm.createContext(x);
for(const name of ['core','workflow'])vm.runInContext(fs.readFileSync(root+'operations/'+name+'.js','utf8'),x);
vm.runInContext(fs.readFileSync(root+'operations/ui.js','utf8').replace('root.WBOperations={','root.testUI={finance,openExpense,saveExpense,handleSubmit,handleClick,proofOptions,expensePropertyOptions,applyExpenseProperty,expensePropertyInput,expenseMoney,updateExpenseTotal};root.WBOperations={'),x);
const ui=x.testUI,state=x.WBOperations.state,M=x.WBModel;
const d={housing:[],items:[],periods:[],directory:[]};state.cache['2026-11']=d;
let passed=0;const check=(condition,label)=>{assert.ok(condition,label);passed++;console.log('PASS',label);};
const row=(id,payload)=>({key:'2026-11|expense|甲店|'+id,kind:'expense',month:'2026-11',region:'一区',store:'甲店',updated_at:'v1',payload});
const property=(id,store='甲店',gift=0)=>({'房源编号':id,'大区':'一区','门店':store,'分盘':'花园','房间号':'1-101','店组':'甲店A组','维护人姓名':'顾问甲','经理姓名':'经理甲','细分在售户数':1,'本月是否送礼物':gift});
const gift={recordType:'gift',source:'manual',houseId:'',project:'花园',room:'1-101',priceCents:1850,quantity:2,bpVerified:true,verifiedAt:'2026-11-05T04:00:00Z'};
function reset(){d.housing=[];d.items=[];d.periods=[];saves.length=0;uploads.length=0;notifications.length=0;pendingSave=null;x.currentMonth='2026-11';x.currentView={scope:'store',name:'甲店',store:'甲店',region:'一区'};x.WBCloud.member={role:'store',region:'一区',store:'甲店'};state.expenseFilter='all';ui.finance(x.currentView);}
function form(extra={}){
 const selected=state.selectedExpense||{},values={project:selected.project||'花园',room:selected.room||'1-101',houseId:selected.houseId||'',price:selected.priceCents?String(selected.priceCents/100):'18.50',quantity:String(selected.quantity||1),payer:selected.payer||'',group:selected.group||'',advisor:selected.advisor||'',manager:selected.manager||'',giftDate:selected.giftDate||'',giftName:selected.giftName||'',existingProof:'',paymentStatus:'pending',note:'',bpVerified:'on',...extra};
 const duplicate={innerHTML:''},total={textContent:''},propertyStatus={textContent:''},button={disabled:false,isConnected:true};
 return {id:'ops-expense-form',values,dataset:{},elements:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}])),duplicate,total,propertyStatus,button,querySelector(selector){return selector==='#ops-expense-duplicate'?duplicate:selector==='#ops-expense-total'?total:selector==='#ops-expense-property-status'?propertyStatus:button;}};
}
const submit=f=>ui.handleSubmit({target:f,preventDefault(){}});

reset();let html=ui.finance(x.currentView);
check(/data-ops="add-expense" >手动补录送礼明细/.test(html),'authorized empty store has a usable manual-entry button');
ui.openExpense();check(dialog.open&&dialog.innerHTML.includes('BP核实')===false&&/我已核实/.test(dialog.innerHTML),'manual entry clearly requires BP verification');
check(/name="quantity"[^>]*value="1"/.test(dialog.innerHTML)&&/数量为归入本条送礼明细的份数/.test(dialog.innerHTML),'quantity defaults to one with clear attribution guidance');
check(/2026-11/.test(dialog.innerHTML)&&/一区 · 甲店/.test(dialog.innerHTML)&&!/<input name="store"/.test(dialog.innerHTML),'current month and store are fixed form context');
const newId=state.selectedExpense.expenseId;check(/^@@gift:[0-9a-f-]{36}$/.test(newId),'new independent manual line gets a stable UUID before saving');
await submit(form({quantity:'3',giftName:'茶礼'}));let saved=saves.at(-1);
check(saved?.[2]===newId&&saved[5].houseId===''&&saved[5].source==='manual'&&saved[5].recordType==='gift'&&saved[5].bpVerified===true,'manual draft saves stable identity and verified provenance through existing save API');
check(saved[5].quantity===3&&saved[5].priceCents===1850&&saved[5].amountCents===5550,'unit price and quantity produce precise total cents');
check(!saved[5].payer&&!saved[5].proofPath&&notifications.at(-1).includes('待补资料'),'quick draft permits missing names and proof with clear completion reminder');
d.items=[row(newId,saved[5])];html=ui.finance(x.currentView);
check(/数量：3份 · 总金额：¥55.50/.test(html)&&/BP手动补录/.test(html)&&/已核价3份（1条）/.test(x.WBOperations.ledgerText()),'saved manual quantity appears in line and reconciliation copy');
check(state.finance.ledger.actual===5550&&state.finance.ledger.missing>0,'saved draft is counted in provisional ledger and blocks final settlement');

reset();d.housing=[property('H1'),property('OTHER','乙店')];ui.finance(x.currentView);ui.openExpense();
const options=ui.expensePropertyOptions();check(options.length===1&&options[0].houseId==='H1','lookup includes non-gift base property and excludes other stores');
const f=form();f.elements.houseLookup={value:options[0].label};ui.applyExpenseProperty(f);
check(f.elements.houseId.value==='H1'&&f.elements.project.value==='花园'&&f.elements.advisor.value==='顾问甲'&&f.elements.manager.value==='经理甲','property selection brings in address and known responsibility names');
await submit(form({houseId:'H1',payer:'BP',advisor:'顾问甲',manager:'经理甲'}));
check(saves[0][2]==='H1'&&saves[0][5].houseId==='H1','chosen system property uses canonical expense key for future merge');


// Selecting a property must not leave its hidden identity behind after manual edits.
reset();d.housing=[property('H1'),{...property('H2'),'分盘':'别苑','房间号':'2-202'}];ui.finance(x.currentView);ui.openExpense();
let changed=form();changed.elements.houseLookup={value:ui.expensePropertyOptions()[0].label};ui.applyExpenseProperty(changed);
changed.elements.project.value='手填新楼盘';ui.expensePropertyInput(changed,'project');
check(changed.elements.houseId.value===''&&changed.elements.houseLookup.value===''&&!changed.dataset.expenseHouseId&&changed.propertyStatus.textContent.includes('已取消'),'editing autofilled address clears only its automatic identity and explains hand-entry');
check(['group','advisor','manager'].every(key=>changed.elements[key].value===''),'cancelling automatic property association clears unchanged auto-filled allocation people');
changed.values=Object.fromEntries(Object.entries(changed.elements).map(([key,el])=>[key,el.value]));await submit(changed);
check(saves.at(-1)[2].startsWith('@@gift:')&&saves.at(-1)[5].houseId===''&&saves.at(-1)[5].project==='手填新楼盘','edited address saves as independent verified line rather than prior property');
ui.openExpense();changed=form();changed.elements.houseLookup={value:ui.expensePropertyOptions()[0].label};ui.applyExpenseProperty(changed);
changed.elements.houseLookup.value='';ui.applyExpenseProperty(changed);
check(changed.elements.houseId.value===''&&changed.propertyStatus.textContent.includes('已取消'),'clearing property lookup removes the prior auto association');
changed.elements.houseLookup.value=ui.expensePropertyOptions()[0].label;ui.applyExpenseProperty(changed);
changed.elements.houseLookup.value='另一处房源';ui.expensePropertyInput(changed,'houseLookup');
check(changed.elements.houseId.value===''&&!changed.dataset.expenseHouseId,'typing a different lookup cancels the previous association immediately');
changed.elements.houseLookup.value=ui.expensePropertyOptions()[1].label;ui.applyExpenseProperty(changed);
check(changed.elements.houseId.value==='H2'&&changed.elements.project.value==='别苑'&&changed.elements.room.value==='2-202','selecting another property after cancellation autofills the new association normally');
changed.elements.room.value='2-303';ui.expensePropertyInput(changed,'room');
check(changed.elements.houseId.value==='','editing only room number also clears automatic property identity');
changed.elements.houseLookup.value=ui.expensePropertyOptions()[0].label;ui.applyExpenseProperty(changed);
changed.elements.group.value='手填B组';changed.elements.advisor.value='新顾问';changed.elements.manager.value='新经理';
changed.elements.houseId.value='EXPLICIT-ID';ui.expensePropertyInput(changed,'houseId');changed.elements.project.value='明确手填地址';ui.expensePropertyInput(changed,'project');
check(changed.elements.houseId.value==='EXPLICIT-ID'&&!changed.dataset.expenseHouseId&&changed.propertyStatus.textContent.includes('手动填写'),'an explicitly entered property ID survives subsequent manual address edits');
check(changed.elements.group.value==='手填B组'&&changed.elements.advisor.value==='新顾问'&&changed.elements.manager.value==='新经理','cancelling automatic association preserves manually corrected allocation people');
changed.values=Object.fromEntries(Object.entries(changed.elements).map(([key,el])=>[key,el.value]));await submit(changed);
check(saves.at(-1)[2]==='EXPLICIT-ID'&&saves.at(-1)[5].houseId==='EXPLICIT-ID','explicit manual ID still saves canonically');

reset();d.housing=[property('H1','甲店',1)];ui.finance(x.currentView);ui.openExpense();const duplicate=form({houseId:'H1'});duplicate.file={name:'paid.png'};await submit(duplicate);
check(saves.length===0&&uploads.length===0&&duplicate.duplicate.innerHTML.includes('data-expense="H1"'),'existing imported gift redirects to edit before any receipt upload or write');
reset();d.items=[row('@@gift:existing',{...gift,expenseId:'@@gift:existing'})];ui.finance(x.currentView);ui.openExpense();const duplicateManual=form({project:' 花园 ',room:'１－１０１'});await submit(duplicateManual);
check(saves.length===0&&duplicateManual.duplicate.innerHTML.includes('查看／编辑'),'normalized duplicate manual address cannot create another charge');

reset();d.items=[row('@@gift:first',{...gift,expenseId:'@@gift:first'}),row('@@gift:proof',{...gift,expenseId:'@@gift:proof',project:'别苑',proofPath:'2026-11/一区/甲店/paid.png',proofName:'paid.png'})];ui.finance(x.currentView);
const first=state.finance.expenses.find(e=>e.expenseId==='@@gift:first');ui.openExpense(first);
check(ui.proofOptions(first).includes('paid.png'),'unknown-property manual rows can reuse another manual row receipt');
await submit(form({quantity:'2',existingProof:'2026-11/一区/甲店/paid.png'}));saved=saves.at(-1);
check(saved[2]==='@@gift:first'&&saved[5].houseId===''&&saved[5].proofName==='paid.png'&&saved[6]==='v1','manual edit preserves stable identity, receipt reuse and optimistic version');

reset();d.items=[row('@@gift:first',{...gift,expenseId:'@@gift:first'})];d.housing=[property('LATER','甲店',1)];ui.finance(x.currentView);
check(state.finance.expenses.length===1&&state.finance.expenses[0].matchedHouseId==='LATER','later exact system import gives one line');
ui.openExpense(state.finance.expenses[0]);await submit(form());saved=saves.at(-1);
check(saved[2]==='@@gift:first'&&saved[5].houseId===''&&!('matchedHouseId' in saved[5]),'editing matched manual line never rewrites it to a new real-ID key');

reset();d.housing=[property('LEGACY','甲店',1)];d.items=[row('LEGACY',{houseId:'LEGACY',priceCents:7925,payer:'BP',advisor:'顾问甲',manager:'经理甲',proofPath:'proof'})];ui.finance(x.currentView);ui.openExpense(state.finance.expenses[0]);await submit(form());saved=saves.at(-1);
check(saved[2]==='LEGACY'&&saved[5].quantity===1&&saved[5].amountCents===7925&&!saved[5].bpVerified,'legacy imported edit retains one-gift behavior without new manual requirements');

reset();d.housing=[{...property('LEGACY-EMPTY','甲店',1),'分盘':'','房间号':''}];ui.finance(x.currentView);ui.openExpense(state.finance.expenses[0]);
check(!/name="(?:project|room)"[^>]*required/.test(dialog.innerHTML),'legacy system rows with missing addresses do not have required readonly fields');
await submit(form({project:'',room:'',payer:'补录付款人',advisor:'顾问甲',manager:'经理甲'}));saved=saves.at(-1);
check(saved?.[2]==='LEGACY-EMPTY'&&saved[5].project===''&&saved[5].room===''&&saved[5].payer==='补录付款人','legacy system row without address can still supplement payment information');

reset();ui.openExpense();let release;pendingSave=new Promise(resolve=>release=resolve);const concurrent=form();const p=submit(concurrent);await Promise.resolve();await submit(concurrent);
check(saves.length===1&&concurrent.button.disabled,'double submit is blocked while save is pending');release();await p;check(!concurrent.button.disabled&&concurrent.dataset.saving===undefined,'save guard is cleared after completion');

reset();ui.openExpense();x.currentMonth='2026-10';await submit(form());check(saves.length===0&&notifications.at(-1).includes('月份、门店'),'switching month during entry cannot save under another month');
reset();ui.openExpense();x.currentView={scope:'store',store:'乙店',name:'乙店',region:'一区'};await submit(form());check(saves.length===0&&notifications.at(-1).includes('月份、门店'),'switching store during entry cannot misattribute expenses');
reset();ui.openExpense();x.WBCloud.member=null;await submit(form());check(saves.length===0,'signing out invalidates open expense entry');
reset();ui.openExpense();d.periods=[{store:'甲店',locked:true,summary:{...state.finance.ledger,head:state.finance.head,rules:state.finance.rules}}];await submit(form());check(saves.length===0&&notifications.at(-1).includes('已锁定'),'period locked after opening still blocks save');
html=ui.finance(x.currentView);check(/data-ops="add-expense" disabled/.test(html),'locked monthly ledger disables manual entry');
reset();x.WBCloud.member={role:'store',region:'一区',store:'乙店'};html=ui.finance(x.currentView);check(/data-ops="add-expense" disabled/.test(html),'unauthorized store cannot start entry');

for(const extra of [{quantity:'0'},{quantity:'1.5'},{quantity:'10001'},{price:'0'},{price:'18.555'},{price:'-1'},{bpVerified:''},{project:''},{room:''},{giftDate:'2026-10-31'},{giftDate:'2026-11-31'}]){
 reset();ui.openExpense();await submit(form(extra));check(saves.length===0,'invalid or unverified manual draft is rejected: '+JSON.stringify(extra));
}
reset();ui.openExpense();const uploaded=form({payer:'BP'});uploaded.file={name:'付款截图.png'};await submit(uploaded);check(uploads.length===1&&uploads[0].month==='2026-11'&&uploads[0].store==='甲店'&&saves[0][5].proofName==='付款截图.png','upload or pasted proof saves with current authorized monthly scope');
const totalForm=form({price:'79.25',quantity:'3'});ui.updateExpenseTotal(totalForm);check(totalForm.total.textContent==='¥237.75','live amount preview matches saved cent arithmetic');
console.log(JSON.stringify({passed}));
