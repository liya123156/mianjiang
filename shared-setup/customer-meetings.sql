-- Full-company monthly cumulative customer meetings. Deploy as one transaction.
-- Raw spreadsheets remain client-side; only business display fields are stored.
begin;

create table if not exists public.wb_customer_snapshots (
 month text primary key check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 as_of date not null,
 rows jsonb not null check (jsonb_typeof(rows)='array'),
 filenames jsonb not null default '[]'::jsonb check (jsonb_typeof(filenames)='array'),
 total bigint not null check (total>=0),
 record_count integer not null check (record_count>=0),
 created_at timestamptz not null default now(),
 actor_email text not null,
 check (to_char(as_of,'YYYY-MM')=month)
);
create table if not exists public.wb_customer_imports (
 id bigint generated always as identity primary key,
 month text not null,
 as_of date not null,
 rows jsonb not null check (jsonb_typeof(rows)='array'),
 filenames jsonb not null,
 total bigint not null,
 record_count integer not null,
 created_at timestamptz not null default now(),
 actor_email text not null
);
alter table public.wb_customer_snapshots enable row level security;
alter table public.wb_customer_imports enable row level security;
revoke all on public.wb_customer_snapshots, public.wb_customer_imports from public, anon, authenticated;
revoke all on sequence public.wb_customer_imports_id_seq from public, anon, authenticated;

-- Keep original plan/task identifiers, status, evidence and event history.
do $$ begin
 if exists(select 1 from public.wb_plan_stores where month='2026-11' and store='徐汇二店')
 and exists(select 1 from public.wb_plan_stores where month='2026-11' and store='徐汇一店') then
  raise exception '徐汇门店名称存在冲突，请核对后重试';
 end if;
 if exists(select 1 from public.wb_items where key='2000-01|review|徐汇二店|leadership')
 and exists(select 1 from public.wb_items where key='2000-01|review|徐汇一店|leadership') then
  raise exception '徐汇门店通讯录存在冲突，请核对后重试';
 end if;
end $$;
update public.wb_plan_stores set store='徐汇一店',version=version+1,updated_at=now()
 where month='2026-11' and store='徐汇二店';
update public.wb_plan_tasks set store='徐汇一店',version=version+1,updated_at=now()
 where month='2026-11' and store='徐汇二店';
update public.wb_items set key='2000-01|review|徐汇一店|leadership',store='徐汇一店',updated_at=now()
 where key='2000-01|review|徐汇二店|leadership';

create or replace function public.wb_customer_api(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 mon text:=p_args->>'month'; m public.wb_members; snap public.wb_customer_snapshots;
 x jsonb; normalized jsonb:='[]'::jsonb; filenames jsonb; st text; rg text; grp text; nm text;
 cnt bigint; total_count bigint:=0; record_count integer:=0; asof_date date;
 metadata jsonb; catalog jsonb; visible_rows jsonb; signed_in boolean:=false;
begin
 if mon is null or mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception '月份不正确'; end if;
 if octet_length(coalesce(p_args,'{}')::text)>5242880 then raise exception '客户明细文件过大，请控制在5MB以内'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('region',s.region,'store',s.store) order by s.region,s.store),'[]'::jsonb)
 into catalog from public.wb_plan_stores s
 where s.month=case when exists(select 1 from public.wb_plan_stores where month=mon and enabled) then mon else '2026-11' end and s.enabled;

 if nullif(p_token,'') is not null then
  select mm.* into m from public.wb_code_sessions ss join public.wb_members mm on mm.email=ss.email
  where ss.token_hash=md5(p_token) and ss.expires_at>now() and mm.enabled;
  if not found then raise exception '工号会话已过期，请重新进入'; end if;
  signed_in:=true;
 end if;

 if p_action='load' then
  select * into snap from public.wb_customer_snapshots where month=mon;
  if not found then return jsonb_build_object('customerRows','[]'::jsonb,'customerImported',false,'customerImport',null,'storeCatalog',catalog,'customerDetailsAvailable',signed_in); end if;
  metadata:=jsonb_build_object('month',snap.month,'as_of',snap.as_of,'created_at',snap.created_at,
   'filenames',case when signed_in and m.role='project' then snap.filenames else '[]'::jsonb end,'total',snap.total,'record_count',snap.record_count);
  -- Anonymous visitors receive store counts only. Detailed customer-source rows
  -- remain private; authenticated BPs can see names/groups only in their own scope.
  with entries as (select value as row from jsonb_array_elements(snap.rows)), visible as (
   select row from entries where signed_in and public.wb_plan_in_scope(m,'store',row->>'region',row->>'store')
   union all
   select jsonb_build_object('region',row->>'region','store',row->>'store','group','','name','',
    'count',sum((row->>'count')::bigint),'aggregateOnly',true)
   from entries where not (signed_in and public.wb_plan_in_scope(m,'store',row->>'region',row->>'store'))
   group by row->>'region',row->>'store'
  ) select coalesce(jsonb_agg(row),'[]'::jsonb) into visible_rows from visible;
  return jsonb_build_object('customerRows',visible_rows,'customerImported',true,'customerImport',metadata,'storeCatalog',catalog,'customerDetailsAvailable',signed_in);
 end if;
 if p_action is distinct from 'import' then raise exception '不支持的客户面见操作'; end if;
 if not signed_in then raise exception '工号会话已过期，请重新进入'; end if;
 if m.role is distinct from 'project' then raise exception '仅项目负责人可导入全司客户面见明细'; end if;
 if jsonb_typeof(p_args->'rows') is distinct from 'array' or jsonb_array_length(p_args->'rows')>20000 then raise exception '客户明细需为数组且不超过20000行'; end if;
 if coalesce(p_args->>'asOf','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then raise exception '请填写数据截止日期'; end if;
 asof_date:=(p_args->>'asOf')::date;
 if to_char(asof_date,'YYYY-MM')<>mon then raise exception '截止日期必须属于所选月份'; end if;
 if asof_date>(now() at time zone 'Asia/Shanghai')::date then raise exception '截止日期不能晚于今天'; end if;
 filenames:=coalesce(p_args->'filenames','[]'::jsonb);
 if jsonb_typeof(filenames) is distinct from 'array' or jsonb_array_length(filenames)>20
 or exists(select 1 from jsonb_array_elements(filenames) f where jsonb_typeof(f)<>'string' or length(f#>>'{}')>250) then raise exception '文件名称不正确'; end if;
 if jsonb_array_length(catalog)<>21 then raise exception '全司21家门店目录尚未配置完整'; end if;

 for x in select value from jsonb_array_elements(p_args->'rows') loop
  if jsonb_typeof(x) is distinct from 'object' then raise exception '客户明细格式不正确'; end if;
  st:=regexp_replace(coalesce(x->>'store',''),'[[:space:]]','','g');
  st:=case when st='徐汇二店' then '徐汇一店' when lower(st)='hmall中心店' then 'Hmall中心店' when lower(st)='hmall旗舰店' then 'Hmall旗舰店' else st end;
  select item->>'region' into rg from jsonb_array_elements(catalog) item where item->>'store'=st;
  if not found then raise exception '无法匹配门店：%',st; end if;
  if coalesce(x->>'region','')<>'' and x->>'region'<>rg then raise exception '门店所属大区不一致：%',st; end if;
  if coalesce(x->>'count','') !~ '^[0-9]+$' or length(x->>'count')>10 then raise exception '客户面见次数必须为非负整数：%',st; end if;
  cnt:=(x->>'count')::bigint;
  if cnt>1000000000 then raise exception '客户面见次数过大，请核对：%',st; end if;
  grp:=replace(btrim(coalesce(x->>'group','')),'徐汇二店','徐汇一店');
  nm:=btrim(coalesce(x->>'name',''));
  if length(grp)>200 or length(nm)>100 then raise exception '店组或姓名内容过长'; end if;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('region',rg,'store',st,'group',grp,'name',nm,'count',cnt));
  total_count:=total_count+cnt;record_count:=record_count+1;
 end loop;
 -- Stable ordering makes identical full files idempotent even if their row order changes.
 select coalesce(jsonb_agg(value order by value->>'region',value->>'store',value->>'group',value->>'name',(value->>'count')::bigint),'[]'::jsonb)
 into normalized from jsonb_array_elements(normalized);
 perform pg_advisory_xact_lock(hashtext('wb-customer:'||mon));
 select * into snap from public.wb_customer_snapshots where month=mon for update;
 if found and snap.as_of>asof_date then raise exception '已存在更新截止日期的累计表，请勿用旧表覆盖'; end if;
 if found and snap.as_of=asof_date and snap.rows=normalized then
  return jsonb_build_object('month',snap.month,'as_of',snap.as_of,'created_at',snap.created_at,'filenames',snap.filenames,'total',snap.total,'record_count',snap.record_count,'unchanged',true);
 end if;
 insert into public.wb_customer_snapshots(month,as_of,rows,filenames,total,record_count,actor_email)
 values(mon,asof_date,normalized,filenames,total_count,record_count,m.email)
 on conflict(month) do update set as_of=excluded.as_of,rows=excluded.rows,filenames=excluded.filenames,total=excluded.total,
 record_count=excluded.record_count,created_at=now(),actor_email=excluded.actor_email returning * into snap;
 insert into public.wb_customer_imports(month,as_of,rows,filenames,total,record_count,actor_email)
 values(mon,asof_date,normalized,filenames,total_count,record_count,m.email);
 return jsonb_build_object('month',snap.month,'as_of',snap.as_of,'created_at',snap.created_at,'filenames',snap.filenames,'total',snap.total,'record_count',snap.record_count,'unchanged',false);
end $$;
revoke all on function public.wb_customer_api(text,text,jsonb) from public;
grant execute on function public.wb_customer_api(text,text,jsonb) to anon, authenticated;
comment on function public.wb_customer_api(text,text,jsonb) is 'Public output is store counts only; detailed rows require a server-verified session and assigned scope. Import requires project role. Raw snapshot/audit tables remain inaccessible to API roles.';
notify pgrst,'reload schema';
commit;
