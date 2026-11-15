-- Company next-week plan in the original review module.
-- Eight approved code-session members may read; only project member 0921 may write.
-- No legacy RPC, membership, RLS, finance or work-record permission is changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.wb_company_week_plan_api(
 p_token text,p_action text,p_args jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor_member public.wb_members; saved public.wb_items; old_item public.wb_items;
 mon text; start_text text; end_text text; first_day date; last_day date; start_day date; end_day date;
 source_day date; source_time timestamptz; source_month text; expected_time timestamptz;
 body jsonb; calc jsonb; pair record; count_value numeric; item_key text;
BEGIN
 SELECT m.* INTO actor_member FROM public.wb_code_sessions s
 JOIN public.wb_members m ON m.email=s.email
 WHERE s.token_hash=md5(p_token) AND s.expires_at>now() AND m.enabled
  AND m.login_id IN ('0003','0921','1317','1446','3401','3448','3273','0562')
  AND m.role IN ('project','collaborator');
 IF NOT FOUND THEN RAISE EXCEPTION '请使用已授权工号进入复盘；会话可能已过期'; END IF;
 IF jsonb_typeof(p_args) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '全司周计划参数不正确'; END IF;
 mon:=p_args->>'month';
 IF mon IS NULL OR mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '全司周计划月份不正确'; END IF;
 IF p_action='load' THEN
  IF (p_args-ARRAY['month'])<>'{}'::jsonb THEN RAISE EXCEPTION '全司周计划读取参数不正确'; END IF;
  RETURN jsonb_build_object('month',mon,'items',coalesce((
   SELECT jsonb_agg(to_jsonb(i) ORDER BY i.key) FROM public.wb_items i
   WHERE i.month=mon AND i.kind='review' AND i.region IS NULL AND i.store IS NULL
    AND i.payload->>'recordType'='company-week-plan'
    AND EXISTS(SELECT 1 FROM public.wb_audit a WHERE a.month=i.month AND a.action='save-company-week-plan'
     AND a.detail->>'key'=i.key AND (a.detail->>'savedUpdatedAt')::timestamptz=i.updated_at)
  ),'[]'::jsonb));
 END IF;
 IF p_action IS DISTINCT FROM 'save' THEN RAISE EXCEPTION '不支持的全司周计划操作'; END IF;
 IF actor_member.login_id<>'0921' OR actor_member.role<>'project' THEN RAISE EXCEPTION '仅项目负责人可保存全司下周目标及核心策略'; END IF;
 IF (p_args-ARRAY['month','periodStart','periodEnd','payload','expectedUpdatedAt'])<>'{}'::jsonb
 THEN RAISE EXCEPTION '全司周计划保存参数不正确'; END IF;
 start_text:=p_args->>'periodStart';end_text:=p_args->>'periodEnd';body:=p_args->'payload';
 IF start_text IS NULL OR start_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  OR end_text IS NULL OR end_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION '全司周计划日期不正确'; END IF;
 BEGIN start_day:=start_text::date;end_day:=end_text::date;first_day:=(mon||'-01')::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '全司周计划日期不正确'; END;
 last_day:=(first_day+interval '1 month - 1 day')::date;
 IF start_day>end_day OR start_day<first_day OR end_day>last_day OR end_day-start_day>6
 THEN RAISE EXCEPTION '全司周计划须为当月内最多7天'; END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>100000
  OR (body-ARRAY['target','strategyText','sourceAsOf','sourceVersion','calculation','status'])<>'{}'::jsonb
  OR NOT(body ?& ARRAY['target','strategyText','sourceAsOf','sourceVersion','calculation','status'])
  OR body->>'status' IS NULL OR body->>'status' NOT IN ('draft','confirmed')
  OR jsonb_typeof(body->'strategyText') IS DISTINCT FROM 'string' OR length(body->>'strategyText')>12000
  OR jsonb_typeof(body->'sourceAsOf') IS DISTINCT FROM 'string' OR body->>'sourceAsOf' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  OR jsonb_typeof(body->'sourceVersion') IS DISTINCT FROM 'string' OR length(body->>'sourceVersion') NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION '全司周计划内容或来源格式不正确'; END IF;
 IF body->'target'<>'null'::jsonb THEN
  IF jsonb_typeof(body->'target') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '全司周目标须为整数或待确认'; END IF;
  count_value:=(body->>'target')::numeric;
  IF count_value<0 OR count_value>10000 OR count_value<>trunc(count_value) THEN RAISE EXCEPTION '全司周目标须为0至10000的整数'; END IF;
 END IF;
 BEGIN source_day:=(body->>'sourceAsOf')::date;source_time:=(body->>'sourceVersion')::timestamptz;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '全司周计划来源日期或版本不正确'; END;
 source_month:=to_char(source_day,'YYYY-MM');
 IF source_month<>mon AND source_month<>to_char(first_day-interval '1 month','YYYY-MM') THEN
  RAISE EXCEPTION '全司周计划须承接当月或上月的底表';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.wb_imports i WHERE i.month=source_month AND i.as_of=source_day AND i.created_at=source_time)
 THEN RAISE EXCEPTION '全司周计划未对应已导入的底表，请先刷新共享数据'; END IF;
 calc:=body->'calculation';
 IF jsonb_typeof(calc) IS DISTINCT FROM 'object'
  OR (calc-ARRAY['monthlyTarget','monthlyMet','remainingGap','remainingDays','periodDays','suggestedTarget'])<>'{}'::jsonb
  OR NOT(calc ?& ARRAY['monthlyTarget','monthlyMet','remainingGap','remainingDays','periodDays','suggestedTarget'])
 THEN RAISE EXCEPTION '全司周计划测算字段不正确'; END IF;
 FOR pair IN SELECT key,value FROM jsonb_each(calc) LOOP
  IF pair.value='null'::jsonb AND pair.key IN ('monthlyTarget','suggestedTarget') THEN CONTINUE; END IF;
  IF jsonb_typeof(pair.value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '全司周计划测算指标须为非负整数'; END IF;
  count_value:=(pair.value#>>'{}')::numeric;
  IF count_value<0 OR count_value>10000000 OR count_value<>trunc(count_value)
   OR (pair.key IN ('monthlyTarget','suggestedTarget') AND count_value>10000)
   OR (pair.key='remainingDays' AND count_value>31)
   OR (pair.key='periodDays' AND count_value NOT BETWEEN 1 AND 7)
  THEN RAISE EXCEPTION '全司周计划测算指标超出有效范围'; END IF;
 END LOOP;
 IF (calc->>'periodDays')::integer<>end_day-start_day+1 THEN RAISE EXCEPTION '测算天数与全司周计划日期不一致'; END IF;
 IF calc->'monthlyTarget'<>'null'::jsonb AND (calc->>'remainingGap')::numeric<>greatest(0,(calc->>'monthlyTarget')::numeric-(calc->>'monthlyMet')::numeric)
 THEN RAISE EXCEPTION '全司周计划剩余差距与月度目标不一致'; END IF;
 BEGIN expected_time:=nullif(p_args->>'expectedUpdatedAt','')::timestamptz;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '全司周计划版本不正确'; END;
 item_key:=mon||'|review|@@company|company-week-plan:'||start_text||':'||end_text;
 PERFORM pg_advisory_xact_lock(hashtext(item_key));
 SELECT * INTO old_item FROM public.wb_items i WHERE i.key=item_key FOR UPDATE;
 IF old_item.updated_at IS NOT NULL AND (expected_time IS NULL OR old_item.updated_at<>expected_time)
 THEN RAISE EXCEPTION '全司周计划已被更新，请保留当前内容并刷新后合并'; END IF;
 IF old_item.updated_at IS NULL AND expected_time IS NOT NULL THEN RAISE EXCEPTION '全司周计划版本已变化，请刷新后再保存'; END IF;
 IF old_item.key IS NOT NULL AND (old_item.kind<>'review' OR old_item.region IS NOT NULL OR old_item.store IS NOT NULL
  OR old_item.payload->>'recordType' IS DISTINCT FROM 'company-week-plan')
 THEN RAISE EXCEPTION '全司周计划记录范围冲突'; END IF;
 body:=body||jsonb_build_object('recordType','company-week-plan','version',1,'periodStart',start_text,'periodEnd',end_text,
  'updatedBy',coalesce(nullif(actor_member.display_name,''),'项目负责人'));
 INSERT INTO public.wb_items(key,month,kind,region,store,payload,updated_at)
 VALUES(item_key,mon,'review',NULL,NULL,body,clock_timestamp())
 ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at RETURNING * INTO saved;
 INSERT INTO public.wb_audit(month,region,store,action,actor,detail)
 VALUES(mon,NULL,NULL,'save-company-week-plan',md5(actor_member.email)::uuid,
  jsonb_build_object('key',item_key,'periodStart',start_text,'periodEnd',end_text,'savedUpdatedAt',saved.updated_at,
   'previous',CASE WHEN old_item.key IS NULL THEN NULL ELSE to_jsonb(old_item) END));
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.wb_company_week_plan_api(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_company_week_plan_api(text,text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
