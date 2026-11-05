-- Admin-side integration checks. All synthetic snapshots and sessions are rolled back.
-- Requires an existing enabled project member; never copies production meeting data.
begin;
do $test$
declare token text:=gen_random_uuid()::text; bp_token text:=gen_random_uuid()::text;
 actor text; bp public.wb_members; r jsonb; result jsonb; rows jsonb; item jsonb; blocked boolean; n integer; bp_store text; bp_region text;
begin
 select email into actor from public.wb_members where enabled and role='project' limit 1;
 if actor is null then raise exception 'QA requires project member'; end if;
 insert into public.wb_code_sessions(token_hash,email,expires_at) values(md5(token),actor,now()+interval '5 minutes');
 r:=public.wb_customer_api(null,'load','{"month":"2001-02"}');
 if (r->>'customerImported')::boolean then raise exception 'QA test month unexpectedly populated'; end if;
 blocked:=false;
 begin perform public.wb_customer_api(null,'import','{"month":"2001-02","asOf":"2001-02-04","rows":[]}'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Unauthenticated import accepted'; end if;
 rows:='[{"region":"徐汇大区","store":"徐汇二店","group":"徐汇二店A组","name":"QA客户记录A","count":3},{"region":"黄浦大区","store":"黄浦滨江店","group":"黄浦滨江店B组","name":"QA客户记录B","count":1}]';
 r:=public.wb_customer_api(token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-04','rows',rows,'filenames','["QA.xlsx"]'::jsonb));
 if (r->>'total')::integer<>4 or (r->>'record_count')::integer<>2 then raise exception 'Initial cumulative total incorrect'; end if;
 result:=public.wb_customer_api(null,'load','{"month":"2001-02"}');
 if not (result->>'customerImported')::boolean then raise exception 'Imported flag missing'; end if;
 if result->'customerImport'->'filenames'<>'[]'::jsonb or result::text like '%QA客户记录%' or result::text like '%QA.xlsx%' then raise exception 'Anonymous details leaked'; end if;
 for item in select value from jsonb_array_elements(result->'customerRows') loop
  if item->>'name'<>'' or item->>'group'<>'' or not (item->>'aggregateOnly')::boolean then raise exception 'Anonymous nonaggregate row'; end if;
 end loop;
 if result::text like '%徐汇二店%' then raise exception 'Store alias not normalized'; end if;
 result:=public.wb_customer_api(token,'load','{"month":"2001-02"}');
 if result::text not like '%QA客户记录A%' or result::text not like '%QA.xlsx%' then raise exception 'Project details missing'; end if;
 r:=public.wb_customer_api(token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-04','rows',jsonb_build_array(rows->1,rows->0),'filenames','["QA-reordered.xlsx"]'::jsonb));
 if not (r->>'unchanged')::boolean then raise exception 'Duplicate import not idempotent'; end if;
 select count(*) into n from public.wb_customer_imports where month='2001-02';
 if n<>1 then raise exception 'Duplicate audit inserted'; end if;
 rows:=jsonb_set(rows,'{0,count}','7');
 r:=public.wb_customer_api(token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-04','rows',rows));
 if (r->>'total')::integer<>8 then raise exception 'Replacement accumulated instead of replacing'; end if;
 blocked:=false;
 begin perform public.wb_customer_api(token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-03','rows',rows)); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Old snapshot accepted'; end if;
 blocked:=false;
 begin perform public.wb_customer_api(token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-04','rows',jsonb_set(rows,'{0,count}','-1'))); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Negative count accepted'; end if;
 blocked:=false;
 begin perform public.wb_customer_api(token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-04','rows',jsonb_set(rows,'{0,store}','"Unknown QA Store"'))); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Unknown store accepted'; end if;
 select * into bp from public.wb_members where enabled and role in ('region','store') limit 1;
 if found then
  insert into public.wb_code_sessions(token_hash,email,expires_at) values(md5(bp_token),bp.email,now()+interval '5 minutes');
  result:=public.wb_customer_api(bp_token,'load','{"month":"2001-02"}');
  for item in select value from jsonb_array_elements(result->'customerRows') loop
   if not public.wb_plan_in_scope(bp,'store',item->>'region',item->>'store') and (item->>'name'<>'' or item->>'group'<>'') then raise exception 'BP out-of-scope detail exposed'; end if;
  end loop;
  blocked:=false;
  begin perform public.wb_customer_api(bp_token,'import',jsonb_build_object('month','2001-02','asOf','2001-02-04','rows',rows)); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Nonproject import accepted'; end if;
 end if;
 r:=public.wb_customer_api(token,'import','{"month":"2001-02","asOf":"2001-02-05","rows":[]}');
 if (r->>'total')::integer<>0 then raise exception 'Empty full-month snapshot total incorrect'; end if;
 result:=public.wb_customer_api(null,'load','{"month":"2001-02"}');
 if not (result->>'customerImported')::boolean or result->'customerRows'<>'[]'::jsonb then raise exception 'Explicit zero month confused with not imported'; end if;
 if not exists(select 1 from public.wb_customer_imports audit where audit.month='2001-02' and audit.total=4 and jsonb_array_length(audit.rows)=2) then raise exception 'Recovery snapshot missing'; end if;
 if has_table_privilege('anon','public.wb_customer_snapshots','select') or has_table_privilege('authenticated','public.wb_customer_imports','select') then raise exception 'Raw table exposed'; end if;
end $test$;
rollback;
select jsonb_build_object('tests','passed: cumulative replacement, idempotency, zero/import distinction, aliases, invalid counts/stores, auth scopes, anonymous aggregation, private audit recovery',
'customerSnapshots',(select count(*) from public.wb_customer_snapshots),'customerAuditRows',(select count(*) from public.wb_customer_imports),
'stores',(select count(*) from public.wb_plan_stores where month='2026-11' and enabled),
'oldNameTasks',(select count(*) from public.wb_plan_tasks where month='2026-11' and store='徐汇二店'),
'renamedTasks',(select count(*) from public.wb_plan_tasks where month='2026-11' and store='徐汇一店'),
'novemberLoad',public.wb_customer_api(null,'load','{"month":"2026-11"}')) as verification;
