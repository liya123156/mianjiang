/* Account preauthorization against the unchanged legacy RPC and authorization code.
 * Local PostgreSQL only. Dependency: @electric-sql/pglite@0.5.16.
 * PGLITE_MODULE=/tmp/work-records-pglite/node_modules/@electric-sql/pglite/dist/index.js node shared-setup/test-record-collaborator-access.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { PGlite }=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const read=name=>fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');
const migration=read('database-record-collaborator-access.sql');
const setup=read('database-setup.sql'),upgrade=read('database-upgrade.sql'),code=read('database-code-access.sql');
function routine(source,name){
 const start=source.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');
 assert.ok(start>=0,'missing legacy routine '+name);
 const end=source.indexOf('$$;',start);assert.ok(end>start,'missing routine terminator '+name);
 return source.slice(start,end+3);
}
const rpc=async(token,action,args={})=>(await db.query('select public.wb_code_api($1,$2,$3::jsonb) as value',[token,action,JSON.stringify(args)])).rows[0].value;
const reject=async(fn,pattern)=>{try{await fn();assert.fail('Expected rejection');}catch(e){assert.match(e.message,pattern);}};
const fingerprint=async()=>JSON.stringify((await db.query("select proname,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname in ('wb_actor','wb_is_project','wb_can_read_scope','wb_can_write_item','wb_code_login','wb_code_api','wb_save_item','wb_import_snapshot','wb_set_period') order by proname")).rows);
try{
 await db.exec(`
  create role anon;create role authenticated;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  create table public.wb_members(email text primary key,role text not null,
   region text,store text,enabled boolean not null default true,display_name text,employee_no text,
   login_id text unique check(login_id is null or login_id~'^[0-9]{4}$'),stores jsonb not null default '[]',
   constraint wb_members_role_check check(role in ('project','region','store')),
   constraint wb_members_check check(role='project' or (role='region' and region is not null and store is null) or (role='store' and region is not null and store is not null)));
  create table public.wb_code_sessions(token_hash text primary key,email text references public.wb_members(email),expires_at timestamptz,created_at timestamptz default now());
  create table public.wb_housing(month text,house_id text,region text,store text,payload jsonb,updated_at timestamptz default now(),primary key(month,house_id));
  create table public.wb_meetings(month text,event_key text,house_id text,region text,store text,payload jsonb,updated_at timestamptz default now(),primary key(month,event_key));
  create table public.wb_items(key text primary key,month text,kind text,region text,store text,payload jsonb,updated_at timestamptz default now());
  create table public.wb_imports(id bigint generated always as identity primary key,month text,as_of date,filenames jsonb,housing_count integer,created_at timestamptz default now(),actor uuid);
  create table public.wb_snapshots(month text,as_of date,region text,store text,payload jsonb,primary key(month,as_of,store));
  create table public.wb_periods(month text,region text,store text,locked boolean default false,summary jsonb,updated_at timestamptz default now(),primary key(month,store));
  create table public.wb_audit(id bigint generated always as identity primary key,month text,region text,store text,action text,actor uuid,created_at timestamptz default now(),detail jsonb);
  create table public.wb_private_proofs(path text primary key,month text,region text,store text,name text,mime text,bytes bytea,created_at timestamptz default now());
  insert into public.wb_members(email,role,display_name,employee_no,login_id) values ('fixture:person-1','project','测试成员01','FIXTURE000001','9001');
 `);
 for(const [source,names] of [[setup,['wb_actor','wb_is_project']],[upgrade,['wb_can_read_scope','wb_can_write_item','wb_month_open','wb_import_snapshot','wb_save_item','wb_set_period']],[code,['wb_code_login','wb_code_api']]]){
  for(const name of names)await db.exec(routine(source,name));
 }
 await db.exec('revoke all on function public.wb_code_login(text),public.wb_code_api(text,text,jsonb) from public;grant execute on function public.wb_code_login(text),public.wb_code_api(text,text,jsonb) to anon,authenticated;');
 const before=fingerprint();
 await db.exec(migration);
 for(let i=2;i<=8;i++)await db.query('insert into public.wb_members(email,role,display_name,employee_no,login_id,region,store) values($1,$2,$3,$4,$5,null,null)',[
  'fixture:person-'+i,'collaborator','测试成员'+String(i).padStart(2,'0'),'FIXTURE'+String(i).padStart(6,'0'),String(9000+i)
 ]);
 assert.equal(await fingerprint(),await before,'preauthorization must not rewrite legacy login or authorization routines');
 assert.equal((await db.query("select count(*)::int as n from public.wb_members where enabled and role='collaborator' and region is null and store is null")).rows[0].n,7);
 assert.equal((await db.query("select role from public.wb_members where email='fixture:person-1'")).rows[0].role,'project');
 assert.equal((await db.query("select to_regclass('public.wb_work_records') as t,to_regprocedure('public.wb_work_records_api(text,text,jsonb)') as f")).rows[0].t,null);
 assert.equal((await db.query("select to_regprocedure('public.wb_work_records_api(text,text,jsonb)') as f")).rows[0].f,null);
 await reject(()=>db.query("insert into public.wb_members(email,role) values('fixture:invalid-region','region')"),/check constraint/);
 await reject(()=>db.query("insert into public.wb_members(email,role,region,store) values('fixture:fake-collaborator-scope','collaborator','虚构归属','虚构店')"),/check constraint/);
 await db.exec(`
  insert into public.wb_housing values('2026-11','fixture-house','测试大区','测试门店','{"private":"fixture-house-details"}',now());
  insert into public.wb_meetings values('2026-11','fixture-meeting','fixture-house','测试大区','测试门店','{"private":"fixture-feedback"}',now());
  insert into public.wb_items values('2026-11|expense|测试门店|fixture','2026-11','expense','测试大区','测试门店','{"private":"fixture-expense"}',now());
  insert into public.wb_private_proofs(path,month,region,store,name,mime,bytes) values('fixture-proof','2026-11','测试大区','测试门店','fixture.png','image/png',decode('66','hex'));
 `);
 const originalRows=JSON.stringify((await db.query('select * from public.wb_items order by key')).rows);
 const tokens=[];
 await db.exec('set role anon');
 for(let i=1;i<=8;i++){
  const login=(await db.query('select public.wb_code_login($1) as value',[String(9000+i)])).rows[0].value;
  assert.ok(login.token);assert.equal(login.member.role,i===1?'project':'collaborator');
  assert.equal(login.member.display_name,'测试成员'+String(i).padStart(2,'0'));
  assert.equal(login.member.region,null);assert.equal(login.member.store,null);tokens.push(login.token);
  const member=await rpc(login.token,'member');assert.equal(member.role,login.member.role);
  const loaded=await rpc(login.token,'load',{p_month:'2026-11'});
  if(i===1){assert.equal(loaded.housing.length,1);assert.equal(loaded.meetings.length,1);assert.equal(loaded.items.length,1);continue;}
  assert.deepEqual(loaded.housing,[]);assert.deepEqual(loaded.meetings,[]);assert.deepEqual(loaded.items,[]);
  await reject(()=>rpc(login.token,'proof-read',{path:'fixture-proof'}),/无权读取/);
  await reject(()=>rpc(login.token,'proof-upload',{p_month:'2026-11',p_region:'测试大区',p_store:'测试门店',name:'fixture.png',mime:'image/png',data:'Zg=='}),/凭证权限/);
  for(const kind of ['expense','scene','task','review'])await reject(()=>rpc(login.token,'wb_save_item',{p_month:'2026-11',p_kind:kind,p_id:'fixture-denied',p_region:'测试大区',p_store:'测试门店',p_payload:{note:'should not write'}}),/编辑权限/);
  await reject(()=>rpc(login.token,'wb_save_item',{p_month:'2026-11',p_kind:'goals',p_id:'monthly',p_payload:{}}),/仅负责人/);
  await reject(()=>rpc(login.token,'wb_import_snapshot',{p_month:'2026-11',p_as_of:'2026-11-12',p_rows:[],p_meetings:[],p_snapshots:[],p_filenames:[]}),/仅项目负责人/);
  await reject(()=>rpc(login.token,'wb_set_period',{p_month:'2026-11',p_region:'测试大区',p_store:'测试门店',p_locked:false,p_summary:{},p_reason:'test'}),/仅项目负责人/);
 }
 assert.equal((await db.query('select public.wb_code_login($1) as value',['9999'])).rows[0].value.error,'该工号尚未授权');
 await db.exec('reset role');
 assert.equal(JSON.stringify((await db.query('select * from public.wb_items order by key')).rows),originalRows,'denied collaborator writes leave legacy data unchanged');
 assert.equal((await db.query('select count(*)::int as n from public.wb_audit')).rows[0].n,0);
 await db.exec(migration);
 assert.equal((await db.query('select count(*)::int as n from public.wb_members')).rows[0].n,8);
 assert.equal(await fingerprint(),await before,'reapplying the account migration leaves legacy routines intact');
 await db.query("update public.wb_members set enabled=false where email='fixture:person-8'");
 await reject(()=>rpc(tokens[7],'member'),/会话已过期/);
 console.log('PASS account preauthorization only: 8 fixture accounts log in, 7 unscoped collaborators, project role preserved, legacy private data/expenses/import/target/settlement denied, no shared-record tables or RPC launched, old routines unchanged and reapply safe.');
}finally{await db.close();}
