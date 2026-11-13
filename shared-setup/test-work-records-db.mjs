/* Real PostgreSQL semantics in a local WASM database, never a hosted project.
 * Test dependency: @electric-sql/pglite@0.5.16. Set PGLITE_MODULE to its dist/index.js
 * if installed outside this repository. No application dependency is required.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = fs.readFileSync(new URL('./database-work-records.sql', import.meta.url), 'utf8');
const projectToken='fixture-project-session', collaboratorToken='fixture-collaborator-session', regionalToken='fixture-regional-session';
const exec = query => db.exec(query);
const count = async table => Number((await db.query('select count(*) as n from public.'+table)).rows[0].n);
const api = async (token,action,args={}) => (await db.query('select public.wb_work_records_api($1,$2,$3::jsonb) as result',[token,action,JSON.stringify(args)])).rows[0].result;
const rejected = async (call,pattern,code) => {
 try { await call(); assert.fail('Expected rejection'); }
 catch(error) { assert.match(error.message,pattern); if(code)assert.equal(error.code,code); }
};

try {
 await exec(`
  create role anon; create role authenticated;
  create table public.wb_members(email text primary key,role text not null check(role in ('project','region','store')),
   region text,store text,enabled boolean not null default true,display_name text,employee_no text,login_id text,stores jsonb default '[]',
   check(role='project' or (role='region' and region is not null and store is null) or (role='store' and region is not null and store is not null)));
  create table public.wb_code_sessions(token_hash text primary key,email text references public.wb_members(email),expires_at timestamptz,created_at timestamptz default now());
  insert into public.wb_members(email,role,display_name,login_id) values ('fixture:lead','project','负责人甲','9001');
 `);
 await exec(sql);
 await exec(`
  insert into public.wb_members(email,role,display_name,login_id) values ('fixture:collaborator','collaborator','协作乙','9002');
  insert into public.wb_members(email,role,region,display_name,login_id) values ('fixture:region','region','测试大区','其他区域成员','9003');
  insert into public.wb_code_sessions(token_hash,email,expires_at) values
   (md5('${projectToken}'),'fixture:lead',now()+interval '1 hour'),
   (md5('${collaboratorToken}'),'fixture:collaborator',now()+interval '1 hour'),
   (md5('${regionalToken}'),'fixture:region',now()+interval '1 hour'),
   (md5('fixture-expired'),'fixture:lead',now()-interval '1 hour');
 `);
 await rejected(()=>api(null,'list'),/已授权/,'42501');
 await rejected(()=>api('fixture-expired','list'),/已授权/,'42501');
 await rejected(()=>api(regionalToken,'list'),/已授权/,'42501');
 await exec('set role anon');
 await rejected(()=>db.query('select * from public.wb_work_records'),/permission denied/,'42501');
 await rejected(()=>db.query('select * from public.wb_work_record_attachments'),/permission denied/,'42501');
 await rejected(()=>db.query('select * from public.wb_work_record_jobs'),/permission denied/,'42501');
 await rejected(()=>db.query("select wb_work_private.record_json(null::public.wb_work_records)"),/permission denied/,'42501');

 const createArgs={requestId:randomUUID(),month:'2026-11',rawText:'已在经理群发布物料包，下午计划逐一确认使用。',createdBy:'冒名者'};
 let {record:r,processorAvailable} = await api(projectToken,'create',createArgs);
 assert.equal(processorAvailable,false);
 assert.equal(r.createdBy,'负责人甲');assert.equal(r.version,1);assert.equal(r.sourceVersion,1);
 assert.equal(r.occurredAt,null,'upload time must not invent event time');
 assert.equal(r.aiStatus,'pending');assert.equal(r.summaryStatus,'empty');assert.deepEqual(r.summary,{});
 assert.equal(r.region,'');assert.equal(r.store,'');
 assert.equal((await api(projectToken,'create',createArgs)).duplicate,true);
 await rejected(()=>api(projectToken,'create',{...createArgs,rawText:'同标识的新内容'}),/提交标识的内容已变化/);
 const second=(await api(projectToken,'create',{requestId:randomUUID(),month:'2026-11',rawText:'同用户第二个独立事项'})).record;
 assert.notEqual(second.id,r.id,'different request ids must not match the first request');
 assert.equal((await api(collaboratorToken,'list',{month:'2026-11'})).records.length,2,'collaborator sees project records');

 const summary={done:['已发布行动包和房源明细'],plans:['下午逐一沟通'],feedback:['一位经理选择苹果礼盒'],pending:['采购、到货和使用情况'],next_steps:['确认一对一承接结果'],review_text:'材料已发布，已有选品反馈，执行结果待跟进。'};
 r=(await api(collaboratorToken,'edit',{id:r.id,expectedVersion:1,title:'物料使用与礼品准备',region:'测试大区',store:'测试门店',group:'A组',summary,summaryReviewStatus:'reviewed',status:'in_progress',aiStatus:'ready',summaryMethod:'AI'})).record;
 assert.equal(r.version,2);assert.equal(r.updatedBy,'协作乙');assert.equal(r.summaryBy,'协作乙');
 assert.equal(r.summaryMethod,'manual');assert.equal(r.summaryStatus,'reviewed');assert.equal(r.aiStatus,'pending','clients cannot forge completed AI');
 assert.equal(r.summarySourceVersion,1);assert.equal(r.store,'测试门店');
 await rejected(()=>api(projectToken,'edit',{id:r.id,expectedVersion:1,title:'覆盖他人修改'}),/其他伙伴更新/,'40001');
 assert.equal((await api(projectToken,'list',{id:r.id})).records[0].title,'物料使用与礼品准备');
 const appendArgs={id:r.id,expectedVersion:2,requestId:randomUUID(),rawText:'经理反馈选择苹果礼盒，尚未确认采购。'};
 r=(await api(projectToken,'append',appendArgs)).record;
 assert.equal(r.version,3);assert.equal(r.sourceVersion,2);assert.equal(r.sources.length,2);
 assert.equal(r.summaryStatus,'stale');assert.deepEqual(r.summary,summary,'new sources preserve the previously reviewed summary');
 assert.equal(r.summarySourceVersion,1);assert.equal(r.aiStatus,'pending');assert.equal(r.occurredAt,null);
 assert.equal((await api(projectToken,'append',appendArgs)).duplicate,true);
 assert.equal((await api(projectToken,'append',{...appendArgs,expectedVersion:3,requestId:randomUUID()})).duplicate,true,'same original source is not appended twice');
 const matching=(await api(collaboratorToken,'list',{month:'2026-11',region:'测试大区',store:'测试门店'})).records;
 assert.equal(matching.length,1);assert.equal(matching[0].id,r.id);
 r=(await api(collaboratorToken,'edit',{id:r.id,expectedVersion:3,summary:{...summary,feedback:['已确认礼品选项，采购待反馈']},summaryReviewStatus:'reviewed',due:null})).record;
 assert.equal(r.version,4);assert.equal(r.summaryStatus,'reviewed');assert.equal(r.summarySourceVersion,2);assert.equal(r.due,null);
 const history=(await api(projectToken,'history',{id:r.id})).history;
 assert.deepEqual(history.map(x=>x.version),[4,3,2,1]);
 assert.equal(history[0].actorName,'协作乙');assert.equal(history[1].before.summaryStatus,'reviewed');assert.equal(history[1].after.summaryStatus,'stale');
 assert.equal(history[3].before,null);assert.equal(history[3].after.rawText,createArgs.rawText);

 const imageData=Buffer.from('fixture-private-image-bytes').toString('base64');
 const uploadArgs={requestId:randomUUID(),name:'微信截图.png',mime:'image/png',data:imageData};
 const a=(await api(projectToken,'attachment-upload',uploadArgs)).attachment;
 assert.equal((await api(projectToken,'attachment-upload',uploadArgs)).attachment.id,a.id);
 assert.equal((await api(projectToken,'attachment-upload',{...uploadArgs,requestId:randomUUID()})).attachment.id,a.id,'pending duplicate bytes share one attachment');
 await rejected(()=>api(collaboratorToken,'attachment-read',{id:a.id}),/无权查看/,'42501');
 const beforeFailedCreate=(await api(projectToken,'list')).records.length;
 await rejected(()=>api(collaboratorToken,'create',{requestId:randomUUID(),month:'2026-11',rawText:'试图关联他人尚未提交的附件',attachmentIds:[a.id]}),/无权关联/);
 assert.equal((await api(projectToken,'list')).records.length,beforeFailedCreate,'invalid attachment linking rolls back record creation');
 const withImage=(await api(projectToken,'create',{requestId:randomUUID(),month:'2026-11',attachmentIds:[a.id]})).record;
 assert.equal(withImage.attachments[0].id,a.id);assert.equal(withImage.rawText,'');assert.equal(withImage.sources[0].attachmentIds[0],a.id);
 assert.equal((await api(collaboratorToken,'attachment-read',{id:a.id})).data.replace(/\s/g,''),imageData);
 await rejected(()=>api(projectToken,'attachment-delete',{id:a.id}),/尚未关联/);
 const reused=(await api(projectToken,'attachment-upload',{...uploadArgs,requestId:randomUUID()})).attachment;
 assert.notEqual(reused.id,a.id,'an already linked file may be uploaded as a new private source');
 await api(projectToken,'attachment-delete',{id:reused.id});
 await rejected(()=>api(projectToken,'attachment-read',{id:reused.id}),/不存在/,'42501');
 await rejected(()=>api(projectToken,'attachment-upload',{...uploadArgs,requestId:randomUUID(),type:'image/jpeg'}),/类型不一致/);
 await rejected(()=>api(projectToken,'attachment-upload',{...uploadArgs,requestId:randomUUID(),mime:'image/svg+xml'}),/仅支持/);
 await rejected(()=>api(projectToken,'create',{requestId:randomUUID(),month:'2026-11',rawText:'',attachmentIds:[]}),/原始文字或附件/);
 await rejected(()=>api(projectToken,'create',{requestId:randomUUID(),month:'2026-11',attachmentIds:Array.from({length:5},randomUUID)}),/最多提交4/);
 await rejected(()=>api(projectToken,'edit',{id:r.id,expectedVersion:r.version,summary:[]}),/JSON对象/);
 await rejected(()=>api(projectToken,'edit',{id:r.id,expectedVersion:r.version,status:'AI-completed'}),/推进状态/);
 await rejected(()=>api(projectToken,'edit',{id:r.id,expectedVersion:r.version,summaryReviewStatus:'automatic'}),/核对状态/);
 const stableOrder=(await api(projectToken,'list',{limit:200})).records;
 const firstPage=(await api(projectToken,'list',{limit:1,offset:0})).records;
 const secondPage=(await api(projectToken,'list',{limit:1,offset:1})).records;
 assert.equal(firstPage.length,1);assert.equal(secondPage.length,1);
 await api(collaboratorToken,'edit',{id:secondPage[0].id,expectedVersion:secondPage[0].version,owner:'分页协作负责人'});
 assert.deepEqual((await api(projectToken,'list',{limit:1,offset:0})).records.map(x=>x.id),firstPage.map(x=>x.id),'editing the second page must not move it onto the first page');
 assert.deepEqual((await api(projectToken,'list',{limit:1,offset:1})).records.map(x=>x.id),secondPage.map(x=>x.id),'editing must retain the record pagination position');
 const traversed=[];
 for(let offset=0;offset<stableOrder.length;offset++)traversed.push(...(await api(projectToken,'list',{limit:1,offset})).records.map(x=>x.id));
 assert.deepEqual(traversed,stableOrder.map(x=>x.id),'pagination across an edit must retain every record exactly once');
 await exec('reset role');

 const queues=await db.query('select source_version,status,attempts from public.wb_work_record_jobs where record_id=$1 order by source_version',[r.id]);
 assert.deepEqual(queues.rows.map(x=>[x.source_version,x.status,x.attempts]),[[1,'pending',0],[2,'pending',0]]);
 assert.equal(await count('wb_work_records'),3);assert.equal(await count('wb_work_record_attachments'),1);
 const beforeRerun=await count('wb_work_record_history');await exec(sql);
 assert.equal(await count('wb_work_record_history'),beforeRerun,'reapplying the draft preserves work history');
 assert.equal((await db.query("select role,region,store from public.wb_members where email='fixture:collaborator'")).rows[0].role,'collaborator');
 await rejected(()=>db.query("insert into public.wb_members(email,role) values ('fixture:invalid-region','region')"),/check constraint/);
 const grants=await db.query("select table_name from information_schema.role_table_grants where grantee in ('anon','authenticated','PUBLIC') and table_schema='public' and table_name like 'wb_work_%'");
 assert.equal(grants.rows.length,0,'private record tables have no direct client grants');
 console.log('PASS local PostgreSQL work records: custom-session authorization, unscoped collaborator role, all-record collaboration, optimistic locking, immutable sources and history, true pending AI, manual summary review/staleness, idempotent requests, private attachment ownership/linking, stable pagination across edits and reapply safety.');
} finally { await db.close(); }
