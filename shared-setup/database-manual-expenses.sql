-- Apply after database-upgrade.sql. Adds verified manual gift expenses through
-- the existing save RPC; no existing records, permissions or ledger rules change.
CREATE OR REPLACE FUNCTION public.wb_save_item(
 p_month text,p_kind text,p_id text,p_region text,p_store text,p_payload jsonb,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 item_key text; old_time timestamptz; old_payload jsonb; result public.wb_items;
 manual_key boolean; gift_record boolean; manual_record boolean;
 unit_cents numeric; gift_quantity numeric; address_project text; address_room text; gift_day date;
BEGIN
 IF p_month IS NULL OR p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
 OR p_kind IS NULL OR p_kind NOT IN ('expense','task','scene','review','goals','rules') THEN RAISE EXCEPTION '月份或记录类型不正确'; END IF;
 IF p_kind IN ('goals','rules') THEN
   IF NOT public.wb_is_project() THEN RAISE EXCEPTION '仅负责人可调整目标与费用规则'; END IF;
   IF p_kind='goals' AND (p_store IS NOT NULL OR p_region IS NOT NULL) THEN RAISE EXCEPTION '月度目标须按全司保存'; END IF;
   IF p_kind='rules' AND (nullif(p_store,'') IS NULL OR nullif(p_region,'') IS NULL) THEN RAISE EXCEPTION '费用规则须选择单店'; END IF;
 ELSE
   IF nullif(p_store,'') IS NULL OR nullif(p_region,'') IS NULL OR NOT public.wb_can_write_item(p_kind,p_region,p_store) THEN RAISE EXCEPTION '没有此门店的编辑权限'; END IF;
 END IF;
 IF p_kind IN ('expense','rules') THEN
   -- This is also used by closing/unlocking, and serializes same-store address checks.
   PERFORM pg_advisory_xact_lock(hashtext('ledger:'||p_month||':'||p_store));
   IF NOT public.wb_month_open(p_month,p_store) THEN RAISE EXCEPTION '本月账本已锁定，请负责人先解锁'; END IF;
 END IF;
 IF nullif(trim(p_id),'') IS NULL OR length(p_id)>250 OR p_payload IS NULL
 OR jsonb_typeof(p_payload)<>'object' OR length(p_payload::text)>250000 THEN RAISE EXCEPTION '记录内容超出允许范围'; END IF;
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
