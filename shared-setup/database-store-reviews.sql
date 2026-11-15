-- Shared store weekly/monthly reviews inside the existing workbench.
-- Uses existing employee-code sessions. Does not enable shared work records,
-- alter membership, finance permissions, legacy RPCs, RLS or existing records.
-- The public callable RPC verifies its private, unexpired session before any read.
BEGIN;
CREATE OR REPLACE FUNCTION public.wb_store_review_api(
 p_token text,p_action text,p_args jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor_member public.wb_members; saved public.wb_items; old_item public.wb_items;
 mon text; period_type text; start_text text; end_text text; first_day date; last_day date;
 start_day date; end_day date; region_name text; store_name text; item_key text;
 expected_time timestamptz; body jsonb; form_fields jsonb; snap jsonb; counts jsonb;
 pair record; group_row jsonb; note_row jsonb; count_value numeric; group_names text[]:=ARRAY[]::text[];
 catalog jsonb:='{
  "仁恒河滨城店":"花木大区","碧云店":"花木大区","御翠园店":"花木大区","浦东别墅旗舰店":"花木大区",
  "星河湾店":"陆家嘴大区","陆家嘴金融中心店":"陆家嘴大区","陆家嘴旗舰店":"陆家嘴大区","陆家嘴滨江店":"陆家嘴大区","顶级豪宅部":"陆家嘴大区",
  "嘉御庭公馆店":"徐汇大区","尚海湾店":"徐汇大区","徐汇滨江店":"徐汇大区",
  "融创滨江壹号院店":"滨江古北大区","长宁古北店":"滨江古北大区",
  "黄浦滨江店":"黄浦大区","新天地一店":"黄浦大区","新天地二店":"黄浦大区","复兴香园店":"黄浦大区"
 }'::jsonb;
BEGIN
 SELECT m.* INTO actor_member FROM public.wb_code_sessions s
 JOIN public.wb_members m ON m.email=s.email
 WHERE s.token_hash=md5(p_token) AND s.expires_at>now() AND m.enabled
  AND m.login_id IN ('0003','0921','1317','1446','3401','3448','3273','0562')
  AND m.role IN ('project','collaborator');
 IF NOT FOUND THEN RAISE EXCEPTION '请使用已授权工号进入复盘；会话可能已过期'; END IF;
 IF jsonb_typeof(p_args) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '复盘参数不正确'; END IF;
 mon:=p_args->>'month';
 IF mon IS NULL OR mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '复盘月份不正确'; END IF;
 IF p_action='load' THEN
  IF (p_args-ARRAY['month'])<>'{}'::jsonb THEN RAISE EXCEPTION '复盘读取参数不正确'; END IF;
  -- One SELECT obtains a consistent import, sanitized source and review collection.
  RETURN (WITH latest AS (
   SELECT i.as_of,i.created_at FROM public.wb_imports i WHERE i.month=mon
   ORDER BY i.as_of DESC,i.created_at DESC LIMIT 1
  ) SELECT jsonb_build_object('month',mon,
   'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.region,i.store,i.key)
    FROM public.wb_items i WHERE i.month=mon AND i.kind='review'
     AND i.payload->>'recordType'='store-period-review'
     AND catalog->>i.store=i.region
     AND EXISTS(SELECT 1 FROM public.wb_audit a WHERE a.month=i.month AND a.action='save-store-period-review'
      AND a.detail->>'key'=i.key AND (a.detail->>'savedUpdatedAt')::timestamptz=i.updated_at)),'[]'::jsonb),
   'previousItems',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.region,i.store,i.key)
    FROM public.wb_items i WHERE i.month=to_char((mon||'-01')::date-interval '1 month','YYYY-MM')
     AND i.kind='review' AND i.payload->>'recordType'='store-period-review'
     AND catalog->>i.store=i.region
     AND EXISTS(SELECT 1 FROM public.wb_audit a WHERE a.month=i.month AND a.action='save-store-period-review'
      AND a.detail->>'key'=i.key AND (a.detail->>'savedUpdatedAt')::timestamptz=i.updated_at)),'[]'::jsonb),
   'businessData',jsonb_build_object('month',mon,
    'housing',coalesce((SELECT jsonb_agg(jsonb_build_object(
     '房源编号',md5(h.house_id),'大区',h.region,'门店',h.store,'店组',h.payload->'店组',
     '细分在售户数',coalesce(h.payload->'细分在售户数',h.payload->'在售户数'),
     '本月是否面见',h.payload->'本月是否面见','本月是否送礼物',h.payload->'本月是否送礼物',
     '门店top户数',h.payload->'门店top户数','户型top户数',h.payload->'户型top户数'
    ) ORDER BY h.store,h.house_id) FROM public.wb_housing h
    WHERE h.month=mon AND catalog->>h.store=h.region),'[]'::jsonb),
    'meetings',coalesce((SELECT jsonb_agg(jsonb_build_object(
     '面见id',md5(m.event_key),'房源编号',md5(m.house_id),
     '大区',h.region,'门店',h.store,'面见时间',m.payload->'面见时间'
    ) ORDER BY m.event_key) FROM public.wb_meetings m
    JOIN public.wb_housing h ON h.month=m.month AND h.house_id=m.house_id
    WHERE m.month=mon AND catalog->>h.store=h.region
     AND left(m.payload->>'面见时间',7)=mon
     AND left(m.payload->>'面见时间',10)<=coalesce((SELECT as_of::text FROM latest),'')
    ),'[]'::jsonb),
    'imports',coalesce((SELECT jsonb_agg(jsonb_build_object('as_of',as_of,'created_at',created_at)) FROM latest),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.key) FROM public.wb_items i
     WHERE i.month=mon AND i.kind='goals'),'[]'::jsonb)
   )));
 END IF;
 IF p_action IS DISTINCT FROM 'save' THEN RAISE EXCEPTION '不支持的复盘操作'; END IF;
 IF (p_args-ARRAY['month','periodType','periodStart','periodEnd','region','store','payload','expectedUpdatedAt'])<>'{}'::jsonb
 THEN RAISE EXCEPTION '复盘保存参数不正确'; END IF;
 period_type:=p_args->>'periodType';start_text:=p_args->>'periodStart';end_text:=p_args->>'periodEnd';
 region_name:=p_args->>'region';store_name:=p_args->>'store';body:=p_args->'payload';
 IF NOT(catalog ? coalesce(store_name,'')) OR catalog->>store_name IS DISTINCT FROM region_name
 THEN RAISE EXCEPTION '复盘门店与大区不匹配'; END IF;
 IF period_type IS NULL OR period_type NOT IN ('weekly','monthly')
  OR start_text IS NULL OR start_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  OR end_text IS NULL OR end_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION '复盘周期不正确'; END IF;
 BEGIN
  start_day:=start_text::date;end_day:=end_text::date;first_day:=(mon||'-01')::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '复盘日期不正确'; END;
 last_day:=(first_day+interval '1 month - 1 day')::date;
 IF start_day> end_day OR start_day<first_day OR end_day>last_day
  OR (period_type='weekly' AND end_day-start_day>6)
  OR (period_type='monthly' AND (start_day<>first_day OR end_day<>last_day))
 THEN RAISE EXCEPTION '周复盘须为当月内最多7天，月复盘须为完整当月'; END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>100000
  OR (body-ARRAY['fields','snapshot','status'])<>'{}'::jsonb
  OR body->>'status' IS NULL OR body->>'status' NOT IN ('draft','confirmed')
 THEN RAISE EXCEPTION '复盘内容或状态不正确'; END IF;
 form_fields:=body->'fields';snap:=body->'snapshot';
 IF jsonb_typeof(form_fields) IS DISTINCT FROM 'object'
  OR (form_fields-ARRAY['periodGoal','actions','execution','highlights','blockers','nextGoal','nextActions','owner','due'])<>'{}'::jsonb
  OR NOT(form_fields ?& ARRAY['periodGoal','actions','execution','highlights','blockers','nextGoal','nextActions','owner','due'])
 THEN RAISE EXCEPTION '复盘填写字段不正确'; END IF;
 FOR pair IN SELECT key,value FROM jsonb_each(form_fields) LOOP
  IF pair.key IN ('periodGoal','nextGoal') THEN
   IF pair.value<>'null'::jsonb THEN
    IF jsonb_typeof(pair.value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '复盘目标须为整数或待确认'; END IF;
    count_value:=(pair.value#>>'{}')::numeric;
    IF count_value<0 OR count_value>10000 OR count_value<>trunc(count_value) THEN RAISE EXCEPTION '复盘目标须为0至10000的整数'; END IF;
   END IF;
  ELSE
   IF jsonb_typeof(pair.value) IS DISTINCT FROM 'string' OR length(pair.value#>>'{}')>(CASE WHEN pair.key='owner' THEN 120 WHEN pair.key='due' THEN 10 ELSE 8000 END)
   THEN RAISE EXCEPTION '复盘文字长度或格式不正确'; END IF;
  END IF;
 END LOOP;
 IF form_fields->>'due'<>'' THEN
  IF form_fields->>'due' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION '复查日期不正确'; END IF;
  BEGIN PERFORM (form_fields->>'due')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '复查日期不正确'; END;
 END IF;
 IF jsonb_typeof(snap) IS DISTINCT FROM 'object'
  OR (snap-ARRAY['version','month','region','store','periodType','periodStart','periodEnd','asOf','sourceVersion','monthly','period','groups','notes'])<>'{}'::jsonb
  OR NOT(snap ?& ARRAY['version','month','region','store','periodType','periodStart','periodEnd','asOf','sourceVersion','monthly','period','groups','notes'])
  OR snap->'version' IS DISTINCT FROM '1'::jsonb
  OR snap->>'month' IS DISTINCT FROM mon OR snap->>'region' IS DISTINCT FROM region_name OR snap->>'store' IS DISTINCT FROM store_name
  OR snap->>'periodType' IS DISTINCT FROM period_type OR snap->>'periodStart' IS DISTINCT FROM start_text OR snap->>'periodEnd' IS DISTINCT FROM end_text
  OR jsonb_typeof(snap->'asOf') IS DISTINCT FROM 'string' OR jsonb_typeof(snap->'sourceVersion') IS DISTINCT FROM 'string'
  OR length(snap->>'sourceVersion') NOT BETWEEN 1 AND 100 OR snap->>'asOf'=''
 THEN RAISE EXCEPTION '复盘数据快照范围或字段不正确'; END IF;
 IF snap->>'asOf'<>'' THEN
  IF snap->>'asOf' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' OR left(snap->>'asOf',7)<>mon THEN RAISE EXCEPTION '快照截止日期不正确'; END IF;
  BEGIN PERFORM (snap->>'asOf')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '快照截止日期不正确'; END;
 END IF;
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.wb_imports i WHERE i.month=mon AND i.as_of=(snap->>'asOf')::date
   AND i.created_at=(snap->>'sourceVersion')::timestamptz)
  THEN RAISE EXCEPTION '快照未对应已导入的底表，请先刷新共享数据'; END IF;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '快照来源版本不正确'; END;
 IF jsonb_typeof(snap->'monthly') IS DISTINCT FROM 'object'
  OR ((snap->'monthly')-ARRAY['target','stock','met','meetingCount','storeTopStock','storeTopMet','unitTopStock','unitTopMet','gift'])<>'{}'::jsonb
  OR NOT(snap->'monthly' ?& ARRAY['target','stock','met','meetingCount','storeTopStock','storeTopMet','unitTopStock','unitTopMet','gift'])
  OR jsonb_typeof(snap->'period') IS DISTINCT FROM 'object'
  OR ((snap->'period')-ARRAY['met','meetingCount','storeTopMet','unitTopMet','pendingDateCount','qualityCounts','qualityAvailable'])<>'{}'::jsonb
  OR NOT(snap->'period' ?& ARRAY['met','meetingCount','storeTopMet','unitTopMet','pendingDateCount','qualityCounts','qualityAvailable'])
  OR jsonb_typeof(snap->'period'->'qualityAvailable') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(snap->'period'->'qualityCounts') IS DISTINCT FROM 'object'
  OR ((snap->'period'->'qualityCounts')-ARRAY['P','M','R','E','V','C','O','U'])<>'{}'::jsonb
 THEN RAISE EXCEPTION '快照指标字段不正确'; END IF;
 FOR pair IN SELECT key,value FROM jsonb_each(snap->'monthly')
  UNION ALL SELECT key,value FROM jsonb_each((snap->'period')-ARRAY['qualityCounts','qualityAvailable'])
  UNION ALL SELECT key,value FROM jsonb_each(snap->'period'->'qualityCounts') LOOP
  IF pair.value<>'null'::jsonb THEN
   IF jsonb_typeof(pair.value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '快照指标须为非负整数或待核实'; END IF;
   count_value:=(pair.value#>>'{}')::numeric;
   IF count_value<0 OR count_value>10000000 OR count_value<>trunc(count_value) THEN RAISE EXCEPTION '快照指标须为有效非负整数'; END IF;
  END IF;
 END LOOP;
 IF jsonb_typeof(snap->'groups') IS DISTINCT FROM 'array' OR jsonb_array_length(snap->'groups')>100
  OR jsonb_typeof(snap->'notes') IS DISTINCT FROM 'array' OR jsonb_array_length(snap->'notes')>30
 THEN RAISE EXCEPTION '店组数据或数据说明不正确'; END IF;
 FOR group_row IN SELECT value FROM jsonb_array_elements(snap->'groups') LOOP
  IF jsonb_typeof(group_row) IS DISTINCT FROM 'object'
   OR (group_row-ARRAY['group','stock','met','meetingCount','monthlyMet','storeTopStock','storeTopMet','unitTopStock','unitTopMet'])<>'{}'::jsonb
   OR NOT(group_row ?& ARRAY['group','stock','met','meetingCount','monthlyMet','storeTopStock','storeTopMet','unitTopStock','unitTopMet'])
   OR jsonb_typeof(group_row->'group') IS DISTINCT FROM 'string'
   OR length(group_row->>'group') NOT BETWEEN 1 AND 160 OR group_row->>'group'=ANY(group_names)
  THEN RAISE EXCEPTION '店组快照字段不正确或重复'; END IF;
  group_names:=array_append(group_names,group_row->>'group');
  FOR pair IN SELECT key,value FROM jsonb_each(group_row-'group') LOOP
   IF pair.value<>'null'::jsonb THEN
    IF jsonb_typeof(pair.value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '店组指标须为非负整数或待核实'; END IF;
    count_value:=(pair.value#>>'{}')::numeric;
    IF count_value<0 OR count_value>10000000 OR count_value<>trunc(count_value) THEN RAISE EXCEPTION '店组指标须为有效非负整数'; END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOR note_row IN SELECT value FROM jsonb_array_elements(snap->'notes') LOOP
  IF jsonb_typeof(note_row) IS DISTINCT FROM 'string' OR length(note_row#>>'{}')>1000 THEN RAISE EXCEPTION '数据说明长度或格式不正确'; END IF;
 END LOOP;
 BEGIN expected_time:=nullif(p_args->>'expectedUpdatedAt','')::timestamptz;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '复盘版本不正确'; END;
 item_key:=mon||'|review|'||store_name||'|store-period-review:'||period_type||':'||start_text||':'||end_text;
 PERFORM pg_advisory_xact_lock(hashtext(item_key));
 SELECT * INTO old_item FROM public.wb_items i WHERE i.key=item_key FOR UPDATE;
 IF old_item.updated_at IS NOT NULL AND (expected_time IS NULL OR old_item.updated_at<>expected_time)
 THEN RAISE EXCEPTION '这份复盘已被其他BP更新，请保留当前填写内容并刷新后合并'; END IF;
 IF old_item.updated_at IS NULL AND expected_time IS NOT NULL THEN RAISE EXCEPTION '复盘版本已变化，请刷新后再保存'; END IF;
 IF old_item.key IS NOT NULL AND (old_item.kind<>'review' OR old_item.region<>region_name OR old_item.store<>store_name
   OR old_item.payload->>'recordType' IS DISTINCT FROM 'store-period-review')
 THEN RAISE EXCEPTION '复盘记录范围冲突'; END IF;
 body:=body||jsonb_build_object('recordType','store-period-review','version',1,'periodType',period_type,
  'periodStart',start_text,'periodEnd',end_text,'updatedBy',coalesce(nullif(actor_member.display_name,''),'BP'));
 INSERT INTO public.wb_items(key,month,kind,region,store,payload,updated_at)
 VALUES(item_key,mon,'review',region_name,store_name,body,clock_timestamp())
 ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at RETURNING * INTO saved;
 INSERT INTO public.wb_audit(month,region,store,action,actor,detail)
 VALUES(mon,region_name,store_name,'save-store-period-review',md5(actor_member.email)::uuid,
  jsonb_build_object('key',item_key,'periodType',period_type,'start',start_text,'end',end_text,
   'savedUpdatedAt',saved.updated_at,
   'previous',CASE WHEN old_item.key IS NULL THEN NULL ELSE to_jsonb(old_item) END));
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.wb_store_review_api(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_store_review_api(text,text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
