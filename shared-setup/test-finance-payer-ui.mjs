/* Financial UI displays distinct payment/assessment identities without rewriting records. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const month='2026-10',company={scope:'company',name:'全司'},scope={region:'陆家嘴大区',store:'顶级豪宅部'},view={scope:'store',name:scope.store,...scope};
const elements=new Map(),listeners=new Map(),notices=[],calls=[];
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,setAttribute(){}});return elements.get(id);}
const document={getElementById:element,querySelector:element,querySelectorAll(){return [];},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},createElement(tag){return {tagName:tag,innerHTML:'',showModal(){},close(){}};},body:{append(){}}};
const storage=new Map(),member={role:'project',display_name:'项目负责人'};
const x={window:null,document,console,Intl,Date,URL,Blob,TextEncoder,Uint8Array,Uint32Array,DataView,crypto:globalThis.crypto,setTimeout:()=>0,clearTimeout(){},currentMonth:month,currentMode:'expense',currentView:view,
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
 WBCloud:{configured:false,member,hasSession:false,async saveItem(...args){calls.push(args);}},WBVoice:{reset(){},field:()=>''},WBProofs:{field:()=>'<input data-proof-field>',boot(){}},
 DATA:{meta:{},regions:[],views:{}},ARCHIVE:{months:{}},isHistoryArchiveMonth:()=>false,
 renderTable:()=>'',notify:message=>notices.push(message),monthLabel:()=> '10月',viewKey:v=>v.scope+':'+v.name,viewFromUrl:()=>company,updateUrl(){},
 resolveView:(region,store)=>store?{scope:'store',name:store,region,store}:region?{scope:'region',name:region,region}:company};
Object.defineProperty(x.WBCloud,'project',{get:()=>x.WBCloud.member?.role==='project'});
x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core','quality-feed','quality-rules','quality','workflow','scene','ui'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const U=x.WBOperations,M=x.WBModel,W=x.WBWorkflow;
// Test-only roster: financial examples contain no real employee payment records.
const fakeManagers={A:'经理甲',B:'经理乙',C:'经理丙',D:'经理丁'};
const norm=v=>String(v??'').normalize('NFKC').replace(/\s/g,'');
x.WBManagerDirectory={
 lookup(org){if(norm(org.region)!==scope.region||norm(org.store)!==scope.store)return '';return fakeManagers[norm(org.group).replace(scope.store,'').replace(/组$/,'')]||'';},
 recognize(name,org){const key=Object.keys(fakeManagers).find(k=>fakeManagers[k]===norm(name)),matched=!!key&&norm(org.region)===scope.region&&norm(org.store)===scope.store;return {name:norm(name),role:matched?'店经理':'待核对',status:matched?'matched':norm(name)?'unknown':'missing',groups:matched?[scope.store+key+'组']:[],matches:[],note:'测试名册'};}
};

const rule={cap:3000,advisor:300,manager:500,storeContribution:0,regionContribution:0,extraWeights:[1,1,1]};
const head={storeHead:'店总甲',regionHead:'大区总甲',openingStore:10000,openingRegion:13889};
const gift=(id,group='A',extra={})=>({expenseId:id,houseId:id,month,recordType:'gift',...scope,group:scope.store+group+'组',project:'测试楼盘',room:id,priceCents:3000,quantity:1,payer:'经理甲',advisor:'维护人甲',manager:'',proofPath:'test-proof/'+id,...extra});
const item=(kind,id,payload)=>({month,kind,key:[month,kind,scope.store,id].join('|'),...scope,payload});
function install({gifts=[],cash=[],rules=rule,account=head,periods=[],actor=member}={}){
 elements.clear();U.state.finance=null;U.state.loading=false;U.state.error='';U.state.expenseFilter='all';U.state.expenseContext=null;x.currentMonth=month;x.currentView=view;x.currentMode='expense';x.WBCloud.member=actor;
 const items=[item('expense','@@head',structuredClone(account)),item('rules','monthly',structuredClone(rules)),...gifts.map(g=>item('expense',g.expenseId,structuredClone(g))),...cash.map((c,i)=>item('expense','cash'+i,{recordType:'cash',date:'2026-10-31',...c}))];
 const data={reader:actor,housing:[],meetings:[],items,periods:structuredClone(periods),snapshots:[],directory:[],imports:[]};
 U.state.cache[month]=data;const before=JSON.stringify(data);U.render(view);assert.equal(JSON.stringify(data),before,'finance rendering does not rewrite source cache / saved items / locked snapshots');
 return {data,before,html:element('report').innerHTML,ledger:U.state.finance?.ledger,finance:U.state.finance};
}
const row=(name,finance=U.state.finance)=>U.financePersonRows(finance).find(p=>p.name===name);

// Representative nine purchases with two A-group gifts; eight saved manager fields are blank.
const gifts=[gift('r1','A',{priceCents:1907,payer:'垫付人甲',advisor:'垫付人甲'}),gift('r2'),gift('r3','C',{payer:'经理丙',advisor:'维护人乙',manager:'经理丙'}),...['维护人丙','维护人丙','维护人丙','维护人丁','维护人戊','维护人戊'].map((advisor,i)=>gift('r'+(i+4),'D',{priceCents:2999,payer:'经理丁',advisor}))];
let result=install({gifts});
assert.equal(result.ledger.actual,25901);assert.equal(result.ledger.manager,4500);assert.equal(result.ledger.unassigned.total,0);
assert.equal(row('经理甲').role,'经理');assert.equal(row('经理甲').advance,3000);assert.equal(row('经理甲').assessed,1000);assert.equal(row('经理甲').amount,2000);
assert.equal(row('经理丁').advance,17994);assert.equal(row('经理丁').assessed,3000);assert.equal(row('经理丁').amount,14994);
assert.equal(U.financePersonRows().reduce((n,r)=>n+r.amount,0),18701);
assert.match(result.html,/付款人：经理甲（经理）/);assert.match(result.html,/负责经理：经理甲（按店组名册匹配）/);
let text=U.ledgerText();assert.match(text,/经理甲（经理）：应返还20\.00元（垫付30\.00，承担10\.00）/);
assert.match(text,/经理丁（经理）：应返还149\.94元（垫付179\.94，承担30\.00）/);assert.match(text,/垫付人甲（维护人）/);
assert.equal(calls.length,0,'calculation and render do not persist inferred identities or initiate payments');

// Cash entries are applied once; zeroed rows disappear while unsettled rows retain detail.
result=install({gifts,cash:[{type:'refund',name:' 经 理 丁 ',amount:10000},{type:'receive',name:'维 护 人 甲',amount:100},{type:'refund',name:'经理丙',amount:2500,voided:true}]});
assert.equal(row('经理丁').amount,4994);assert.equal(row('经理丁').refunded,10000);assert.equal(row('维护人甲').received,100);assert.equal(row('维护人甲').amount,-200);
assert.equal(row('经理丙').amount,2500);assert.equal(row('经理丙').refunded,0);assert.match(U.ledgerText(),/已返100\.00/);assert.match(U.ledgerText(),/已收1\.00/);

// Company receivable remains in copied text even though person detail excludes it.
result=install({gifts:[gift('company')],account:{...head,openingStore:0,openingRegion:0},cash:[{type:'company',name:'公司',amount:1000}]});
assert.equal(result.ledger.company,2200);assert.ok(!U.financePersonRows().some(p=>p.name.includes('公司')));
assert.match(U.ledgerText(),/公司（待财务报销）：待到账12\.00元/);assert.match(U.ledgerText(),/公司到账10\.00/);

// A head who is also in the manager roster keeps the actual head role in the bill.
result=install({gifts:[gift('head-role')],rules:{...rule,storeContribution:10000,regionContribution:1000},account:{...head,storeHead:'经理甲',regionHead:'经理丙',openingStore:0,openingRegion:0}});
assert.equal(row('经理甲').role,'店总');assert.equal(row('经理甲').assessed,10500);assert.equal(row('经理丙').role,'大区总');assert.equal(row('经理丙').assessed,1000);

// An explicit conflicting manager remains visible, reviewable and in the people todo.
result=install({gifts:[gift('conflict','D',{manager:'经理丙'})]});
assert.equal(result.ledger.lines[0].manager,'经理丙');assert.equal(W.expenseNeeds(result.finance.expenses[0]).people,true);
assert.match(result.html,/与名册不一致，请核对当期记录/);assert.match(U.ledgerText(),/核账待确认/);assert.match(U.ledgerText(),/已填负责经理与店组名册不一致/);
result=install({gifts:[gift('unknown','Z')]});assert.match(U.ledgerText(),/经理承担尚有5\.00元未归属到姓名/);assert.ok(result.ledger.missing>0);
assert.equal(U.expensePayerLabel({payer:'经理以外付款人',advisor:'其他维护人',...scope}),'身份待核对');
assert.equal(U.expensePayerLabel({payer:' 维 护 人 甲 ',advisor:'维护人甲',...scope}),'维护人（职务待核对）');

// The locked snapshot is authoritative: no new roster calculation changes closed amounts.
const frozenSummary={actual:9999,quantity:1,advisor:123,manager:456,store:0,region:0,company:0,storeConsumed:0,regionConsumed:0,extraStore:0,closingStore:111,closingRegion:222,missing:0,lines:[{...gift('locked','A',{payer:'经理甲',manager:''}),amountCents:3000,advisorShare:300,managerShare:500}],balances:[{name:'经理甲',amount:1234},{name:'维护人甲',amount:-123}],head:{...head},rules:{...rule}};
result=install({gifts:[gift('newer-source','D',{priceCents:500000})],periods:[{month,...scope,locked:true,summary:frozenSummary}]});
assert.equal(result.finance.locked,true);assert.equal(result.ledger.actual,9999);assert.equal(result.ledger.manager,456);assert.equal(row('经理甲').amount,1234);
assert.deepEqual(JSON.parse(JSON.stringify(result.ledger)),frozenSummary,'closed monetary snapshot remains intact');assert.match(result.html,/已结账锁定/);assert.doesNotMatch(result.html,/id="ops-cash-form"/);

// Inline form identity assistance does not confuse the payer with a different group manager.
install({gifts:[]});
const status={textContent:''},fields={payer:{value:'经理甲'},advisor:{value:'维护人甲'},group:{value:'顶级豪宅部D组'},manager:{value:''}};
const form={elements:fields,dataset:{},querySelector:selector=>selector==='#ops-expense-people-status'?status:null};
U.updateExpensePeople(form);assert.equal(fields.manager.value,'经理丁');assert.equal(form.dataset.expenseResolvedManager,'经理丁');assert.match(status.textContent,/付款人已识别为经理/);assert.match(status.textContent,/顶级豪宅部A组/);assert.match(status.textContent,/负责经理：经理丁/);
fields.group.value='顶级豪宅部A组';U.updateExpensePeople(form,'group');assert.equal(fields.manager.value,'经理甲');
fields.manager.value='经理丙';U.updateExpensePeople(form,'manager');assert.equal(fields.manager.value,'经理丙');assert.ok(!form.dataset.expenseResolvedManager);assert.match(status.textContent,/已填经理与名册不一致/);
fields.payer.value='名册外付款人';U.updateExpensePeople(form,'payer');assert.match(status.textContent,/身份待核对/);assert.equal(fields.manager.value,'经理丙','changing payer never rewrites an explicit manager');

// The input listener invokes the same assistance; no write endpoint is called.
await U.boot();fields.payer.value='经理甲';const target={name:'payer',closest:selector=>selector==='#ops-expense-form'||selector==='form'?form:null};
for(const fn of listeners.get('input')||[])fn({target});assert.match(status.textContent,/付款人已识别为经理/);assert.equal(calls.length,0);
console.log('PASS finance payer UI: scoped manager labels, separate advances/assessments, nine-line balances, cash/company/head roles, conflict and unassigned reminders, immutable locked snapshot, inline inference and no mutations.');
