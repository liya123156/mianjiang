/* Real isolated PostgreSQL tests, never connects to shared data.
 * PGLITE_MODULE=/tmp/work-records-pglite/node_modules/@electric-sql/pglite/dist/index.js node shared-setup/test-company-week-plans-db.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;
const read=n=>fs.readFileSync(new URL('./'+n,import.meta.url),'utf8');
const routine=(source,name)=>{const s=source.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert.ok(s>=0);return source.slice(s,source.indexOf('$$;',s)+3);};
const clone=x=>JSON.parse(JSON.stringify(x)),md5=x=>crypto.createHash('md5').update(x).digest('hex');
const ok=(condition,label)=>{assert.ok(condition,label);checks++;};
const denied=async(fn,pattern,label)=>{await assert.rejects(fn,pattern,label);checks++;};
const rpc=async(token,action,args={})=>(await db.query('select public.wb_company_week_plan_api($1,$2,$3::jsonb) as value',[token,action,JSON.stringify(args)])).rows[0].value;
const calculation={monthlyTarget:300,monthlyMet:98,remainingGap:202,remainingDays:18,periodDays:7,suggestedTarget:79};
const base={month:'2026-11',periodStart:'2026-11-16',periodEnd:'2026-11-22',payload:{target:79,strategyText:'测试核心策略：优先对接未面见TOP房较多的小组。',sourceAsOf:'2026-11-12',sourceVersion:'2026-11-13T00:59:41.728675+00:00',calculation,status:'draft'},expectedUpdatedAt:null};
const args=(patch={})=>({...clone(base),...patch});
try{
 await db.exec(`
  create role anon;create role authenticated;create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
  create table public.wb_members(email text primary key,role text,region text,store text,enabled boolean default true,display_name text,login_id text unique,stores jsonb default '[]');
  create table public.wb_code_sessions(token_hash text primary key,email text references public.wb_members(email),expires_at timestamptz,created_at timestamptz default now());
  create table public.wb_items(key text primary key,month text,kind text,region text,store text,payload jsonb,updated_at timestamptz default now());
  create table public.wb_imports(month text,as_of date,created_at timestamptz default now(),housing_count integer default 0);
  create table public.wb_audit(id bigint generated always as identity primary key,month text,region text,store text,action text,actor uuid,created_at timestamptz default now(),detail jsonb);
  create table public.wb_housing(month text,house_id text,region text,store text,payload jsonb,primary key(month,house_id));
  create table public.wb_meetings(month text,event_key text,house_id text,region text,store text,payload jsonb,primary key(month,event_key));
  create table public.wb_snapshots(month text,as_of date,region text,store text,payload jsonb);
  create table public.wb_periods(month text,region text,store text,locked boolean,summary jsonb,updated_at timestamptz);
  create table public.wb_private_proofs(path text primary key,month text,region text,store text,name text,mime text,bytes bytea);
  insert into wb_items values('finance-sentinel','2026-11','expense','花木大区','仁恒河滨城店','{"secret":"payment-detail"}',now());
  insert into wb_items values('store-review-sentinel','2026-11','review','花木大区','仁恒河滨城店','{"recordType":"store-period-review","fields":{"actions":"private-store-action"}}',now());
  insert into wb_items values('global-unvalidated','2026-11','review',null,null,'{"recordType":"company-week-plan","secret":"legacy-unvalidated"}',now());
  insert into wb_items values('goals','2026-11','goals',null,null,'{"recordType":"monthly","company":300}',now());
  insert into wb_imports values('2026-11','2026-11-12','2026-11-13T00:59:41.728675+00:00'),('2026-11','2026-11-30','2026-12-01T00:00:00+00:00');
 `);
 const ids=['0003','0921','1317','1446','3401','3448','3273','0562'];
 for(let i=0;i<ids.length;i++)await db.query('insert into wb_members(email,role,display_name,login_id) values($1,$2,$3,$4)',['fixture-'+ids[i],i===1?'project':'collaborator','测试成员'+(i+1),ids[i]]);
 await db.exec("insert into wb_members(email,role,display_name,login_id) values('extra-project','project','其他负责人','9999')");
 const setup=read('database-setup.sql'),upgrade=read('database-upgrade.sql'),code=read('database-code-access.sql');
 for(const [source,names] of [[setup,['wb_actor','wb_is_project']],[upgrade,['wb_can_read_scope','wb_can_write_item','wb_month_open']],[code,['wb_code_login','wb_code_api','wb_public_daily']]])for(const name of names)await db.exec(routine(source,name));
 await db.exec(read('database-manual-expenses.sql'));await db.exec(read('database-store-reviews.sql'));
 await db.exec('revoke all on function public.wb_code_login(text),public.wb_code_api(text,text,jsonb),public.wb_public_daily(text) from public;grant execute on function public.wb_code_login(text),public.wb_code_api(text,text,jsonb),public.wb_public_daily(text) to anon,authenticated;');
 const fingerprint=async()=>JSON.stringify((await db.query("select proname,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname in ('wb_actor','wb_is_project','wb_can_read_scope','wb_can_write_item','wb_month_open','wb_code_login','wb_code_api','wb_public_daily','wb_save_item','wb_store_review_api') order by proname")).rows);
 const beforeFunctions=await fingerprint(),beforeItems=JSON.stringify((await db.query('select * from wb_items order by key')).rows);
 const migration=read('database-company-week-plans.sql');await db.exec(migration);await db.exec(migration);
 ok(await fingerprint()===beforeFunctions,'all existing authorization, finance, store-review and login code unchanged');
 ok(JSON.stringify((await db.query('select * from wb_items order by key')).rows)===beforeItems,'migration and rerun leave all existing rows intact');
 ok((await db.query("select to_regclass('public.wb_work_records') as t")).rows[0].t===null,'shared work records stay uninstalled');
 await db.exec('set role anon');
 const tokens=[];for(const id of ids)tokens.push((await db.query('select wb_code_login($1) as value',[id])).rows[0].value.token);
 const extra=(await db.query("select wb_code_login('9999') as value")).rows[0].value.token;
 await denied(()=>rpc(null,'load',{month:'2026-11'}),/授权工号/,'unauthenticated load rejected');
 await denied(()=>rpc('fake-session','load',{month:'2026-11'}),/授权工号/,'forged session rejected');
 await denied(()=>rpc(extra,'load',{month:'2026-11'}),/授权工号/,'unapproved project member rejected');
 for(let i=0;i<tokens.length;i++){
  const loaded=await rpc(tokens[i],'load',{month:'2026-11'});
  ok(loaded.items.length===0&&!/payment-detail|private-store-action|legacy-unvalidated/.test(JSON.stringify(loaded)),'approved member sees only validated company plans');
  if(i!==1)await denied(()=>rpc(tokens[i],'save',args()),/仅项目负责人/,'collaborator cannot save company plan');
 }
 await denied(()=>db.query('select * from wb_items'),/permission denied/,'anonymous direct table reads remain denied');
 const lead=tokens[1],first=await rpc(lead,'save',args());
 ok(first.key==='2026-11|review|@@company|company-week-plan:2026-11-16:2026-11-22'&&first.region===null&&first.store===null,'server derives stable global period key');
 ok(first.payload.recordType==='company-week-plan'&&first.payload.periodStart==='2026-11-16'&&first.payload.periodEnd==='2026-11-22','server metadata follows front-end period contract');
 ok(first.payload.updatedBy==='测试成员2'&&!JSON.stringify(first).includes('0921'),'display attribution comes from member name, no login identifier');
 for(const token of tokens){const loaded=await rpc(token,'load',{month:'2026-11'});ok(loaded.items.length===1&&loaded.items[0].payload.target===79,'all eight approved members can read saved company plan');}
 await denied(()=>rpc(lead,'save',args()),/已被更新/,'existing plan cannot be overwritten without version');
 await denied(()=>rpc(lead,'save',args({expectedUpdatedAt:'2000-01-01T00:00:00Z'})),/已被更新/,'stale plan update rejected');
 const changed=args({expectedUpdatedAt:first.updated_at});changed.payload.target=85;changed.payload.strategyText='审核后提高目标，并调整核心举措。';changed.payload.status='confirmed';
 const second=await rpc(lead,'save',changed);ok(second.payload.target===85&&second.payload.calculation.suggestedTarget===79&&second.payload.status==='confirmed','human may adjust target independently of unchanged suggested value');
 await denied(()=>rpc(lead,'save',args({expectedUpdatedAt:first.updated_at})),/已被更新/,'previous saved version cannot overwrite current plan');
 const malformed=[
  [a=>({...a,month:null}),/月份/],[a=>({...a,month:'2026-13'}),/月份/],[a=>({...a,periodStart:null}),/日期/],
  [a=>({...a,periodStart:'2026-11-31'}),/日期/],[a=>({...a,periodStart:'2026-10-31'}),/当月内/],
  [a=>({...a,periodEnd:'2026-11-23'}),/最多7天/],[a=>({...a,periodEnd:'2026-12-01'}),/当月内/],
  [a=>({...a,periodEnd:'2026-11-15'}),/最多7天/],[a=>({...a,region:'花木大区'}),/保存参数/],
  [a=>{a.payload.extra='unknown';return a;},/内容/],[a=>{a.payload.status='done';return a;},/内容/],
  [a=>{delete a.payload.target;return a;},/内容/],[a=>{a.payload.strategyText=null;return a;},/内容/],
  [a=>{a.payload.strategyText='x'.repeat(12001);return a;},/内容/],[a=>{a.payload.target=-1;return a;},/0至10000/],
  [a=>{a.payload.target=1.5;return a;},/0至10000/],[a=>{a.payload.target=10001;return a;},/0至10000/],
  [a=>{a.payload.target='80';return a;},/整数或待确认/],[a=>{a.payload.sourceAsOf='';return a;},/来源格式/],
  [a=>{a.payload.sourceAsOf='2026-11-31';return a;},/来源日期/],[a=>{a.payload.sourceAsOf='2026-09-30';return a;},/当月或上月/],
  [a=>{a.payload.sourceVersion='';return a;},/来源格式/],[a=>{a.payload.sourceVersion='fake';return a;},/来源日期或版本/],
  [a=>{a.payload.sourceVersion='2026-11-13T02:00:00Z';return a;},/已导入/],
  [a=>{a.payload.calculation=[];return a;},/测算字段/],[a=>{a.payload.calculation.extra=1;return a;},/测算字段/],
  [a=>{delete a.payload.calculation.periodDays;return a;},/测算字段/],[a=>{a.payload.calculation.monthlyMet=null;return a;},/非负整数/],
  [a=>{a.payload.calculation.remainingGap=-1;return a;},/有效范围/],[a=>{a.payload.calculation.monthlyTarget=1.5;return a;},/有效范围/],
  [a=>{a.payload.calculation.remainingDays=32;return a;},/有效范围/],[a=>{a.payload.calculation.periodDays=8;return a;},/有效范围/],
  [a=>{a.payload.calculation.periodDays=6;return a;},/日期不一致/],[a=>{a.payload.calculation.suggestedTarget='79';return a;},/非负整数/],
  [a=>{a.payload.calculation.remainingGap=201;return a;},/剩余差距/],
 ];
 for(const [mutate,pattern]of malformed)await denied(()=>rpc(lead,'save',mutate(args({expectedUpdatedAt:second.updated_at}))),pattern,'invalid plan rejected');
 await denied(()=>rpc(lead,'delete',args()),/不支持/,'no delete action');
 await denied(()=>rpc(lead,'load',{month:'2026-11',kind:'expense'}),/读取参数/,'read cannot be redirected to finance');
 const zero=args({expectedUpdatedAt:second.updated_at});zero.payload.target=0;const third=await rpc(lead,'save',zero);ok(third.payload.target===0,'explicit zero is retained');
 const unknown=args({expectedUpdatedAt:third.updated_at});unknown.payload.target=null;unknown.payload.calculation.monthlyTarget=null;unknown.payload.calculation.suggestedTarget=null;
 const fourth=await rpc(lead,'save',unknown);ok(fourth.payload.target===null&&fourth.payload.calculation.monthlyTarget===null,'unknown targets remain null');
 const next=args({periodStart:'2026-11-23',periodEnd:'2026-11-29'});const nextSaved=await rpc(lead,'save',next);ok(nextSaved.key!==fourth.key,'separate weeks preserve previous plans');
 const december=args({month:'2026-12',periodStart:'2026-12-01',periodEnd:'2026-12-06'});Object.assign(december.payload,{target:null,sourceAsOf:'2026-11-30',sourceVersion:'2026-12-01T00:00:00+00:00',calculation:{monthlyTarget:null,monthlyMet:0,remainingGap:0,remainingDays:31,periodDays:6,suggestedTarget:null}});
 const decemberSaved=await rpc(lead,'save',december);ok(decemberSaved.month==='2026-12'&&decemberSaved.payload.sourceAsOf==='2026-11-30','month-end source can support adjacent next-month plan');
 ok((await rpc(lead,'load',{month:'2026-11'})).items.length===2&&(await rpc(lead,'load',{month:'2026-12'})).items.length===1,'plan months remain isolated');
 const legacy=(await db.query("select wb_code_api($1,'load','{\"p_month\":\"2026-11\"}'::jsonb) as value",[tokens[0]])).rows[0].value;
 ok(legacy.items.length===1&&legacy.items[0].kind==='goals','collaborator legacy finance and generic private review reads remain unchanged');
 const pub=(await db.query("select wb_public_daily('2026-11') as value")).rows[0].value;
 ok(pub.items.every(x=>x.kind==='goals')&&!JSON.stringify(pub).includes('company-week-plan'),'private company strategy is never exposed through public daily data');
 await db.exec('reset role');await db.query("update wb_members set enabled=false where login_id='0921'");await db.exec('set role anon');
 await denied(()=>rpc(lead,'save',args()),/授权工号/,'disabled project member cannot write with old session');
 await db.exec('reset role');await db.query("update wb_members set enabled=true,role='collaborator' where login_id='0921'");await db.exec('set role anon');
 ok((await rpc(lead,'load',{month:'2026-11'})).items.length===2,'approved member retains read when no longer project');
 await denied(()=>rpc(lead,'save',args()),/仅项目负责人/,'0921 code alone does not grant project write');
 await db.exec('reset role');await db.query("update wb_members set role='project' where login_id='0003'");await db.exec('set role anon');
 await denied(()=>rpc(tokens[0],'save',args()),/仅项目负责人/,'project role alone does not grant 0921 write');
 await db.exec('reset role');await db.query('update wb_code_sessions set expires_at=now()-interval \'1 second\' where token_hash=$1',[md5(tokens[7])]);await db.exec('set role anon');
 await denied(()=>rpc(tokens[7],'load',{month:'2026-11'}),/授权工号/,'expired session cannot read');
 await db.exec('reset role');
 const audits=(await db.query("select * from wb_audit where action='save-company-week-plan' order by id")).rows;
 ok(audits.length===6&&audits.every(x=>x.actor&&x.region===null&&x.store===null),'all writes have private global attribution');
 ok(audits[1].detail.previous.payload.target===79&&audits[1].detail.savedUpdatedAt,'old company plan retained in audit');
 ok((await db.query("select payload->>'secret' as value from wb_items where key='finance-sentinel'")).rows[0].value==='payment-detail','existing finance rows untouched');
 await db.query("update wb_items set payload=payload||'{\"unvalidated\":true}'::jsonb,updated_at=clock_timestamp() where key=$1",[nextSaved.key]);
 await db.exec('set role anon');const bypass=await rpc(tokens[2],'load',{month:'2026-11'});await db.exec('reset role');
 ok(!bypass.items.some(x=>x.key===nextSaved.key),'unvalidated generic overwrite is excluded from shared plan load');
 ok(await fingerprint()===beforeFunctions,'all legacy functions remain unchanged after company plan operations');
 console.log(JSON.stringify({passed:checks,scope:'isolated PostgreSQL only',eightMembersRead:true,project0921OnlyWrite:true,legacyPermissionsUnchanged:true}));
}catch(e){console.error(JSON.stringify({error:e.message,detail:e.detail,where:e.where,checks}));process.exitCode=1;}finally{await db.close();}
