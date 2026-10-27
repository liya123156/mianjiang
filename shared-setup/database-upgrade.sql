-- Apply after database-setup.sql. Schema supports daily snapshots, durable records and locked ledgers.
ALTER TABLE public.wb_members ADD COLUMN IF NOT EXISTS stores jsonb NOT NULL DEFAULT '[]';
CREATE OR REPLACE FUNCTION public.wb_can_read_scope(p_region text,p_store text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.wb_members m
 WHERE m.enabled AND lower(m.email)=lower(coalesce(auth.jwt()->>'email','')) AND (
 m.role='project' OR (m.role='region' AND m.region=p_region)
 OR (m.role='store' AND ((m.region=p_region AND m.store=p_store) OR EXISTS(
 SELECT 1 FROM jsonb_array_elements(m.stores) z(x) WHERE x->>'region'=p_region AND x->>'store'=p_store)))))
$$;
CREATE OR REPLACE FUNCTION public.wb_can_write_item(p_kind text,p_region text,p_store text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT public.wb_is_project() OR (p_kind IN ('expense','scene','task','review') AND public.wb_can_read_scope(p_region,p_store))
$$;
CREATE TABLE IF NOT EXISTS public.wb_imports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 month text NOT NULL, as_of date NOT NULL, filenames jsonb NOT NULL DEFAULT '[]',
 housing_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor uuid
);
CREATE TABLE IF NOT EXISTS public.wb_snapshots (
 month text NOT NULL, as_of date NOT NULL, region text NOT NULL, store text NOT NULL,
 payload jsonb NOT NULL, PRIMARY KEY(month,as_of,store)
);
CREATE TABLE IF NOT EXISTS public.wb_periods (
 month text NOT NULL,region text NOT NULL,store text NOT NULL,locked boolean NOT NULL DEFAULT false,
 summary jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(month,store)
);
CREATE TABLE IF NOT EXISTS public.wb_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,month text NOT NULL,region text,store text,
 action text NOT NULL,actor uuid,created_at timestamptz NOT NULL DEFAULT now(),detail jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE public.wb_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wb_imports_read ON public.wb_imports;
CREATE POLICY wb_imports_read ON public.wb_imports FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.wb_actor()));
DROP POLICY IF EXISTS wb_snapshots_read ON public.wb_snapshots;
CREATE POLICY wb_snapshots_read ON public.wb_snapshots FOR SELECT TO authenticated
 USING(public.wb_can_read_scope(region,store));
DROP POLICY IF EXISTS wb_periods_read ON public.wb_periods;
CREATE POLICY wb_periods_read ON public.wb_periods FOR SELECT TO authenticated
 USING(public.wb_can_read_scope(region,store));
DROP POLICY IF EXISTS wb_audit_read ON public.wb_audit;
CREATE POLICY wb_audit_read ON public.wb_audit FOR SELECT TO authenticated
 USING(public.wb_can_read_scope(region,store));
REVOKE ALL ON public.wb_imports,public.wb_snapshots,public.wb_periods,public.wb_audit FROM anon,authenticated;
GRANT SELECT ON public.wb_imports,public.wb_snapshots,public.wb_periods,public.wb_audit TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.wb_items FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.wb_replace_month(text,jsonb),public.wb_merge_meetings(jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.wb_month_open(p_month text,p_store text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.wb_periods WHERE month=p_month AND store=p_store AND locked)
$$;

CREATE OR REPLACE FUNCTION public.wb_import_snapshot(
 p_month text,p_as_of date,p_rows jsonb,p_meetings jsonb,p_snapshots jsonb,p_filenames jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; latest date;
BEGIN
 IF NOT public.wb_is_project() THEN RAISE EXCEPTION '仅项目负责人可导入全司数据'; END IF;
 IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR to_char(p_as_of,'YYYY-MM')<>p_month
 OR p_as_of>(now() AT TIME ZONE 'Asia/Shanghai')::date THEN RAISE EXCEPTION '数据截止日期不正确'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('mianjiang-import-'||p_month));
 SELECT max(as_of) INTO latest FROM public.wb_imports WHERE month=p_month;
 IF latest IS NOT NULL AND p_as_of<latest THEN RAISE EXCEPTION '不能用较早快照覆盖最新进展'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 10000
 OR jsonb_typeof(p_meetings)<>'array' OR jsonb_array_length(p_meetings)>10000
 OR jsonb_typeof(p_snapshots)<>'array' THEN RAISE EXCEPTION '上传记录格式不正确'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) z(x)
 WHERE nullif(trim(x->>'房源编号'),'') IS NULL OR (coalesce(x->>'细分在售户数',x->>'在售户数') IN ('1','true','是') AND (nullif(trim(x->>'大区'),'') IS NULL
 OR nullif(trim(x->>'门店'),'') IS NULL OR nullif(trim(x->>'店组'),'') IS NULL))) THEN RAISE EXCEPTION '主管理房源组织或房源编号缺失'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_rows))<>(SELECT count(DISTINCT x->>'房源编号') FROM jsonb_array_elements(p_rows) z(x)) THEN RAISE EXCEPTION '底表房源编号重复'; END IF;
 DELETE FROM public.wb_housing WHERE month=p_month;
 INSERT INTO public.wb_housing(month,house_id,region,store,payload)
 SELECT p_month,x->>'房源编号',coalesce(x->>'大区',''),coalesce(x->>'门店',''),x FROM jsonb_array_elements(p_rows) z(x);
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.wb_meetings(month,event_key,house_id,region,store,payload)
 SELECT p_month,event_key,
 x->>'房源编号',coalesce(h.region,x->>'大区'),coalesce(h.store,x->>'门店'),x
 FROM (SELECT DISTINCT ON(event_key) x,event_key FROM (
   SELECT x,ordinality,CASE WHEN nullif(x->>'面见id','') IS NOT NULL THEN 'id:'||(x->>'面见id') ELSE md5(coalesce(x->>'房源编号','')||'|'||coalesce(x->>'面见时间','')||'|'||coalesce(x->>'面见人姓名',x->>'维护人姓名','')) END AS event_key
   FROM jsonb_array_elements(p_meetings) WITH ORDINALITY z(x,ordinality)
 ) incoming ORDER BY event_key,ordinality DESC) deduplicated
 LEFT JOIN public.wb_housing h ON h.month=p_month AND h.house_id=x->>'房源编号'
 WHERE left(x->>'面见时间',7)=p_month AND left(x->>'面见时间',10)::date<=p_as_of
 AND nullif(x->>'房源编号','') IS NOT NULL
 ON CONFLICT(month,event_key) DO UPDATE SET region=excluded.region,store=excluded.store,payload=excluded.payload,updated_at=now();
 DELETE FROM public.wb_snapshots WHERE month=p_month AND as_of=p_as_of;
 INSERT INTO public.wb_snapshots(month,as_of,region,store,payload)
 SELECT p_month,p_as_of,x->>'region',x->>'store',x->'payload' FROM jsonb_array_elements(p_snapshots) z(x)
 WHERE EXISTS(SELECT 1 FROM public.wb_housing h WHERE h.month=p_month AND h.region=x->>'region' AND h.store=x->>'store');
 INSERT INTO public.wb_imports(month,as_of,filenames,housing_count,actor) VALUES(p_month,p_as_of,p_filenames,n,auth.uid());
 INSERT INTO public.wb_audit(month,action,actor,detail) VALUES(p_month,'import',auth.uid(),jsonb_build_object('as_of',p_as_of,'rows',n));
 RETURN jsonb_build_object('housing',n,'as_of',p_as_of);
END $$;

CREATE OR REPLACE FUNCTION public.wb_save_item(
 p_month text,p_kind text,p_id text,p_region text,p_store text,p_payload jsonb,p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item_key text;old_time timestamptz;result public.wb_items;
BEGIN
 IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR p_kind NOT IN ('expense','task','scene','review','goals','rules') THEN RAISE EXCEPTION '月份或记录类型不正确'; END IF;
 IF p_kind IN ('goals','rules') THEN
   IF NOT public.wb_is_project() THEN RAISE EXCEPTION '仅负责人可调整目标与费用规则'; END IF;
   IF p_kind='goals' AND (p_store IS NOT NULL OR p_region IS NOT NULL) THEN RAISE EXCEPTION '月度目标须按全司保存'; END IF;
   IF p_kind='rules' AND (nullif(p_store,'') IS NULL OR nullif(p_region,'') IS NULL) THEN RAISE EXCEPTION '费用规则须选择单店'; END IF;
 ELSE
   IF p_store IS NULL OR p_region IS NULL OR NOT public.wb_can_write_item(p_kind,p_region,p_store) THEN RAISE EXCEPTION '没有此门店的编辑权限'; END IF;
 END IF;
 IF p_kind IN ('expense','rules') THEN
   PERFORM pg_advisory_xact_lock(hashtext('ledger:'||p_month||':'||p_store));
   IF NOT public.wb_month_open(p_month,p_store) THEN RAISE EXCEPTION '本月账本已锁定，请负责人先解锁'; END IF;
 END IF;
 IF p_id IS NULL OR length(p_id)>250 OR length(p_payload::text)>250000 THEN RAISE EXCEPTION '记录内容超出允许范围'; END IF;
 item_key:=p_month||'|'||p_kind||'|'||coalesce(p_store,'@@company')||'|'||p_id;
 IF p_kind='expense' AND left(p_id,2)<>'@@' THEN
   PERFORM pg_advisory_xact_lock(hashtext('gift:'||p_month||':'||p_id));
   IF EXISTS(SELECT 1 FROM public.wb_items WHERE month=p_month AND kind='expense' AND key<>item_key AND payload->>'houseId'=p_id) THEN RAISE EXCEPTION '该房源本月已在其他门店登记费用，请负责人核对归属，不能重复报销'; END IF;
   IF coalesce(p_payload->>'houseId','')<>p_id THEN RAISE EXCEPTION '费用房源编号不一致'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.wb_housing WHERE month=p_month AND house_id=p_id AND region=p_region AND store=p_store)
      AND NOT EXISTS(SELECT 1 FROM public.wb_items WHERE key=item_key) THEN RAISE EXCEPTION '底表中不存在该门店房源'; END IF;
 END IF;
 IF p_payload->>'proofPath' IS NOT NULL AND left(p_payload->>'proofPath',length(p_month||'/'||p_region||'/'||p_store||'/'))<>p_month||'/'||p_region||'/'||p_store||'/' THEN RAISE EXCEPTION '凭证须属于本店本月'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(item_key));
 SELECT updated_at INTO old_time FROM public.wb_items WHERE key=item_key FOR UPDATE;
 IF old_time IS NOT NULL AND (p_expected_updated_at IS NULL OR old_time<>p_expected_updated_at) THEN RAISE EXCEPTION '记录已被其他成员更新，请刷新后再保存'; END IF;
 IF old_time IS NULL AND p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION '记录状态已变化，请刷新后再保存'; END IF;
 INSERT INTO public.wb_items(key,month,kind,region,store,payload,updated_at)
 VALUES(item_key,p_month,p_kind,p_region,p_store,p_payload,clock_timestamp())
 ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at RETURNING * INTO result;
 INSERT INTO public.wb_audit(month,region,store,action,actor,detail) VALUES(p_month,p_region,p_store,'save-'||p_kind,auth.uid(),jsonb_build_object('key',item_key));
 RETURN to_jsonb(result);
END $$;

CREATE OR REPLACE FUNCTION public.wb_set_period(p_month text,p_region text,p_store text,p_locked boolean,p_summary jsonb,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.wb_periods;
BEGIN
 IF NOT public.wb_is_project() THEN RAISE EXCEPTION '仅项目负责人可结账或解锁'; END IF;
 IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR nullif(p_region,'') IS NULL OR nullif(p_store,'') IS NULL THEN RAISE EXCEPTION '请选择月份及单店'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('ledger:'||p_month||':'||p_store));
 IF NOT p_locked AND length(trim(coalesce(p_reason,'')))<2 THEN RAISE EXCEPTION '解锁须填写原因'; END IF;
 IF p_locked AND (coalesce((p_summary->>'missing')::integer,1)>0 OR p_summary->>'closingStore' IS NULL OR p_summary->>'closingRegion' IS NULL) THEN RAISE EXCEPTION '凭证、单价和人员信息未齐，不能结账'; END IF;
 INSERT INTO public.wb_periods(month,region,store,locked,summary,updated_at) VALUES(p_month,p_region,p_store,p_locked,p_summary,clock_timestamp())
 ON CONFLICT(month,store) DO UPDATE SET locked=excluded.locked,summary=excluded.summary,updated_at=excluded.updated_at RETURNING * INTO result;
 INSERT INTO public.wb_audit(month,region,store,action,actor,detail) VALUES(p_month,p_region,p_store,CASE WHEN p_locked THEN 'lock' ELSE 'unlock' END,auth.uid(),jsonb_build_object('reason',p_reason,'summary',p_summary));
 RETURN to_jsonb(result);
END $$;

REVOKE ALL ON FUNCTION public.wb_import_snapshot(text,date,jsonb,jsonb,jsonb,jsonb),public.wb_save_item(text,text,text,text,text,jsonb,timestamptz),public.wb_set_period(text,text,text,boolean,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wb_import_snapshot(text,date,jsonb,jsonb,jsonb,jsonb),public.wb_save_item(text,text,text,text,text,jsonb,timestamptz),public.wb_set_period(text,text,text,boolean,jsonb,text) TO authenticated;
DROP POLICY IF EXISTS wb_evidence_upload ON storage.objects;
CREATE POLICY wb_evidence_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='wb-evidence' AND public.wb_can_write_item('expense',(storage.foldername(name))[2],(storage.foldername(name))[3])
 AND public.wb_month_open((storage.foldername(name))[1],(storage.foldername(name))[3]));
