/* Optional allocation contract and migration preserve the existing secured API. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const x={window:null,Intl,Date};x.window=x;vm.createContext(x);
for(const name of ['core','store-review-model','company-week-plan'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const W=x.WBCompanyWeekPlan,catalog=x.WBModel.storeCatalog.filter(s=>s.ownerApplicable!==false),basis=catalog.map(s=>({...s,monthlyTarget:20,monthlyMet:1})),allocation=W.allocationPayload(W.allocateTargets(basis,120)),calculation={monthlyTarget:360,monthlyMet:18,remainingGap:342,remainingDays:15,periodDays:7,suggestedTarget:160};
assert.ok(W.validateAllocation(allocation,120,calculation));
const copy=()=>JSON.parse(JSON.stringify(allocation)),reject=(edit,message)=>{const value=copy();edit(value);assert.equal(W.validateAllocation(value,120,calculation),null,message);};
for(const value of [null,[],{},1,'allocation'])assert.equal(W.validateAllocation(value,120,calculation),null);
reject(a=>a.version=2,'unknown allocation version');reject(a=>a.version='1','numeric version required');reject(a=>a.extra=true,'allocation extra fields');reject(a=>a.stores.pop(),'all18 stores required');reject(a=>a.stores.push(a.stores[0]),'no19th store');reject(a=>a.stores[1]=a.stores[0],'no duplicate store');reject(a=>a.stores[0].store='未知门店','catalog identity required');reject(a=>a.stores[0].region='未知大区','store and region must match');reject(a=>a.stores[0].extra=true,'row extra fields');reject(a=>delete a.stores[0].remainingGap,'row missing field');
for(const key of ['monthlyTarget','monthlyMet','remainingGap','weeklyTarget'])for(const value of [-1,.5,'1',null,10000001])reject(a=>a.stores[0][key]=value,key+' must be an in-range integer');
reject(a=>a.stores[0].monthlyTarget=10001,'monthly store target capped');reject(a=>a.stores[0].weeklyTarget=10001,'weekly store target capped');reject(a=>a.stores[0].remainingGap++,'gap matches source facts');reject(a=>a.stores[0].weeklyTarget=20,'weekly target cannot exceed gap');reject(a=>a.stores[0].weeklyTarget++,'weekly total matches the chosen goal');
assert.equal(W.validateAllocation(allocation,121,calculation),null);assert.equal(W.validateAllocation(allocation,120,{...calculation,monthlyTarget:361}),null);assert.equal(W.validateAllocation(allocation,120,{...calculation,monthlyMet:19}),null);assert.equal(W.validateAllocation(allocation,null,calculation),null);
assert.equal(W.stripAllocationBlocks('策略正文\n\n五、五大区承接\n花木大区：19套；陆家嘴大区：44套。\n\n六、本周目标分解\n门店：本周1套｜月目标2套｜已面见0套｜月余2套\n\n七、继续保留的业务策略\n下一条行动'),'策略正文\n\n七、继续保留的业务策略\n下一条行动','legacy removal stops before the next unrelated strategy section');

const sql=fs.readFileSync(new URL('./database-company-week-allocation.sql',import.meta.url),'utf8'),sqlCatalog=JSON.parse(sql.match(/allocation_catalog jsonb:='([\s\S]*?)'::jsonb;/)[1]);
assert.deepEqual(sqlCatalog,Object.fromEntries(catalog.map(s=>[s.store,s.region])),'server and client share the exact18-store owner-meeting scope');
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);assert.doesNotMatch(sql,/\b(?:CREATE TABLE|ALTER TABLE|GRANT |REVOKE |DROP )/i,'the migration only extends the existing function body');
assert.match(sql,/IF body \? 'allocation' THEN/,'allocation remains optional');assert.match(sql,/jsonb_array_length\(allocation->'stores'\)<>18/);assert.match(sql,/allocation_week_total<>\(body->>'target'\)::numeric/);assert.match(sql,/allocation_month_target_total<>\(calc->>'monthlyTarget'\)::numeric/);assert.match(sql,/allocation_month_met_total<>\(calc->>'monthlyMet'\)::numeric/);

// Restore the pre-change function text and compare its known deployed definition.
// This protects all original permissions, source-version checks, concurrency
// locks and audit behavior without requiring a production database in tests.
let original=sql.slice(sql.indexOf('CREATE OR REPLACE')).trim();
original=original.replace(/\n -- Optional allocation is a frozen quantitative snapshot, separate from strategy prose\.[\s\S]*?\nBEGIN/,'\nBEGIN');
original=original.replace("'calculation','status','allocation']","'calculation','status']");
original=original.replace(/\n\n -- Missing allocation keeps the original payload contract backward compatible\.[\s\S]*?\n BEGIN expected_time:=/,'\n BEGIN expected_time:=');
assert.equal(createHash('sha256').update(original).digest('hex'),'0166edc28f034d3031aa05859b4b6d05b5fff24af9e379d0bddbd6331dff1a12','only allocation declarations, optional whitelist and validation may change');
console.log('PASS company allocation contract: exact18 identities, strict version/keys/numbers/gaps/totals, optional compatibility, legacy prose boundaries, server/client catalog parity and byte-preserved original authorization/source/concurrency/audit logic.');
