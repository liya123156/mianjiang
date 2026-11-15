-- Narrow repair for the project-only publication configuration already used by the UI.
-- Replaces wb_save_item only. No table, policy, membership, data or finance permission changes.
-- Apply after database-manual-expenses.sql. Existing expense validation remains intact.
BEGIN;
CREATE OR REPLACE FUNCTION public.wb_save_item(
 p_month text,p_kind text,p_id text,p_region text,p_store text,p_payload jsonb,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 item_key text; old_time timestamptz; old_payload jsonb; result public.wb_items;
 manual_key boolean; gift_record boolean; manual_record boolean;
 send_config boolean; send_row jsonb; send_name text; send_org text;
 send_seen_stores text[]:=ARRAY[]::text[]; send_seen_regions text[]:=ARRAY[]::text[];
 send_seen_groups text[]:=ARRAY[]::text[]; send_seen_pilots text[]:=ARRAY[]::text[];
 send_catalog jsonb:='{
  "仁恒河滨城店":"花木大区","碧云店":"花木大区","御翠园店":"花木大区","浦东别墅旗舰店":"花木大区",
  "星河湾店":"陆家嘴大区","陆家嘴金融中心店":"陆家嘴大区","陆家嘴旗舰店":"陆家嘴大区","陆家嘴滨江店":"陆家嘴大区","顶级豪宅部":"陆家嘴大区",
  "嘉御庭公馆店":"徐汇大区","尚海湾店":"徐汇大区","徐汇滨江店":"徐汇大区",
  "融创滨江壹号院店":"滨江古北大区","长宁古北店":"滨江古北大区",
  "黄浦滨江店":"黄浦大区","新天地一店":"黄浦大区","新天地二店":"黄浦大区","复兴香园店":"黄浦大区"
 }'::jsonb;
 unit_cents numeric; gift_quantity numeric; address_project text; address_room text; gift_day date;
BEGIN
 IF p_month IS NULL OR p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
 OR p_kind IS NULL OR p_kind NOT IN ('expense','task','scene','review','goals','rules') THEN RAISE EXCEPTION '月份或记录类型不正确'; END IF;
 -- This one private, project-only configuration is not an expense rule.
 send_config:=coalesce(p_month='2000-01' AND p_kind='rules' AND p_id='wechat-send-config-v1'
   AND p_region IS NULL AND p_store IS NULL,false);
 IF p_kind IN ('goals','rules') THEN
   IF NOT public.wb_is_project() THEN RAISE EXCEPTION '仅负责人可调整目标与费用规则'; END IF;
   IF p_kind='goals' AND (p_store IS NOT NULL OR p_region IS NOT NULL) THEN RAISE EXCEPTION '月度目标须按全司保存'; END IF;
   IF p_kind='rules' AND NOT send_config AND (nullif(p_store,'') IS NULL OR nullif(p_region,'') IS NULL) THEN RAISE EXCEPTION '费用规则须选择单店'; END IF;
 ELSE
   IF nullif(p_store,'') IS NULL OR nullif(p_region,'') IS NULL OR NOT public.wb_can_write_item(p_kind,p_region,p_store) THEN RAISE EXCEPTION '没有此门店的编辑权限'; END IF;
 END IF;
 IF p_kind IN ('expense','rules') AND NOT send_config THEN
   -- This is also used by closing/unlocking, and serializes same-store address checks.
   PERFORM pg_advisory_xact_lock(hashtext('ledger:'||p_month||':'||p_store));
   IF NOT public.wb_month_open(p_month,p_store) THEN RAISE EXCEPTION '本月账本已锁定，请负责人先解锁'; END IF;
 END IF;
 IF nullif(trim(p_id),'') IS NULL OR length(p_id)>250 OR p_payload IS NULL
 OR jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>250000 THEN RAISE EXCEPTION '记录内容超出允许范围'; END IF;
 IF send_config THEN
   -- Match the already published validator: 1 company + 5 regions + 18 owner stores.
   -- Empty names are valid drafts. Nonempty names must be distinct across all 24 scopes.
   IF p_payload->'version' IS DISTINCT FROM '2'::jsonb
     OR p_payload->>'recordType' IS DISTINCT FROM 'wechat-send-config'
     OR p_payload->>'mode' IS NULL OR p_payload->>'mode' NOT IN ('all','pilot')
     OR jsonb_typeof(p_payload->'company') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'regions') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'stores') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_payload->'pilotStores') IS DISTINCT FROM 'array'
     OR (p_payload-ARRAY['version','recordType','mode','company','regions','stores','pilotStores'])<>'{}'::jsonb THEN
     RAISE EXCEPTION '项目群配置结构或版本不正确';
   END IF;
   IF jsonb_array_length(p_payload->'regions')<>5 OR jsonb_array_length(p_payload->'stores')<>18
     OR ((p_payload->'company')-'groupName')<>'{}'::jsonb
     OR jsonb_typeof(p_payload->'company'->'groupName') IS DISTINCT FROM 'string' THEN
     RAISE EXCEPTION '项目群配置须包含全司、5个大区和18家在售门店';
   END IF;
   send_name:=p_payload->'company'->>'groupName';
   IF length(send_name)>200 OR send_name~'[[:cntrl:]]'
     OR send_name~'^[[:space:] ]|[[:space:] ]$' THEN
     RAISE EXCEPTION '微信群完整名称无效或重复';
   END IF;
   IF send_name<>'' THEN send_seen_groups:=array_append(send_seen_groups,send_name); END IF;
   FOR send_row IN SELECT value FROM jsonb_array_elements(p_payload->'regions') LOOP
     IF jsonb_typeof(send_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(send_row->'region') IS DISTINCT FROM 'string'
       OR jsonb_typeof(send_row->'groupName') IS DISTINCT FROM 'string'
       OR (send_row-ARRAY['region','groupName'])<>'{}'::jsonb THEN
       RAISE EXCEPTION '大区群配置字段不正确';
     END IF;
     send_org:=send_row->>'region';send_name:=send_row->>'groupName';
     IF send_org NOT IN ('花木大区','陆家嘴大区','徐汇大区','滨江古北大区','黄浦大区')
       OR send_org=ANY(send_seen_regions) THEN RAISE EXCEPTION '大区群配置无效或重复'; END IF;
     IF length(send_name)>200 OR send_name~'[[:cntrl:]]'
       OR send_name~'^[[:space:] ]|[[:space:] ]$'
       OR (send_name<>'' AND send_name=ANY(send_seen_groups)) THEN
       RAISE EXCEPTION '微信群完整名称无效或重复';
     END IF;
     send_seen_regions:=array_append(send_seen_regions,send_org);
     IF send_name<>'' THEN send_seen_groups:=array_append(send_seen_groups,send_name); END IF;
   END LOOP;
   FOR send_row IN SELECT value FROM jsonb_array_elements(p_payload->'stores') LOOP
     IF jsonb_typeof(send_row) IS DISTINCT FROM 'object'
       OR jsonb_typeof(send_row->'region') IS DISTINCT FROM 'string'
       OR jsonb_typeof(send_row->'store') IS DISTINCT FROM 'string'
       OR jsonb_typeof(send_row->'groupName') IS DISTINCT FROM 'string'
       OR (send_row-ARRAY['region','store','groupName'])<>'{}'::jsonb THEN
       RAISE EXCEPTION '门店群配置字段不正确';
     END IF;
     send_org:=send_row->>'store';send_name:=send_row->>'groupName';
     IF NOT(send_catalog ? send_org) OR send_catalog->>send_org IS DISTINCT FROM send_row->>'region'
       OR send_org=ANY(send_seen_stores) THEN RAISE EXCEPTION '门店群配置无效、重复或大区不匹配'; END IF;
     IF length(send_name)>200 OR send_name~'[[:cntrl:]]'
       OR send_name~'^[[:space:] ]|[[:space:] ]$'
       OR (send_name<>'' AND send_name=ANY(send_seen_groups)) THEN
       RAISE EXCEPTION '微信群完整名称无效或重复';
     END IF;
     send_seen_stores:=array_append(send_seen_stores,send_org);
     IF send_name<>'' THEN send_seen_groups:=array_append(send_seen_groups,send_name); END IF;
   END LOOP;
   FOR send_row IN SELECT value FROM jsonb_array_elements(p_payload->'pilotStores') LOOP
     send_org:=send_row#>>'{}';
     IF jsonb_typeof(send_row) IS DISTINCT FROM 'string' OR send_org=ANY(send_seen_pilots)
       OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'stores') s(value)
         WHERE s.value->>'store'=send_org AND s.value->>'groupName'<>'') THEN
       RAISE EXCEPTION '试行名单须对应已配置完整群名的门店且不可重复';
     END IF;
     send_seen_pilots:=array_append(send_seen_pilots,send_org);
   END LOOP;
   IF p_payload->>'mode'='pilot' AND cardinality(send_seen_pilots)=0 THEN
     RAISE EXCEPTION '试行名单须包含已配置完整群名的门店';
   END IF;
 END IF;
 item_key:=p_month||'|'||p_kind||'|'||coalesce(p_store,'@@company')||'|'||p_id;
 PERFORM pg_advisory_xact_lock(hashtext(item_key));
 SELECT updated_at,payload INTO old_time,old_payload FROM public.wb_items WHERE key=item_key FOR UPDATE;
 IF old_time IS NOT NULL AND (p_expected_updated_at IS NULL OR old_time<>p_expected_updated_at) THEN RAISE EXCEPTION '记录已被其他成员更新，请刷新后再保存'; END IF;
 IF old_time IS NULL AND p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION '记录状态已变化，请刷新后再保存'; END IF;
 manual_key:=p_kind='expense' AND left(p_id,7)='@@gift:';
 gift_record:=p_kind='expense' AND (left(p_id,2)<>'@@' OR manual_key OR p_payload->>'recordType'='gift');
 manual_record:=gift_record AND (manual_key OR p_payload->>'source'='manual' OR old_payload->>'source'='manual');
 IF gift_record THEN
   IF manual_key THEN
     IF p_id !~ '^@@gift:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       OR coalesce(p_payload->>'houseId','')<>'' OR coalesce(p_payload->>'expenseId','')<>p_id
       OR coalesce(p_payload->>'recordType','')<>'gift' OR coalesce(p_payload->>'source','')<>'manual' THEN
       RAISE EXCEPTION '手工送礼明细编号或类型不正确';
     END IF;
   ELSIF left(p_id,2)='@@' THEN
     RAISE EXCEPTION '送礼明细编号不能使用其他账目类型';
   ELSE
     -- Cross-store writes use the same house/month lock before checking duplicates.
     PERFORM pg_advisory_xact_lock(hashtext('gift:'||p_month||':'||p_id));
     IF coalesce(p_payload->>'houseId','')<>p_id THEN RAISE EXCEPTION '费用房源编号不一致'; END IF;
     IF EXISTS(SELECT 1 FROM public.wb_items WHERE month=p_month AND kind='expense' AND key<>item_key
       AND payload->>'houseId'=p_id AND coalesce(payload->>'voided','false')<>'true') THEN
       RAISE EXCEPTION '该房源本月已登记费用，请编辑已有明细，不能重复报销';
     END IF;
     IF old_time IS NULL AND NOT EXISTS(SELECT 1 FROM public.wb_housing WHERE month=p_month AND house_id=p_id AND region=p_region AND store=p_store) THEN
       IF EXISTS(SELECT 1 FROM public.wb_housing WHERE month=p_month AND house_id=p_id)
         OR NOT coalesce(manual_record,false) THEN RAISE EXCEPTION '底表中不存在该门店房源'; END IF;
     END IF;
   END IF;
   IF jsonb_typeof(p_payload->'priceCents') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '实际单价须为大于0的分币整数'; END IF;
   unit_cents:=(p_payload->>'priceCents')::numeric;
   IF unit_cents<=0 OR unit_cents<>trunc(unit_cents) OR unit_cents>9007199254740991 THEN RAISE EXCEPTION '实际单价须为大于0的有效分币整数'; END IF;
   IF p_payload ? 'quantity' AND jsonb_typeof(p_payload->'quantity') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION '数量须为1至10000的整数'; END IF;
   gift_quantity:=coalesce((p_payload->>'quantity')::numeric,1);
   IF gift_quantity<1 OR gift_quantity>10000 OR gift_quantity<>trunc(gift_quantity) THEN RAISE EXCEPTION '数量须为1至10000的整数'; END IF;
   IF unit_cents*gift_quantity>9007199254740991 THEN RAISE EXCEPTION '费用总额超出有效范围'; END IF;
   address_project:=lower(regexp_replace(normalize(coalesce(p_payload->>'project',''),NFKC),'[[:space:] ]+','','g'));
   address_room:=lower(regexp_replace(normalize(coalesce(p_payload->>'room',''),NFKC),'[[:space:] ]+','','g'));
   IF manual_record THEN
     IF address_project='' OR address_room='' THEN RAISE EXCEPTION '请填写小区及楼栋房号，便于核账和检查重复'; END IF;
     IF p_payload->'bpVerified' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION '请先核实该笔送礼记录，再补录费用'; END IF;
     IF coalesce(p_payload->>'recordType','')<>'gift' OR coalesce(p_payload->>'source','')<>'manual' THEN RAISE EXCEPTION '手工送礼明细来源不能改变'; END IF;
   END IF;
   IF nullif(p_payload->>'giftDate','') IS NOT NULL THEN
     IF p_payload->>'giftDate' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION '送礼日期格式不正确'; END IF;
     BEGIN gift_day:=(p_payload->>'giftDate')::date;
     EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION '送礼日期不正确'; END;
     IF to_char(gift_day,'YYYY-MM')<>p_month THEN RAISE EXCEPTION '送礼日期须属于当前核账月份'; END IF;
   END IF;
   -- A real house ID disambiguates identical labels. Address matching is needed
   -- whenever either side is a manual record without a real house ID.
   IF address_project<>'' AND address_room<>'' AND EXISTS(
     SELECT 1 FROM public.wb_items i WHERE i.month=p_month AND i.kind='expense' AND i.store=p_store AND i.key<>item_key
       AND (i.payload->>'recordType'='gift' OR nullif(i.payload->>'houseId','') IS NOT NULL)
       AND coalesce(i.payload->>'voided','false')<>'true'
       AND (coalesce(p_payload->>'houseId','')='' OR coalesce(i.payload->>'houseId','')='')
       AND lower(regexp_replace(normalize(coalesce(i.payload->>'project',''),NFKC),'[[:space:] ]+','','g'))=address_project
       AND lower(regexp_replace(normalize(coalesce(i.payload->>'room',''),NFKC),'[[:space:] ]+','','g'))=address_room
   ) THEN RAISE EXCEPTION '本店本月已有相同房源的送礼明细，请编辑已有记录并核实数量，勿重复补录'; END IF;
   p_payload:=p_payload||jsonb_build_object('expenseId',p_id,'quantity',gift_quantity);
 END IF;
 IF nullif(p_payload->>'proofPath','') IS NOT NULL AND left(p_payload->>'proofPath',length(p_month||'/'||p_region||'/'||p_store||'/'))<>p_month||'/'||p_region||'/'||p_store||'/' THEN RAISE EXCEPTION '凭证须属于本店本月'; END IF;
 INSERT INTO public.wb_items(key,month,kind,region,store,payload,updated_at)
 VALUES(item_key,p_month,p_kind,p_region,p_store,p_payload,clock_timestamp())
 ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at RETURNING * INTO result;
 INSERT INTO public.wb_audit(month,region,store,action,actor,detail)
 VALUES(p_month,p_region,p_store,'save-'||p_kind,auth.uid(),jsonb_build_object('key',item_key));
 RETURN to_jsonb(result);
END $$;
-- Preserve the current RPC privileges, including the approved employee-code wrapper.
REVOKE ALL ON FUNCTION public.wb_save_item(text,text,text,text,text,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wb_save_item(text,text,text,text,text,jsonb,timestamptz) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
