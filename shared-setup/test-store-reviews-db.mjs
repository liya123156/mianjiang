/* Isolated real PostgreSQL tests; no shared data is written.
 * PGLITE_MODULE=/tmp/work-records-pglite/node_modules/@electric-sql/pglite/dist/index.js node shared-setup/test-store-reviews-db.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();let checks=0;
const read=n=>fs.readFileSync(new URL('./'+n,import.meta.url),'utf8');
const routine=(source,name)=>{const s=source.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'(');assert.ok(s>=0);return source.slice(s,source.indexOf('$$;',s)+3);};
const clone=x=>JSON.parse(JSON.stringify(x)),md5=x=>crypto.createHash('md5').update(x).digest('hex');
const ok=(test,label)=>{assert.ok(test,label);checks++;};
const rejected=async(fn,pattern,label)=>{await assert.rejects(fn,pattern,label);checks++;};
const rpc=async(token,action,args={})=>(await db.query('select public.wb_store_review_api($1,$2,$3::jsonb) as value',[token,action,JSON.stringify(args)])).rows[0].value;
const snapshot={version:1,month:'2026-11',region:'花木大区',store:'仁恒河滨城店',periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15',asOf:'2026-11-12',sourceVersion:'2026-11-13T00:59:41.728675+00:00',monthly:{target:15,stock:72,met:2,meetingCount:3,storeTopStock:8,storeTopMet:0,unitTopStock:11,unitTopMet:0,gift:1},period:{met:1,meetingCount:2,storeTopMet:0,unitTopMet:0,pendingDateCount:1,qualityCounts:{},qualityAvailable:false},groups:[{group:'仁恒河滨城店A组',stock:18,met:0,meetingCount:0,monthlyMet:0,storeTopStock:3,storeTopMet:0,unitTopStock:4,unitTopMet:0}],notes:['一套月度已面见房源缺少日期，周数据待核实。']};
const fields={periodGoal:null,actions:'',execution:'',highlights:'',blockers:'',nextGoal:null,nextActions:'',owner:'',due:''};
const baseArgs={month:'2026-11',periodType:'weekly',periodStart:'2026-11-09',periodEnd:'2026-11-15',region:'花木大区',store:'仁恒河滨城店',payload:{status:'draft',fields,snapshot},expectedUpdatedAt:null};
const args=(patch={})=>({...clone(baseArgs),...patch});
try{
 await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
 create table public.wb_members(email text primary key,role text,region text,store text,enabled boolean default true,display_name text,login_id text unique,stores jsonb default '[]');
 create table public.wb_code_sessions(token_hash text primary key,email text references public.wb_members(email),expires_at timestamptz,created_at timestamptz default now());
 create table public.wb_housing(month text,house_id text,region text,store text,payload jsonb,primary key(month,house_id));
 create table public.wb_meetings(month text,event_key text,house_id text,region text,store text,payload jsonb,primary key(month,event_key));
 create table public.wb_items(key text primary key,month text,kind text,region text,store text,payload jsonb,updated_at timestamptz default now());
 create table public.wb_imports(month text,as_of date,created_at timestamptz default now(),housing_count integer default 0);
 create table public.wb_snapshots(month text,as_of date,region text,store text,payload jsonb);
 create table public.wb_periods(month text,region text,store text,locked boolean,summary jsonb,updated_at timestamptz);
 create table public.wb_audit(id bigint generated always as identity primary key,month text,region text,store text,action text,actor uuid,created_at timestamptz default now(),detail jsonb);
 create table public.wb_private_proofs(path text primary key,month text,region text,store text,name text,mime text,bytes bytea);
 `);
 const ids=['0003','0921','1317','1446','3401','3448','3273','0562'];
 for(let i=0;i<ids.length;i++)await db.query('insert into wb_members(email,role,display_name,login_id) values($1,$2,$3,$4)',['fixture-'+ids[i],i===1?'project':'collaborator','测试成员'+(i+1),ids[i]]);
 await db.exec("insert into wb_members(email,role,display_name,login_id) values('other-enabled','collaborator','未授权测试','9999')");
 const setup=read('database-setup.sql'),upgrade=read('database-upgrade.sql'),code=read('database-code-access.sql');
 for(const [source,names] of [[setup,['wb_actor','wb_is_project']],[upgrade,['wb_can_read_scope','wb_can_write_item','wb_month_open']],[code,['wb_code_login','wb_code_api','wb_public_daily']]])for(const name of names)await db.exec(routine(source,name));
 await db.exec('revoke all on function public.wb_code_login(text),public.wb_code_api(text,text,jsonb),public.wb_public_daily(text) from public;grant execute on function public.wb_code_login(text),public.wb_code_api(text,text,jsonb),public.wb_public_daily(text) to anon,authenticated;');
 const fingerprints=async()=>JSON.stringify((await db.query("select proname,md5(pg_get_functiondef(oid)) as hash from pg_proc where proname in ('wb_actor','wb_is_project','wb_can_read_scope','wb_can_write_item','wb_month_open','wb_code_login','wb_code_api','wb_public_daily') order by proname")).rows);
 const before=await fingerprints();
 await db.exec(`
 insert into wb_items values('finance-sentinel','2026-11','expense','花木大区','仁恒河滨城店','{"secret":"payment-detail"}',now());
 insert into wb_items values('leadership-sentinel','2026-11','review','花木大区','仁恒河滨城店','{"recordType":"leadership","secret":"private-directory"}',now());
 insert into wb_items values('unvalidated-review','2026-11','review','花木大区','仁恒河滨城店','{"recordType":"store-period-review","secret":"unvalidated-review-secret"}',now());
 insert into wb_items values('goals','2026-11','goals',null,null,'{"recordType":"monthly","stores":{"仁恒河滨城店":15}}',now());
 insert into wb_housing values('2026-11','private-house','花木大区','仁恒河滨城店','{"店组":"仁恒河滨城店A组","细分在售户数":1,"本月是否面见":1,"本月是否送礼物":1,"门店top户数":1,"户型top户数":0,"维护人姓名":"private-advisor","房间号":"private-room","分盘":"private-project"}');
 insert into wb_housing values('2026-11','private-house2','黄浦大区','新天地一店','{"店组":"新天地一店B组","细分在售户数":1,"本月是否面见":1}');
 insert into wb_housing values('2026-11','customer-only','徐汇大区','徐汇一店','{"店组":"徐汇一店A组","细分在售户数":0}');
 insert into wb_meetings values('2026-11','private-event','private-house','花木大区','仁恒河滨城店','{"面见时间":"2026-11-10 12:00","面见人姓名":"private-advisor","面见反馈":"private-feedback"}');
 insert into wb_meetings values('2026-11','private-event2','private-house2','黄浦大区','新天地一店','{"面见时间":"2026-11-09 09:00","面见反馈":"private-feedback"}');
 insert into wb_meetings values('2026-11','after-cutoff','private-house','花木大区','仁恒河滨城店','{"面见时间":"2026-11-13 12:00"}');
 insert into wb_imports values('2026-11','2026-11-11','2026-11-12 00:00+00'),('2026-11','2026-11-12','2026-11-13T00:59:41.728675+00:00');
 insert into wb_imports values('2026-10','2026-10-31','2026-11-01T00:00:00+00:00');
 `);
 const originalItems=JSON.stringify((await db.query('select * from wb_items order by key')).rows);
 const migration=read('database-store-reviews.sql');await db.exec(migration);await db.exec(migration);
 ok(await fingerprints()===before,'all legacy authorization and finance/session/public RPCs stay byte-equivalent');
 ok(JSON.stringify((await db.query('select * from wb_items order by key')).rows)===originalItems,'migration/rerun preserve existing rows');
 ok((await db.query("select to_regclass('public.wb_work_records') as t")).rows[0].t===null,'shared pushing records remain uninstalled');
 await db.exec('set role anon');
 const tokens=[];
 for(const id of ids)tokens.push((await db.query('select public.wb_code_login($1) as value',[id])).rows[0].value.token);
 const extra=(await db.query("select public.wb_code_login('9999') as value")).rows[0].value.token;
 await rejected(()=>rpc(null,'load',{month:'2026-11'}),/授权工号/,'unauthenticated read rejected');
 await rejected(()=>rpc('invalid','load',{month:'2026-11'}),/授权工号/,'forged session rejected');
 await rejected(()=>rpc(extra,'load',{month:'2026-11'}),/授权工号/,'enabled unapproved collaborator rejected');
 for(const token of tokens){
  const loaded=await rpc(token,'load',{month:'2026-11'});
  ok(loaded.items.length===0&&loaded.businessData.housing.length===2&&loaded.businessData.meetings.length===2,'all eight can read only review collection and safe owner sources');
  const text=JSON.stringify(loaded);
  ok(!/private-advisor|private-room|private-project|private-feedback|payment-detail|private-directory|unvalidated-review-secret/.test(text),'no advisor, address, feedback, unvalidated legacy review or finance leakage');
  ok(loaded.businessData.housing.some(x=>x['房源编号']===md5('private-house'))&&loaded.businessData.meetings.some(x=>x['面见id']===md5('private-event')),'source identifiers consistently pseudonymized');
  ok(loaded.businessData.imports.length===1&&loaded.businessData.imports[0].as_of==='2026-11-12','single latest import marks sanitized source cutoff');
 }
 await rejected(()=>db.query('select * from public.wb_items'),/permission denied/,'anonymous direct table read remains denied');
 let saved;
 for(let i=0;i<tokens.length;i++){
  const a=args({expectedUpdatedAt:saved?.updated_at||null});a.payload.fields.actions='测试动作'+i;
  saved=await rpc(tokens[i],'save',a);
  ok(saved.payload.fields.actions==='测试动作'+i&&saved.payload.updatedBy==='测试成员'+(i+1),'all eight share editing and server attribution uses member name');
  ok(saved.key==='2026-11|review|仁恒河滨城店|store-period-review:weekly:2026-11-09:2026-11-15','stable store/period key');
 }
 const stable=clone(saved);
 await rejected(()=>rpc(tokens[0],'save',args()),/其他BP更新/,'existing report cannot be overwritten without version');
 await rejected(()=>rpc(tokens[0],'save',args({expectedUpdatedAt:'2000-01-01T00:00:00Z'})),/其他BP更新/,'stale edits rejected');
 const malformed=[
  [a=>({...a,month:null}),/月份/],[a=>({...a,month:'2026-13'}),/月份/],
  [a=>({...a,region:'黄浦大区'}),/不匹配/],[a=>({...a,store:'徐汇一店'}),/不匹配/],[a=>({...a,store:'fake-store'}),/不匹配/],
  [a=>({...a,periodType:'week'}),/周期/],[a=>({...a,periodStart:'2026-11-31'}),/日期/],
  [a=>({...a,periodStart:'2026-10-31'}),/当月/],[a=>({...a,periodEnd:'2026-12-01'}),/当月/],
  [a=>({...a,periodEnd:'2026-11-16'}),/最多7天/],[a=>({...a,periodEnd:'2026-11-08'}),/最多7天/],
  [a=>({...a,periodType:'monthly'}),/完整当月/],[a=>({...a,extra:'not-allowed'}),/保存参数/],
  [a=>{a.payload.status='done';return a;},/状态/],[a=>{a.payload.secret='anything';return a;},/内容/],
  [a=>{a.payload.fields.confirmed=true;return a;},/填写字段/],[a=>{delete a.payload.fields.execution;return a;},/填写字段/],
  [a=>{a.payload.fields.periodGoal=-1;return a;},/0至10000/],[a=>{a.payload.fields.nextGoal=1.5;return a;},/0至10000/],
  [a=>{a.payload.fields.periodGoal='5';return a;},/整数或待确认/],[a=>{a.payload.fields.actions=null;return a;},/文字/],
  [a=>{a.payload.fields.execution='a'.repeat(8001);return a;},/文字/],[a=>{a.payload.fields.owner='a'.repeat(121);return a;},/文字/],
  [a=>{a.payload.fields.due='2026-02-31';return a;},/复查日期/],[a=>{a.payload.fields.due='tomorrow';return a;},/复查日期/],
  [a=>{a.payload.snapshot.store='碧云店';return a;},/快照范围/],[a=>{a.payload.snapshot.month='2026-10';return a;},/快照范围/],
  [a=>{a.payload.snapshot.periodStart='2026-11-10';return a;},/快照范围/],[a=>{a.payload.snapshot.version=2;return a;},/快照范围/],
  [a=>{a.payload.snapshot.advisor='private-person';return a;},/快照范围/],[a=>{a.payload.snapshot.asOf='2026-11-31';return a;},/截止日期/],
  [a=>{a.payload.snapshot.asOf='';return a;},/快照范围/],[a=>{a.payload.snapshot.sourceVersion='';return a;},/快照范围/],
  [a=>{a.payload.snapshot.sourceVersion='not-a-time';return a;},/来源版本/],[a=>{a.payload.snapshot.sourceVersion='2026-11-13T02:00:00Z';return a;},/已导入/],
  [a=>{a.payload.snapshot.monthly.price=30;return a;},/指标字段/],[a=>{a.payload.snapshot.monthly.met=-1;return a;},/有效非负整数/],
  [a=>{a.payload.snapshot.period.met='0';return a;},/非负整数或待核实/],[a=>{a.payload.snapshot.period.meetingCount=1.2;return a;},/有效非负整数/],
  [a=>{a.payload.snapshot.period.qualityCounts.secret=1;return a;},/指标字段/],[a=>{a.payload.snapshot.period.qualityCounts.P=-1;return a;},/有效非负整数/],
  [a=>{a.payload.snapshot.groups[0].advisor='private-person';return a;},/店组快照/],[a=>{a.payload.snapshot.groups.push(clone(a.payload.snapshot.groups[0]));return a;},/重复/],
  [a=>{a.payload.snapshot.groups[0].met=-1;return a;},/店组指标/],[a=>{a.payload.snapshot.notes=[{}];return a;},/数据说明/],
  [a=>{a.payload.snapshot.notes=['x'.repeat(1001)];return a;},/数据说明/],
 ];
 for(const [mutate,pattern]of malformed)await rejected(()=>rpc(tokens[0],'save',mutate(args({expectedUpdatedAt:stable.updated_at}))),pattern,'malformed input rejected');
 await rejected(()=>rpc(tokens[0],'delete',args()),/不支持/,'no delete action');
 await rejected(()=>rpc(tokens[0],'load',{month:'2026-11',kind:'expense'}),/读取参数/,'read cannot be redirected to expenses');
 const unknown=args({expectedUpdatedAt:stable.updated_at});unknown.payload.fields.periodGoal=0;unknown.payload.fields.nextGoal=0;unknown.payload.snapshot.period.met=null;unknown.payload.snapshot.period.meetingCount=null;unknown.payload.snapshot.groups[0].met=null;unknown.payload.fields.due='2026-11-20';
 const updated=await rpc(tokens[0],'save',unknown);
 ok(updated.payload.snapshot.period.met===null&&updated.payload.fields.periodGoal===0,'unknown results stay null and explicit zero target remains valid');
 await rejected(()=>rpc(tokens[0],'save',args({expectedUpdatedAt:stable.updated_at})),/其他BP更新/,'older snapshot cannot overwrite refreshed report');
 const other=args({store:'碧云店',expectedUpdatedAt:null});other.payload.snapshot.store='碧云店';other.payload.snapshot.groups=[];
 const otherSaved=await rpc(tokens[0],'save',other);ok(otherSaved.key!==updated.key,'separate stores have separate records');
 const another=args({periodStart:'2026-11-16',periodEnd:'2026-11-22'});another.payload.snapshot.periodStart='2026-11-16';another.payload.snapshot.periodEnd='2026-11-22';
 const anotherSaved=await rpc(tokens[0],'save',another);ok(anotherSaved.key!==updated.key,'separate weeks have separate records');
 const monthly=args({periodType:'monthly',periodStart:'2026-11-01',periodEnd:'2026-11-30'});Object.assign(monthly.payload.snapshot,{periodType:'monthly',periodStart:'2026-11-01',periodEnd:'2026-11-30'});
 const monthSaved=await rpc(tokens[0],'save',monthly);ok(monthSaved.key!==updated.key,'monthly report does not overwrite weekly report');
 const october=args({month:'2026-10',periodStart:'2026-10-26',periodEnd:'2026-10-31'});
 Object.assign(october.payload.snapshot,{month:'2026-10',periodStart:'2026-10-26',periodEnd:'2026-10-31',asOf:'2026-10-31',sourceVersion:'2026-11-01T00:00:00+00:00'});
 october.payload.status='confirmed';october.payload.fields.nextGoal=5;october.payload.fields.nextActions='测试下期承接';
 const previousSaved=await rpc(tokens[0],'save',october);
 const withPrevious=await rpc(tokens[0],'load',{month:'2026-11'});
 ok(withPrevious.previousItems.length===1&&withPrevious.previousItems[0].key===previousSaved.key&&withPrevious.previousItems[0].payload.fields.nextGoal===5,'previous month confirmed plans returned for cross-month carryover');
 const empty=await rpc(tokens[0],'load',{month:'2026-12'});ok(empty.items.length===0&&empty.businessData.imports.length===0&&empty.businessData.housing.length===0,'months are isolated');
 const loaded=await rpc(tokens[7],'load',{month:'2026-11'});ok(loaded.items.length===4,'all approved collaborators can read all saved reports');
 ok(loaded.items.find(x=>x.key===updated.key).payload.fields.actions==='','saving another week/store does not rewrite previous fields');
 const legacy=await db.query("select public.wb_code_api($1,'load','{\"p_month\":\"2026-11\"}'::jsonb) as value",[tokens[0]]);
 ok(legacy.rows[0].value.housing.length===0&&legacy.rows[0].value.meetings.length===0&&legacy.rows[0].value.items.length===1,'collaborator legacy private housing/finance access remains unchanged (only goals visible)');
 const publicDaily=(await db.query("select public.wb_public_daily('2026-11') as value")).rows[0].value;
 ok(publicDaily.items.every(x=>x.kind==='goals')&&!JSON.stringify(publicDaily).includes('store-period-review'),'saved narratives never exposed through public progress');
 await db.exec('reset role');
 await db.query("update wb_members set enabled=false where login_id='0003'");await db.exec('set role anon');
 await rejected(()=>rpc(tokens[0],'load',{month:'2026-11'}),/授权工号/,'disabling member immediately blocks review session');
 await db.exec('reset role');await db.query("update wb_members set enabled=true,role='region',region='花木大区' where login_id='0003'");await db.exec('set role anon');
 await rejected(()=>rpc(tokens[0],'load',{month:'2026-11'}),/授权工号/,'mismatched legacy role does not get new shared report access');
 await db.exec('reset role');await db.query('update wb_code_sessions set expires_at=now()-interval \'1 second\' where token_hash=$1',[md5(tokens[7])]);await db.exec('set role anon');
 await rejected(()=>rpc(tokens[7],'load',{month:'2026-11'}),/授权工号/,'expired session is rejected');
 await db.exec('reset role');
 const audit=(await db.query("select * from wb_audit where action='save-store-period-review' order by id")).rows;
 ok(audit.length===13&&audit.every(x=>x.actor),'every saved report is attributed in private audit');
 ok(audit[1].detail.previous.payload.fields.actions==='测试动作0','previous edited payload retained in private audit history');
 ok((await db.query("select payload->>'secret' as value from wb_items where key='finance-sentinel'")).rows[0].value==='payment-detail','finance records untouched');
 await db.query("update wb_items set payload=payload||'{\"unvalidated\":\"legacy-bypass\"}'::jsonb,updated_at=clock_timestamp() where key=$1",[otherSaved.key]);
 await db.exec('set role anon');const afterLegacyWrite=await rpc(tokens[1],'load',{month:'2026-11'});await db.exec('reset role');
 ok(!afterLegacyWrite.items.some(x=>x.key===otherSaved.key),'a legacy save that bypassed schema validation is not exposed as a validated shared report');
 ok(await fingerprints()===before,'authorization/session/finance code still unchanged after saves');
 console.log(JSON.stringify({passed:checks,legacyPermissionsUnchanged:true,sharedWorkRecordsUninstalled:true,scope:'isolated PostgreSQL only'}));
}catch(e){console.error(JSON.stringify({error:e.message,detail:e.detail,where:e.where,position:e.position,checks}));process.exitCode=1;}finally{await db.close();}
