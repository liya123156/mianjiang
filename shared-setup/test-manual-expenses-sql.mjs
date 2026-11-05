// Local PostgreSQL regression tests; does not connect to or change shared data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const modulePath=process.env.PGLITE_MODULE||new URL('../../plan-sql-test/node_modules/@electric-sql/pglite/dist/index.js',import.meta.url).href;
const {PGlite}=await import(modulePath);
const db=new PGlite();let passed=0;
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const base=read('database-setup.sql'),upgrade=read('database-upgrade.sql'),migration=read('database-manual-expenses.sql');
function fn(sql,name){const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert.ok(start>=0,name);const end=sql.indexOf('$$;',sql.indexOf('AS $$',start));return sql.slice(start,end+3);}
function ok(value,label){assert.ok(value,label);passed++;console.log('PASS',label);}
async function fail(call,pattern,label){await assert.rejects(call,pattern);passed++;console.log('PASS',label);}
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE TABLE wb_members(email text PRIMARY KEY,role text,region text,store text,enabled boolean DEFAULT true,stores jsonb DEFAULT '[]');
CREATE TABLE wb_items(key text PRIMARY KEY,month text,kind text,region text,store text,payload jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE wb_housing(month text,house_id text,region text,store text,payload jsonb,PRIMARY KEY(month,house_id));
CREATE TABLE wb_periods(month text,store text,locked boolean DEFAULT false);
CREATE TABLE wb_audit(id bigint GENERATED ALWAYS AS IDENTITY,month text,region text,store text,action text,actor uuid,detail jsonb);
INSERT INTO wb_members(email,role,region,store,stores) VALUES
 ('project','project',null,null,'[]'),('store','store','一区','甲店','[]'),('other','store','二区','乙店','[]'),
 ('multi','store','一区','甲店','[{"region":"二区","store":"乙店"}]');
INSERT INTO wb_housing VALUES ('2026-11','known','一区','甲店','{"本月是否送礼物":false}'),('2026-11','elsewhere','二区','乙店','{}');
`);
await db.exec(fn(base,'wb_actor')+fn(base,'wb_is_project')+fn(upgrade,'wb_can_read_scope')+fn(upgrade,'wb_can_write_item')+fn(upgrade,'wb_month_open')+fn(upgrade,'wb_save_item'));
async function actor(email,role='authenticated'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({email,sub:'00000000-0000-0000-0000-000000000001'})]);await db.exec('SET ROLE '+role);}
const month='2026-11',region='一区',store='甲店';let seq=0;
const newId=()=>`@@gift:00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
const payload=(id,changes={})=>({recordType:'gift',source:'manual',expenseId:id,houseId:id.startsWith('@@')?'':id,project:'测试小区'+id,room:'1-101',priceCents:1800,quantity:1,bpVerified:true,...changes});
async function save(id,p,options={}){return (await db.query('SELECT public.wb_save_item($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) result',[options.month||month,options.kind||'expense',id,options.region||region,options.store||store,JSON.stringify(p),options.expected||null])).rows[0].result;}
await actor('project');
const legacy=await save('known',{houseId:'known',project:'已导入小区',room:'2-102',priceCents:1800,payer:'旧付款人'});
await db.exec('RESET ROLE');
await db.exec(migration);
const before=(await db.query('SELECT payload,updated_at::text FROM wb_items WHERE key=$1',[legacy.key])).rows[0];
await db.exec(migration);
ok(JSON.stringify((await db.query('SELECT payload,updated_at::text FROM wb_items WHERE key=$1',[legacy.key])).rows[0])===JSON.stringify(before),'migration and rerun preserve historical records');
await actor('store');
const id=newId();let saved=await save(id,payload(id,{quantity:3,payer:'',advisor:'',manager:'',proofPath:''}));
ok(saved.payload.houseId===''&&saved.payload.quantity===3&&saved.payload.priceCents===1800,'verified manual gift without housing or names/proof saved for later completion');
let defaultId=newId(),defaultPayload=payload(defaultId);delete defaultPayload.quantity;
ok((await save(defaultId,defaultPayload)).payload.quantity===1,'legacy omitted quantity defaults to one');
await fail(()=>save(newId(),payload(newId())),/编号或类型/,'manual key must match payload expenseId');
for(const [change,pattern,label] of [
 [{bpVerified:false},/核实/,'unverified manual blocked'],[{bpVerified:'true'},/核实/,'string verification blocked'],
 [{project:'  '},/小区/,'blank address blocked'],[{room:'\u00a0'},/小区/,'blank room blocked'],
 [{priceCents:0},/单价/,'zero price blocked'],[{priceCents:-1},/单价/,'negative price blocked'],[{priceCents:1.1},/单价/,'fractional cents blocked'],[{priceCents:'1800'},/单价/,'text price blocked'],[{priceCents:true},/单价/,'boolean price blocked'],
 [{quantity:0},/数量/,'zero quantity blocked'],[{quantity:1.5},/数量/,'fractional quantity blocked'],[{quantity:10001},/数量/,'excess quantity blocked'],[{quantity:null},/数量/,'null quantity blocked'],[{quantity:true},/数量/,'boolean quantity blocked'],
 [{priceCents:9007199254740991,quantity:2},/总额/,'unsafe total blocked'],
 [{giftDate:'2026-11-31'},/日期/,'invalid calendar date blocked'],[{giftDate:'2026-10-01'},/月份/,'cross-month date blocked'],
 [{giftDate:'2026-11-5'},/格式/,'non-ISO date blocked'],[{proofPath:'2026-11/二区/乙店/proof.png'},/凭证/,'cross-store proof blocked'],
 [{houseId:'changed'},/编号或类型/,'UUID key cannot acquire a house ID'],[{source:'system'},/编号或类型/,'manual UUID source is immutable']
]){const next=newId();await fail(()=>save(next,payload(next,change)),pattern,label);}
await fail(()=>save('@@cash:fake',{...payload('@@cash:fake'),recordType:'gift'}),/其他账目类型/,'gift cannot bypass checks using cash namespace');
await fail(()=>save('@@gift:bad',payload('@@gift:bad')),/编号或类型/,'malformed manual ID rejected');
let datedId=newId();ok((await save(datedId,payload(datedId,{giftDate:'2026-11-05',proofPath:'2026-11/一区/甲店/proof.png'}))).payload.giftDate==='2026-11-05','valid date and scoped proof saved');
await fail(()=>save(id,payload(id)),/其他成员更新/,'repeat create does not overwrite existing record');
saved=await save(id,{...saved.payload,payer:'已补付款人'}, {expected:saved.updated_at});
ok(saved.payload.payer==='已补付款人','manual entry completes with optimistic version');
await fail(()=>save(id,payload(id),{expected:'2000-01-01T00:00:00Z'}),/其他成员更新/,'stale manual update rejected');
const missingId=newId();await fail(()=>save(missingId,payload(missingId),{expected:saved.updated_at}),/状态已变化/,'update of missing record rejected');
let addressId=newId();await save(addressId,payload(addressId,{project:' ＡＢＣ 小区 ',room:'１－１０１'}));
let dupId=newId();await fail(()=>save(dupId,payload(dupId,{project:'abc小区',room:'1-101'})),/相同房源/,'normalized full-width/case/whitespace duplicate rejected');
await fail(()=>save('later-import',payload('later-import',{project:'abc小区',room:'1-101'})),/相同房源/,'real ID cannot duplicate prior no-ID manual address');
const linked=await save('new-canonical',payload('new-canonical',{project:'另一小区',room:'3-301'}));
ok(linked.payload.houseId==='new-canonical','verified absent-housing real ID uses canonical expense key');
let reverseId=newId();await fail(()=>save(reverseId,payload(reverseId,{project:'另一小区',room:'3-301'})),/相同房源/,'no-ID record cannot duplicate canonical manual address');
ok((await save('different-real-id',payload('different-real-id',{project:'另一小区',room:'3-301'}))).payload.houseId==='different-real-id','distinct real IDs remain distinct despite identical labels');
await fail(()=>save('system-missing',{houseId:'system-missing',priceCents:1800}),/底表/,'ordinary system record still requires housing');
await fail(()=>save('elsewhere',payload('elsewhere')),/底表/,'manual flag cannot take another store housing');
let updatedLegacy=await save('known',{...legacy.payload,priceCents:2000},{expected:legacy.updated_at});
ok(updatedLegacy.payload.quantity===1&&!updatedLegacy.payload.bpVerified,'legacy canonical record editable without manual-only fields');
await db.exec('RESET ROLE');await db.exec("INSERT INTO wb_housing VALUES ('2026-11','no-gift-flag','一区','甲店','{\"本月是否送礼物\":false}')");await actor('store');
ok((await save('no-gift-flag',payload('no-gift-flag'))).payload.houseId==='no-gift-flag','existing housing can be added even without system gift flag');
let otherId=newId();await fail(()=>save(otherId,payload(otherId),{region:'二区',store:'乙店'}),/编辑权限/,'store cannot write other store');
await actor('project');await fail(()=>save('new-canonical',payload('new-canonical'),{region:'二区',store:'乙店'}),/已登记费用/,'project also cannot double-register real house ID across stores');
await actor('multi');let multiId=newId();ok((await save(multiId,payload(multiId),{region:'二区',store:'乙店'})).store==='乙店','existing approved multi-store scope still works');
await actor('unknown');let unknownId=newId();await fail(()=>save(unknownId,payload(unknownId)),/编辑权限/,'unapproved identity cannot write');
await actor('store','anon');await fail(()=>save(newId(),{}),/permission denied/,'anonymous direct RPC remains denied');
await db.exec('RESET ROLE');await db.exec("INSERT INTO wb_periods VALUES ('2026-11','甲店',true)");await actor('store');let lockedId=newId();await fail(()=>save(lockedId,payload(lockedId)),/已锁定/,'closed period rejects new manual expense');
await fail(()=>save(id,saved.payload,{expected:saved.updated_at}),/已锁定/,'closed period rejects existing expense edits');
await db.exec('RESET ROLE');await db.exec("UPDATE wb_periods SET locked=false");await actor('store');
ok((await save('@@cash:fixture',{recordType:'cash',amount:1800})).payload.amount===1800,'cash entry remains outside gift validation');
ok((await save('@@head',{storeHead:'店总'})).payload.storeHead==='店总','ledger head remains outside gift validation');
ok((await save('task-fixture',{title:'原有行动'},{kind:'task'})).payload.title==='原有行动','other workbench record kinds unchanged');
await db.exec('RESET ROLE');
ok((await db.query("SELECT count(*)::int n FROM wb_audit WHERE action='save-expense'")).rows[0].n>0,'successful writes retain audit trail');
const definition=(await db.query("SELECT pg_get_functiondef('public.wb_save_item(text,text,text,text,text,jsonb,timestamptz)'::regprocedure) def")).rows[0].def;
ok(definition.includes("'ledger:'")&&definition.includes("'gift:'")&&definition.includes('pg_advisory_xact_lock'),'month-store and cross-store house locks present');
console.log(`${passed} manual expense SQL checks passed`);await db.close();
