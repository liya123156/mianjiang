/* Actual payer, maintenance advisor and responsible group manager are separate identities. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const x={window:null,console,Intl,Date,crypto:globalThis.crypto};x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const D=x.WBManagerDirectory,M=x.WBModel;
const scope={region:'陆家嘴大区',store:'顶级豪宅部'};
const rules={cap:3000,advisor:300,manager:500,storeContribution:0,regionContribution:0,extraWeights:[1,1,1]};
const head={openingStore:10000,openingRegion:13889,storeHead:'店总甲',regionHead:'大区总甲'};
const gift=(id,group='A',extra={})=>({expenseId:id,houseId:id,month:'2026-10',...scope,group:'顶级豪宅部'+group+'组',priceCents:3000,quantity:1,payer:'鲁德月',advisor:'陈星',manager:'',proofPath:'test-proof/'+id,recordType:'gift',...extra});
const amount=(ledger,name)=>ledger.balances.find(row=>row.name===name)?.amount||0;
const sumBalances=ledger=>ledger.balances.reduce((n,row)=>n+row.amount,0);
const plain=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

assert.equal(typeof D.recognize,'function');assert.equal(typeof M.expensePeople,'function');
assert.equal(D.recognize('鲁德月',scope).status,'matched');
assert.equal(D.recognize(' 鲁 德 月 ',{region:' 陆家嘴大区 ',store:' 顶级豪宅部 '}).role,'店经理');
assert.equal(D.recognize('鲁德月',{region:'花木大区',store:'御翠园店'}).role,'待核对','a manager in another store is not automatically identified here');
assert.notEqual(D.recognize('陈飞',{}).status,'matched','a duplicate name without organization cannot choose one manager');
assert.equal(D.recognize('陈飞',{region:'花木大区',store:'御翠园店'}).status,'matched');
assert.equal(D.recognize('陈飞',{region:'徐汇大区',store:'徐汇滨江店'}).status,'matched');
assert.notEqual(D.recognize('鲁德月代付',scope).status,'matched','free text is not parsed as an exact person identity');
assert.notEqual(D.recognize('鲁德',scope).status,'matched','partial-name matches must not allocate money');

const source=freeze(gift('same-group')),sourceCopy=plain(source),identified=M.expensePeople(source);
assert.notEqual(identified,source);assert.deepEqual(plain(source),sourceCopy,'identity enrichment does not mutate a saved record');
assert.equal(identified.payer,'鲁德月');assert.equal(identified.advisor,'陈星');
assert.equal(identified.manager,'鲁德月');assert.equal(identified.managerSource,'directory');assert.equal(identified.managerDirectoryName,'鲁德月');
assert.equal(identified.payerRole,'店经理');assert.equal(identified.payerRoleStatus,'matched');assert.equal(identified.managerConflict,false);
const same=M.ledger([source],rules,head);
assert.equal(same.actual,3000);assert.equal(same.advisor,300);assert.equal(same.manager,500);assert.equal(same.storeConsumed,2200);
assert.equal(amount(same,'鲁德月'),2500,'manager who advanced the purchase deducts only the responsible manager allocation');
assert.equal(amount(same,'陈星'),-300);assert.equal(sumBalances(same),2200);assert.equal(same.unassigned.total,0);

const cross=M.ledger([gift('cross-group','D')],rules,head);
assert.equal(cross.lines[0].payerRole,'店经理');assert.equal(cross.lines[0].manager,'潘闯庆','payer role never replaces the expense group manager');
assert.equal(amount(cross,'鲁德月'),3000);assert.equal(amount(cross,'潘闯庆'),-500);assert.equal(amount(cross,'陈星'),-300);
assert.equal(sumBalances(cross),2200);

const normalized=M.ledger([gift('normalize','A',{payer:' 鲁 德 月 ',advisor:' 陈 星 ',manager:'鲁德月'})],rules,head);
assert.equal(amount(normalized,'鲁德月'),2500);assert.equal(amount(normalized,'陈星'),-300);
assert.equal(normalized.balances.filter(row=>row.name.replace(/\s/g,'')==='鲁德月').length,1,'spacing cannot split a person into separate accounts');
const normalizedCash=M.cashSettlement(normalized,[{type:'refund',name:'鲁 德 月',amount:2500},{type:'receive',name:'陈 星',amount:300}]);
assert.equal(amount(normalizedCash,'鲁德月'),0);assert.equal(amount(normalizedCash,'陈星'),0);assert.equal(normalizedCash.refunded,2500);assert.equal(normalizedCash.received,300);

const conflict=M.ledger([gift('conflict','D',{manager:'郭慧'})],rules,head);
assert.equal(conflict.lines[0].manager,'郭慧','an explicit saved assignment is not overwritten');
assert.equal(conflict.lines[0].managerSource,'explicit');assert.equal(conflict.lines[0].managerDirectoryName,'潘闯庆');
assert.equal(conflict.lines[0].managerConflict,true);assert.ok(conflict.missing>0);assert.ok(conflict.alerts.length>0,'conflicting assignment prevents silent final confirmation');
assert.equal(amount(conflict,'郭慧'),-500);assert.equal(amount(conflict,'潘闯庆'),0);

// A reviewed historical manager may differ from today's roster; confirmation is scoped.
const historical=gift('historical','D',{manager:'郭慧'}),confirmation=M.expenseManagerKey(historical);
assert.ok(confirmation);const confirmed=M.expensePeople({...historical,managerConfirmation:confirmation});
assert.equal(confirmed.manager,'郭慧');assert.equal(confirmed.managerConflict,true);assert.equal(confirmed.managerConflictConfirmed,true);assert.equal(confirmed.identityIssues.length,0);
assert.equal(M.ledger([{...historical,managerConfirmation:confirmation}],rules,head).missing,0,'an explicit scoped historical confirmation resolves the identity warning');
for(const change of [{month:'2026-09'},{group:'顶级豪宅部A组'},{store:'星河湾店',group:'星河湾店A组'},{manager:'鲁德月'}]){
 const changed={...historical,...change,managerConfirmation:confirmation};
 assert.notEqual(M.expenseManagerKey(changed),confirmation,'changed organization / month / manager invalidates prior approval');
 assert.equal(M.expensePeople(changed).managerConflictConfirmed,false);
}
assert.equal(M.expenseManagerKey({...historical,month:''}),'');assert.equal(M.expensePeople({...historical,month:'',managerConfirmation:confirmation}).managerConflictConfirmed,false,'missing month cannot be confirmed');

const unresolved=M.ledger([gift('unknown-group','Z',{manager:'待补充'})],rules,head);
assert.equal(unresolved.manager,500,'the aggregate still reflects the selected rule');
assert.equal(unresolved.unassigned.manager,500);assert.equal(unresolved.unassigned.balance,-500);assert.equal(unresolved.unassigned.total,500);
assert.ok(unresolved.missing>0);assert.ok(unresolved.alerts.length>0);
assert.ok(!unresolved.balances.some(row=>['待补充','待核对','—','/'].includes(row.name)),'no fictitious payee is created');
assert.equal(sumBalances(unresolved)+unresolved.unassigned.balance,unresolved.storeConsumed+unresolved.regionConsumed,'every missing allocation is accounted for explicitly');
assert.equal(M.expensePeople(gift('placeholder','A',{manager:'待补充'})).manager,'鲁德月','placeholder manager names count as missing');
const missingPayer=M.ledger([gift('missing-payer','A',{payer:'—'})],rules,head);
assert.equal(missingPayer.unassigned.payer,3000);assert.ok(missingPayer.missing>0);assert.ok(!missingPayer.balances.some(row=>row.name==='—'));
const unknownPerson=M.expensePeople(gift('unlisted-payer','A',{payer:'名册外付款人'}));
assert.equal(unknownPerson.payer,'名册外付款人');assert.equal(unknownPerson.payerRole,'待核对','not finding a manager does not prove a payer is an advisor');

// A manager who is also the maintainer retains the current two role allocations.
// This fix does not introduce an unconfirmed exemption or change a monthly rule.
const dual=M.ledger([gift('dual','A',{advisor:'鲁德月'})],rules,head);
assert.equal(dual.advisor,300);assert.equal(dual.manager,500);assert.equal(amount(dual,'鲁德月'),2200);
const low=M.ledger([gift('low','A',{priceCents:200,quantity:2})],rules,head);
assert.equal(low.actual,400);assert.equal(low.advisor,400);assert.equal(low.manager,0);assert.equal(low.storeConsumed,0);assert.equal(low.unassigned.total,0);
const extra=M.ledger([gift('extra','A',{priceCents:3001,quantity:3})],rules,head);
assert.equal(extra.actual,9003);assert.equal(extra.quantity,3);assert.equal(extra.advisor,903);assert.equal(extra.manager,1500);assert.equal(extra.extraStore,0);
assert.equal(extra.actual,extra.advisor+extra.manager+extra.store+extra.region+extra.company);
assert.equal(M.ledger([gift('voided','A',{voided:true})],rules,head).actual,0);

const housing=[{房源编号:'house-a',大区:scope.region,门店:scope.store,店组:'顶级豪宅部A组',维护人姓名:'陈星',细分在售户数:1,本月是否送礼物:1,分盘:'测试楼盘',房间号:'101'}];
const candidates=M.expenseCandidates(housing,'2026-10');assert.equal(candidates[0].manager,'鲁德月');
const saved=freeze([{kind:'expense',month:'2026-10',region:scope.region,store:scope.store,key:'2026-10|expense|顶级豪宅部|house-a',payload:{...gift('house-a','A'),manager:''}}]);
const savedSnapshot=plain(saved),records=M.expenseRecords(housing,saved,'2026-10',scope);
assert.equal(records.length,1);assert.equal(records[0].manager,'鲁德月');assert.deepEqual(plain(saved),savedSnapshot,'saved monthly records and their original manager fields remain unchanged');
const retained=M.expenseRecords([],saved,'2026-10',scope);assert.equal(retained.length,1);assert.equal(retained[0].manager,'鲁德月');assert.equal(retained[0].retained,true,'off-market costs remain in the ledger');

// Synthetic reconstruction of the visible nine-line arithmetic, not source rows.
// Only one saved manager was present; the old code lost 8 × 5 yuan in personal balances.
// No real employee payment details are committed with this regression fixture.
const fakeManagers={A:'经理甲',B:'经理乙',C:'经理丙',D:'经理丁'},normalize=v=>String(v??'').normalize('NFKC').replace(/\s/g,'');
x.WBManagerDirectory={
 lookup(org){if(normalize(org.region)!==scope.region||normalize(org.store)!==scope.store)return '';return fakeManagers[normalize(org.group).replace(scope.store,'').replace(/组$/,'')]||'';},
 recognize(name,org){const key=Object.keys(fakeManagers).find(k=>fakeManagers[k]===normalize(name)),matched=!!key&&normalize(org.region)===scope.region&&normalize(org.store)===scope.store;return {name:normalize(name),role:matched?'店经理':'待核对',status:matched?'matched':normalize(name)?'unknown':'missing',groups:matched?[scope.store+key+'组']:[],matches:[],note:'测试名册'};}
};
const anonymousGift=(id,group='A',extra={})=>gift(id,group,{payer:'经理甲',advisor:'维护人甲',...extra});
const nine=[
 anonymousGift('nine-1','B',{priceCents:1907,payer:'垫付人甲',advisor:'垫付人甲'}),
 anonymousGift('nine-2','A'),
 anonymousGift('nine-3','C',{payer:'经理丙',advisor:'维护人乙',manager:'经理丙'}),
 ...['维护人丙','维护人丙','维护人丙','维护人丁','维护人戊','维护人戊'].map((advisor,i)=>anonymousGift('nine-'+(i+4),'D',{priceCents:2999,payer:'经理丁',advisor}))
];
const screenshot=M.ledger(nine,rules,head);
assert.equal(screenshot.actual,25901);assert.equal(screenshot.advisor,2700);assert.equal(screenshot.manager,4500);
assert.equal(screenshot.storeConsumed,10000);assert.equal(screenshot.regionConsumed,8701);assert.equal(screenshot.closingRegion,5188);
assert.equal(screenshot.unassigned.total,0);assert.equal(sumBalances(screenshot),18701);
assert.equal(amount(screenshot,'垫付人甲'),1607);assert.equal(amount(screenshot,'经理甲'),2500);assert.equal(amount(screenshot,'经理丙'),2500);
assert.equal(amount(screenshot,'经理丁'),14994);assert.equal(amount(screenshot,'经理乙'),-500);
assert.equal(screenshot.lines.reduce((n,e)=>n+(e.manager?e.managerShare:0),0),4500,'all nine manager shares have a real person');
console.log('PASS finance payer identity: scoped exact manager recognition, payer/group separation, explicit conflict alerts, missing allocation conservation, normalized cash settlement, unchanged role rates/quantity/extras, immutable saved records and nine-line 40-yuan regression.');
