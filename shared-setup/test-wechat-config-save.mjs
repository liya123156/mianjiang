/* Real local PostgreSQL tests; never connects to shared data.
 * PGLITE_MODULE=/tmp/work-records-pglite/node_modules/@electric-sql/pglite/dist/index.js node shared-setup/test-wechat-config-save.mjs
 * Dependency: @electric-sql/pglite@0.5.16.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const read=name=>fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');
const setup=read('database-setup.sql'),upgrade=read('database-upgrade.sql'),code=read('database-code-access.sql');
const legacy=read('database-manual-expenses.sql'),migration=read('database-wechat-config-save.sql');
function routine(source,name){
 const start=source.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
 assert.ok(start>=0,'missing routine '+name);
 const end=source.indexOf('$$;',start);assert.ok(end>start);
 return source.slice(start,end+3);
}
// The full financial validation and audit tail must be copied verbatim.
assert.equal(routine(migration,'wb_save_item').split(' manual_key:=')[1],routine(legacy,'wb_save_item').split(' manual_key:=')[1]);
const context={console,TextEncoder,Blob,Uint8Array,DataView,Map,Set,Intl};context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../operations/core.js',import.meta.url),'utf8'),context);
vm.runInContext(fs.readFileSync(new URL('../operations/send-package.js',import.meta.url),'utf8'),context);
const initial=JSON.parse(JSON.stringify(context.WBSendPackage.projectConfigDefaults()));
assert.equal(initial.stores.length,18);assert.equal(initial.regions.length,5);
const clone=value=>JSON.parse(JSON.stringify(value));
const rpc=async(token,action,args={})=>(await db.query('select public.wb_code_api($1,$2,$3::jsonb) as value',[token,action,JSON.stringify(args)])).rows[0].value;
const args=(payload,changes={})=>({p_month:'2000-01',p_kind:'rules',p_id:'wechat-send-config-v1',p_region:null,p_store:null,p_payload:payload,...changes});
const save=(token,payload,changes={})=>rpc(token,'wb_save_item',args(payload,changes));
let checks=0;
const ok=(condition,label)=>{assert.ok(condition,label);checks++;};
const rejected=async(fn,pattern,label)=>{await assert.rejects(fn,pattern,label);checks++;};
try{
 await db.exec(`
  create role anon;create role authenticated;create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  create table public.wb_members(email text primary key,role text,region text,store text,enabled boolean default true,display_name text,login_id text unique,stores jsonb default '[]');
  create table public.wb_code_sessions(token_hash text primary key,email text references public.wb_members(email),expires_at timestamptz,created_at timestamptz default now());
  create table public.wb_housing(month text,house_id text,region text,store text,payload jsonb,primary key(month,house_id));
  create table public.wb_meetings(month text,event_key text,region text,store text,payload jsonb);
  create table public.wb_items(key text primary key,month text,kind text,region text,store text,payload jsonb,updated_at timestamptz default now());
  create table public.wb_imports(month text,as_of date,created_at timestamptz default now());
  create table public.wb_snapshots(month text,as_of date,region text,store text,payload jsonb);
  create table public.wb_periods(month text,region text,store text,locked boolean default false,summary jsonb,updated_at timestamptz default now());
  create table public.wb_audit(id bigint generated always as identity primary key,month text,region text,store text,action text,actor uuid,created_at timestamptz default now(),detail jsonb);
  create table public.wb_private_proofs(path text primary key,month text,region text,store text,name text,mime text,bytes bytea);
  insert into public.wb_members(email,role,region,store,display_name,login_id) values
   ('fixture-project','project',null,null,'测试负责人','9001'),
   ('fixture-region','region','花木大区',null,'测试大区','9002'),
   ('fixture-store','store','花木大区','仁恒河滨城店','测试门店','9003'),
   ('fixture-collaborator','collaborator',null,null,'测试协作','9004');
 `);
 for(const [source,names] of [[setup,['wb_actor','wb_is_project']],[upgrade,['wb_can_read_scope','wb_can_write_item','wb_month_open']],[code,['wb_code_login','wb_code_api']]]){
  for(const name of names)await db.exec(routine(source,name));
 }
 await db.exec(legacy);
 const legacyRule={key:'2026-11|rules|仁恒河滨城店|fee-rule',month:'2026-11',kind:'rules',region:'花木大区',store:'仁恒河滨城店',payload:{split:'existing'}};
 await db.query('insert into wb_items(key,month,kind,region,store,payload) values($1,$2,$3,$4,$5,$6::jsonb)',[legacyRule.key,legacyRule.month,legacyRule.kind,legacyRule.region,legacyRule.store,JSON.stringify(legacyRule.payload)]);
 const before=JSON.stringify((await db.query('select * from wb_items order by key')).rows);
 const unaffectedNames=['wb_actor','wb_is_project','wb_can_read_scope','wb_can_write_item','wb_month_open','wb_code_login','wb_code_api'];
 const fingerprint=async()=>JSON.stringify((await db.query('select proname,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname=any($1::text[]) order by proname',[unaffectedNames])).rows);
 const oldFunctions=await fingerprint();
 await db.exec(migration);await db.exec(migration);
 ok(await fingerprint()===oldFunctions,'all authorization, login and other RPC functions unchanged');
 ok(JSON.stringify((await db.query('select * from wb_items order by key')).rows)===before,'migration and rerun do not mutate existing records');
 await db.exec('revoke all on function wb_code_login(text),wb_code_api(text,text,jsonb) from public;grant execute on function wb_code_login(text),wb_code_api(text,text,jsonb) to anon,authenticated;');
 const tokens=[];
 await db.exec('set role anon');
 for(const codeValue of ['9001','9002','9003','9004'])tokens.push((await db.query('select wb_code_login($1) as value',[codeValue])).rows[0].value.token);
 const project=tokens[0];
 const first=await save(project,initial);
 ok(first.key==='2000-01|rules|@@company|wechat-send-config-v1'&&first.region===null&&first.store===null,'project saves exact global config key');
 ok(first.payload.stores.every(row=>row.groupName==='')&&first.payload.regions.every(row=>row.groupName==='')&&first.payload.company.groupName==='','all 24 blank group names are valid drafts');
 const loaded=await rpc(project,'load',{p_month:'2000-01'});
 ok(loaded.items.length===1&&loaded.items[0].key===first.key,'project can reload persisted config through unchanged employee-code API');
 for(let i=1;i<tokens.length;i++){
  await rejected(()=>save(tokens[i],initial),/仅负责人/,'nonproject role cannot save global config');
  ok((await rpc(tokens[i],'load',{p_month:'2000-01'})).items.length===0,'nonproject role cannot read global config through API');
 }
 await rejected(()=>save('invalid-session',initial),/会话已过期/,'unverified session denied');
 await rejected(()=>save(project,initial),/其他成员更新/,'existing config cannot be overwritten without expected timestamp');
 await rejected(()=>save(project,initial,{p_expected_updated_at:'2000-01-01T00:00:00Z'}),/其他成员更新/,'stale expected timestamp denied');
 const configured=clone(initial);configured.company.groupName='全司店总群☀️';configured.regions[0].groupName='花木店总群';configured.stores[0].groupName='新①店冠军经理群🏆🥂';
 const second=await save(project,configured,{p_expected_updated_at:first.updated_at});
 ok(second.payload.company.groupName===configured.company.groupName&&second.payload.stores[0].groupName===configured.stores[0].groupName,'valid names preserve emoji and punctuation with optimistic update');
 await rejected(()=>save(project,configured,{p_expected_updated_at:first.updated_at}),/其他成员更新/,'previous version cannot overwrite new group names');
 for(const [changes,pattern] of [
  [{p_id:'other-rules'},/费用规则须选择单店/],
  [{p_month:'2026-11'},/费用规则须选择单店/],
  [{p_region:'花木大区'},/费用规则须选择单店/],
  [{p_store:''},/费用规则须选择单店/],
  [{p_kind:'expense'},/编辑权限/],
  [{p_kind:'review'},/编辑权限/],
  [{p_month:null},/月份或记录类型/],
  [{p_kind:null},/月份或记录类型/],
 ])await rejected(()=>save(project,configured,changes),pattern,'wrong month/key/kind/scope does not use exception');
 const mutations=[
  [p=>null,/记录内容/],[p=>[],/记录内容/],
  [p=>({...p,version:1}),/结构或版本/],[p=>({...p,version:'2'}),/结构或版本/],
  [p=>({...p,recordType:'expense'}),/结构或版本/],[p=>({...p,recordType:null}),/结构或版本/],
  [p=>({...p,mode:'anything'}),/结构或版本/],[p=>({...p,mode:null}),/结构或版本/],
  [p=>({...p,company:null}),/结构或版本/],[p=>({...p,regions:{}}),/结构或版本/],
  [p=>({...p,stores:[]}),/5个大区和18家/],[p=>({...p,regions:[]}),/5个大区和18家/],
  [p=>({...p,company:{}}),/5个大区和18家/],[p=>({...p,company:{groupName:3}}),/5个大区和18家/],
  [p=>({...p,extra:'not-config'}),/结构或版本/],
  [p=>{p.stores[1]=clone(p.stores[0]);return p;},/门店群配置无效/],
  [p=>{p.stores[0].store='Hmall中心店';return p;},/门店群配置无效/],
  [p=>{p.stores[0].region='黄浦大区';return p;},/大区不匹配/],
  [p=>{p.regions[1]=clone(p.regions[0]);return p;},/大区群配置无效/],
  [p=>{p.regions[0].region='虚构大区';return p;},/大区群配置无效/],
  [p=>{p.stores[0].groupName=null;return p;},/门店群配置字段/],
  [p=>{p.company.groupName='重复群';p.stores[0].groupName='重复群';return p;},/无效或重复/],
  [p=>{p.company.groupName=' 前后空格';return p;},/无效或重复/],
  [p=>{p.regions[0].groupName='换\n行';return p;},/无效或重复/],
  [p=>{p.stores[0].groupName='a'.repeat(201);return p;},/无效或重复/],
  [p=>({...p,pilotStores:null}),/结构或版本/],
  [p=>({...p,mode:'pilot',pilotStores:[]}),/试行名单/],
  [p=>({...p,pilotStores:['碧云店']}),/试行名单/],
  [p=>({...p,pilotStores:['仁恒河滨城店','仁恒河滨城店']}),/试行名单/],
 ];
 for(const [mutate,pattern]of mutations)await rejected(()=>save(project,mutate(clone(configured)),{p_expected_updated_at:second.updated_at}),pattern,'malformed payload denied');
 const pilot=clone(configured);pilot.mode='pilot';pilot.pilotStores=[pilot.stores[0].store];
 const third=await save(project,pilot,{p_expected_updated_at:second.updated_at});
 ok(third.payload.pilotStores.length===1,'existing pilot metadata remains compatible');
 // Old fee rules are still single-store and still obey the locked month.
 await rejected(()=>save(project,{split:'fee'},{p_month:'2026-11',p_id:'ordinary-fee-rule'}),/费用规则须选择单店/,'ordinary global expense rules still rejected');
 const financeArgs={p_month:'2026-11',p_kind:'rules',p_id:'new-fee-rule',p_region:'花木大区',p_store:'仁恒河滨城店'};
 const fee=await save(project,{split:'fee'},financeArgs);
 ok(fee.store==='仁恒河滨城店','ordinary single-store fee rule still saves');
 await db.exec('reset role');
 await db.exec("insert into wb_periods(month,region,store,locked) values('2026-11','花木大区','仁恒河滨城店',true),('2000-01','花木大区','仁恒河滨城店',true)");
 await db.exec('set role anon');
 await rejected(()=>save(project,{split:'fee2'},{...financeArgs,p_expected_updated_at:fee.updated_at}),/已锁定/,'ordinary fee rule still respects ledger lock');
 const fourth=await save(project,configured,{p_expected_updated_at:third.updated_at});
 ok(fourth.payload.mode==='all','global publication config is independent of store ledger locks');
 await rejected(()=>db.query('select public.wb_save_item($1,$2,$3,$4,$5,$6::jsonb)', ['2000-01','rules','wechat-send-config-v1',null,null,JSON.stringify(configured)]),/permission denied/,'anonymous direct save function remains revoked');
 await db.exec('reset role');
 const audit=(await db.query("select * from wb_audit where month='2000-01' and action='save-rules' order by id")).rows;
 ok(audit.length===4&&audit.every(row=>row.detail.key===first.key&&row.actor!==null),'successful global config writes retain existing audit trail');
 const preserved=(await db.query('select payload from wb_items where key=$1',[legacyRule.key])).rows[0].payload;
 ok(JSON.stringify(preserved)===JSON.stringify(legacyRule.payload),'historical finance payload remains unchanged');
 console.log(`PASS ${checks} PostgreSQL checks: exact project-only config save/read, 24 blank names, strict payload/catalog, role rejection, optimistic conflict, audit, old fee scopes/locks and grants preserved.`);
}catch(error){console.error(error.message);if(error.where)console.error(error.where);process.exitCode=1;}finally{await db.close();}
