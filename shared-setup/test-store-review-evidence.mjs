/* Source-consistent aggregates and one-image composition; no network or model loading. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../operations/core.js');
const source=fs.readFileSync(new URL('../operations/store-review-evidence.js',import.meta.url),'utf8');
const store='新天地一店',region='黄浦大区',asOf='2026-11-15',sourceVersion='version-1';
const home=(id,group,name,met=0,top=0,unit=0,gift=0,override={})=>({'房源编号':id,'大区':region,'门店':store,'店组':store+group+'组','维护人姓名':name,'细分在售户数':1,'本月是否面见':met,'门店top户数':top,'户型top户数':unit,'本月是否送礼物':gift,'业主姓名':'不应输出的业主','房间号':'不应输出的房号','电话':'13800000000',...override});
const event=(id,date,eventId,name='其他面见人')=>({'房源编号':id,'面见时间':date,'面见id':eventId,'面见人姓名':name,'面见反馈':'不应输出的反馈原文'});
const housing=[home('h1','A','张三',1,1,1,1),home('h2','A','李四',1),home('h3','B','张三',0,0,1),home('h4','B',''),home('inactive','C','不在售人员',1,1,1,1,{'细分在售户数':0}),home('foreign','A','跨店人员',1,1,1,1,{'门店':'复兴香园店'})];
const meetings=[event('h1','2026-11-03 09:00','a1'),event('h1','2026-11-10 09:00','a2'),event('h1','2026-11-11 09:00','a3'),event('h1','2026-11-11 09:00','a3'),event('h3','2026-11-12 09:00','b1'),event('h1','2026-10-30 09:00','old'),event('h1','2026-11-16 09:00','future'),event('h2','无效日期','invalid'),event('foreign','2026-11-10 09:00','foreign'),event('inactive','2026-11-10 09:00','inactive')];
const business={housing,meetings,imports:[{as_of:asOf,created_at:sourceVersion}]};
const snapshot={month:'2026-11',region,store,periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15',asOf,sourceVersion,monthly:{stock:4,met:2,meetingCount:5,storeTopStock:1,storeTopMet:1,unitTopStock:2,unitTopMet:1,gift:1},period:{met:2,meetingCount:3}};
const allContexts=[],bitmapClosed=[],reportCalls=[];let exports=0;
function makeContext(id){const calls=[];const context={id,calls,font:'20px sans-serif',fillStyle:'',strokeStyle:'',textBaseline:'',textAlign:'',measureText(text){const size=Number(this.font.match(/(\d+(?:\.\d+)?)px/)?.[1]||20);return {width:Array.from(String(text)).length*size*.8};},fillText(text,...args){calls.push({type:'text',text:String(text),args});},fillRect(...args){calls.push({type:'fillRect',args});},strokeRect(){},save(){calls.push({type:'save'});},restore(){calls.push({type:'restore'});},translate(...args){calls.push({type:'translate',args});},scale(...args){calls.push({type:'scale',args});},drawImage(image,...args){calls.push({type:'drawImage',image,args});}};allContexts.push(context);return context;}
const document={fonts:{ready:Promise.resolve()},createElement(tag){assert.equal(tag,'canvas');const context=makeContext(allContexts.length);return {width:300,height:150,getContext(){return context;},toBlob(callback,type){exports++;callback(new Blob([JSON.stringify({width:this.width,height:this.height,drawn:context.calls.length})],{type}));}};}};
const reportPages=[new Blob(['report-1'],{type:'image/png'}),new Blob(['report-2'],{type:'image/png'})];
const managerCalls=[],managerDirectory={nameFor(query){managerCalls.push({...query});return query.region===region&&query.store===store&&query.group===store+'A组'?'经理甲':'';}};
const x={window:null,WBModel:M,WBManagerDirectory:managerDirectory,WBStoreReviewModel:{async images(report){reportCalls.push(report);return reportPages;}},document,Blob,console,createImageBitmap:async blob=>{const id=await blob.text();return {width:1500,height:id==='report-1'?1000:800,id,close(){bitmapClosed.push(id);}};}};x.window=x;vm.createContext(x);vm.runInContext(source,x);const E=x.WBStoreReviewEvidence;
let result=E.build({snapshot,businessData:business,periodGoal:4});
assert.equal(result.rows[0].manager,'—','aggregate store row has no group manager');assert.ok(result.rows.filter(r=>r.group===store+'A组').every(r=>r.manager==='经理甲'));assert.ok(result.rows.filter(r=>r.group===store+'B组').every(r=>r.manager==='待补充'));assert.ok(managerCalls.every(q=>q.region===region&&q.store===store&&q.group!== '全店汇总'));
assert.equal(result.rows.length,7,'one store, two groups and all four maintained-person rows');
assert.deepEqual(Array.from(result.rows.filter(r=>r.level==='group'),r=>r.group),[store+'A组',store+'B组']);
assert.equal(result.rows[0].stock,4);assert.equal(result.rows[0].periodMet,2);assert.equal(result.rows[0].periodMeetingCount,3);
assert.equal(result.rows[0].monthlyMet,2);assert.equal(result.rows[0].monthlyMeetingCount,5);assert.equal(result.rows[0].giftRate,'50.00%');
assert.equal(result.rows[0].storeTop,'1/1');assert.equal(result.rows[0].unitTop,'1/2');assert.equal(result.periodGoal,4);
const people=result.rows.filter(r=>r.level==='advisor');assert.equal(people.filter(r=>r.name==='张三').length,2,'same names in different groups stay separate');
assert.equal(people.filter(r=>r.name==='张三').find(r=>r.group.endsWith('A组')).periodMeetingCount,2,'weekly repeated visits remain two events on one property');
assert.equal(people.filter(r=>r.name==='张三').find(r=>r.group.endsWith('B组')).monthlyMet,0,'monthly base-table mark is distinct from the weekly event');
assert.equal(people.find(r=>r.name==='未填写').periodMet,0,'blank maintenance names are included');
assert.equal(result.rows.filter(r=>r.level==='group').reduce((n,r)=>n+r.stock,0),4);assert.equal(people.reduce((n,r)=>n+r.stock,0),4);
assert.equal(people.reduce((n,r)=>n+r.periodMet,0),2);assert.equal(people.reduce((n,r)=>n+r.monthlyMet,0),2);
assert.ok(result.notes.some(n=>n.includes('1套已登记面见缺少有效日期')));assert.ok(result.notes.some(n=>n.includes('1套本期面见明细与月度面见标记不一致')));
const serialized=JSON.stringify(result);for(const privateText of ['不应输出的业主','不应输出的房号','13800000000','不应输出的反馈原文','其他面见人','跨店人员','不在售人员'])assert.ok(!serialized.includes(privateText),privateText+' is not exported');
assert.ok(!Object.hasOwn(result.rows[1],'periodGoal'),'no invented subgroup targets');

const baseline=result.rows.map(({manager,...row})=>row);delete x.WBManagerDirectory;const fallback=E.build({snapshot,businessData:business,periodGoal:4});assert.equal(fallback.rows[0].manager,'—');assert.ok(fallback.rows.slice(1).every(r=>r.manager==='待补充'));assert.deepEqual(fallback.rows.map(({manager,...row})=>row),baseline,'manager enrichment does not alter counts, maintainer names or order');x.WBManagerDirectory=managerDirectory;
const realDirectory=require('../operations/manager-directory.js');x.WBManagerDirectory=realDirectory;const directoryResult=E.build({snapshot,businessData:business,periodGoal:4});assert.ok(directoryResult.rows.filter(r=>r.group===store+'A组').every(r=>r.manager==='张宇'));assert.ok(directoryResult.rows.filter(r=>r.group===store+'B组').every(r=>r.manager==='郭瑞瑞'));assert.equal(directoryResult.rows[0].manager,'—');const blankGroupBusiness={...business,housing:business.housing.map(h=>({...h,'店组':h['门店']===store?'—':h['店组']}))};const blankGroupResult=E.build({snapshot,businessData:blankGroupBusiness});assert.ok(blankGroupResult.rows.slice(1).every(r=>r.manager==='待补充'),'only aggregate store rows may use a manager dash');x.WBManagerDirectory=managerDirectory;
const monthlySnapshot={...snapshot,periodType:'monthly',periodStart:'2026-11-01',periodEnd:'2026-11-30',period:{met:2,meetingCount:5}};
result=E.build({snapshot:monthlySnapshot,businessData:business});assert.equal(result.rows[0].periodMet,2);assert.equal(result.rows[0].periodMeetingCount,5);assert.equal(result.periodLabel,'本月');assert.ok(result.notes.some(n=>n.includes('尚未形成完整周期')));
assert.throws(()=>E.build({snapshot:{...snapshot,sourceVersion:'old'},businessData:business}),/底表版本不一致/);
assert.throws(()=>E.build({snapshot:{...snapshot,asOf:'2026-11-12'},businessData:business}),/底表版本不一致/);
assert.throws(()=>E.build({snapshot:{...snapshot,sourceVersion:''},businessData:{...business,imports:[{as_of:asOf,created_at:''}]}}),/底表版本不一致/);
assert.throws(()=>E.build({snapshot,businessData:{...business,meetings:undefined}}),/底表尚未读取/);
assert.throws(()=>E.build({snapshot:{...snapshot,store:'复兴香园店'},businessData:business}),/底表版本不一致/,'same-version aggregate mismatch blocks silently switching stores');
assert.throws(()=>E.build({snapshot:{...snapshot,region:'花木大区'},businessData:business}),/范围不正确/);
assert.throws(()=>E.build({snapshot:{...snapshot,monthly:{...snapshot.monthly,met:99}},businessData:business}),/底表版本不一致/);
result=E.build({snapshot:{...snapshot,monthly:{stock:0,met:0,meetingCount:0},period:{met:0,meetingCount:0}},businessData:{...business,housing:[]}});assert.equal(result.rows.length,1);assert.equal(result.rows[0].periodRate,'—');assert.equal(result.rows[0].giftRate,'—');assert.equal(result.rows[0].storeTopRate,'—');

const noIdEvents=[event('h1','2026-11-10 09:00',''),event('h1','2026-11-10 09:00',''),event('h1','2026-11-10 10:00','')];
result=E.build({snapshot:{...snapshot,monthly:{stock:4,met:2,meetingCount:3},period:{met:1,meetingCount:2}},businessData:{...business,meetings:noIdEvents}});assert.equal(result.rows[0].periodMeetingCount,2,'ID-less event fallback deduplicates exact date/person tuples');

const report={title:store+' · 面见周复盘',sections:[{title:'正文',lines:['待BP补充']}]};
const blob=await E.image({report,snapshot,businessData:business,periodGoal:4});assert.ok(blob instanceof Blob);assert.equal(blob.type,'image/png');assert.equal(exports,1,'only one final PNG is exported, not a report blob and a separate data blob');assert.equal(reportCalls.length,1);
const dims=JSON.parse(await blob.text());assert.equal(dims.width,2000);assert.ok(dims.height>2400,'both report pages and the complete table are retained');
const finalContext=allContexts.at(-1),draws=finalContext.calls.filter(c=>c.type==='drawImage');assert.equal(draws.length,2);assert.equal(draws[0].image.id,'report-1');assert.equal(draws[1].image.id,'report-2');assert.equal(draws[0].args[1],0);assert.ok(draws[1].args[1]>0);
const firstTableText=finalContext.calls.findIndex(c=>c.type==='text'&&c.text.startsWith('六、面见数据明细'));assert.ok(firstTableText>finalContext.calls.findIndex(c=>c.type==='drawImage'&&c.image.id==='report-2'),'data is drawn beneath every report page');
for(const value of ['全店汇总',store+'A组',store+'B组','张三','李四','未填写'])assert.ok(finalContext.calls.some(c=>c.type==='text'&&c.text===value),value+' is included in the image');
const headerGroup=finalContext.calls.find(c=>c.type==='text'&&c.text==='店组'),headerManager=finalContext.calls.find(c=>c.type==='text'&&c.text==='经理'),headerName=finalContext.calls.find(c=>c.type==='text'&&c.text==='维护人');assert.ok(headerGroup.args[0]<headerManager.args[0]&&headerManager.args[0]<headerName.args[0],'manager column precedes the separate maintainer column');assert.ok(finalContext.calls.some(c=>c.type==='text'&&c.text==='经理甲'));assert.ok(finalContext.calls.some(c=>c.type==='text'&&c.text==='待补充'));
assert.deepEqual(bitmapClosed,['report-1','report-2'],'decoded source bitmaps are released');
assert.equal(allContexts.filter(c=>c.calls.some(v=>v.type==='text'&&v.text.startsWith('六、面见数据明细'))).length,1,'table is painted directly into final canvas, not a potentially oversized intermediate');

const capped=E.composeLayout([{width:1500,height:5500},{width:1500,height:5500},{width:2000,height:100000}]);assert.ok(capped.height<=30000&&capped.width*capped.height<=64000000);assert.ok(Math.abs(capped.parts.reduce((n,p)=>n+p.height,0)-capped.height)<1.1,'all complete parts fit with proportional scaling and no crop');
const many=Array.from({length:750},(_,i)=>home('many-'+i,'A','维护人'+String(i).padStart(4,'0')));const last='维护人0749';
const bigBlob=await E.image({report,snapshot:{...snapshot,monthly:{stock:750,met:0,meetingCount:0},period:{met:0,meetingCount:0}},businessData:{...business,housing:many,meetings:[]}});const bigDims=JSON.parse(await bigBlob.text());assert.ok(bigDims.height<=30000);assert.ok(bigDims.width*bigDims.height<=64000000);assert.ok(allContexts.at(-1).calls.some(c=>c.type==='text'&&c.text===last),'last personal row is retained in a tall single image');assert.equal(exports,2,'each requested full export produces exactly one image');
const before=reportCalls.length;await assert.rejects(E.image({report,snapshot:{...snapshot,sourceVersion:'stale'},businessData:business}),/底表版本不一致/);assert.equal(reportCalls.length,before,'wrong-source export stops before rendering the report');
console.log('PASS: separate manager column with exact scoped lookup and loading fallback, scoped store/group/maintainer aggregates, period/month separation, dated-event deduplication, missing dates, source consistency, privacy, organization order and one complete PNG with bounded dimensions (mock canvas).');
