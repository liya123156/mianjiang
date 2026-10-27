-- BP 业主面见工作台 V3.5：一次性在 Supabase SQL Editor 执行
-- 注意：替换文末的负责人邮箱。真实底表和反馈不会内嵌在静态网页里。
-- 勿将 service_role/secret key 写进网页或发给 BP。

CREATE TABLE IF NOT EXISTS public.wb_members (
  email text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('project','region','store')),
  region text,
  store text,
  enabled boolean NOT NULL DEFAULT true,
  CHECK ((role='project') OR (role='region' AND region IS NOT NULL AND store IS NULL)
    OR (role='store' AND region IS NOT NULL AND store IS NOT NULL))
);

CREATE OR REPLACE FUNCTION public.wb_actor()
RETURNS TABLE(role text, region text, store text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT m.role, m.region, m.store FROM public.wb_members m
  WHERE m.enabled AND lower(m.email) = lower(coalesce(auth.jwt() ->> 'email','')) LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.wb_is_project()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.wb_actor() a WHERE a.role='project')
$$;

CREATE OR REPLACE FUNCTION public.wb_can_read_scope(p_region text, p_store text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wb_actor() a WHERE
       a.role='project'
       OR (a.role='region' AND p_region=a.region)
       OR (a.role='store' AND p_region=a.region AND p_store=a.store)
  )
$$;

CREATE OR REPLACE FUNCTION public.wb_can_write_item(p_kind text, p_region text, p_store text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT public.wb_is_project()
     OR (
       p_kind IN ('expense','scene','task','review')
       AND EXISTS (SELECT 1 FROM public.wb_actor() a WHERE
         (a.role='region' AND p_region=a.region)
         OR (a.role='store' AND p_region=a.region AND p_store=a.store))
     )
$$;

CREATE TABLE IF NOT EXISTS public.wb_housing (
  month text NOT NULL CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  house_id text NOT NULL,
  region text NOT NULL,
  store text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(month, house_id)
);
CREATE INDEX IF NOT EXISTS wb_housing_region_store ON public.wb_housing(month, region, store);

CREATE TABLE IF NOT EXISTS public.wb_meetings (
  month text NOT NULL CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  event_key text NOT NULL,
  house_id text NOT NULL,
  region text NOT NULL,
  store text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(month, event_key)
);
CREATE INDEX IF NOT EXISTS wb_meetings_region_store ON public.wb_meetings(month, region, store);

CREATE TABLE IF NOT EXISTS public.wb_items (
  key text PRIMARY KEY,
  month text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('expense','scene','task','review','goals','rules')),
  region text,
  store text,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wb_items_month_scope ON public.wb_items(month,region,store);

ALTER TABLE public.wb_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_housing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wb_members_read ON public.wb_members;
CREATE POLICY wb_members_read ON public.wb_members FOR SELECT TO authenticated
USING (lower(email)=lower(coalesce(auth.jwt()->>'email','')) OR public.wb_is_project());
DROP POLICY IF EXISTS wb_members_admin ON public.wb_members;
CREATE POLICY wb_members_admin ON public.wb_members FOR ALL TO authenticated
USING (public.wb_is_project()) WITH CHECK (public.wb_is_project());

DROP POLICY IF EXISTS wb_housing_read ON public.wb_housing;
CREATE POLICY wb_housing_read ON public.wb_housing FOR SELECT TO authenticated
USING (public.wb_can_read_scope(region,store));
DROP POLICY IF EXISTS wb_meetings_read ON public.wb_meetings;
CREATE POLICY wb_meetings_read ON public.wb_meetings FOR SELECT TO authenticated
USING (public.wb_can_read_scope(region,store));

DROP POLICY IF EXISTS wb_items_read ON public.wb_items;
CREATE POLICY wb_items_read ON public.wb_items FOR SELECT TO authenticated
USING (public.wb_can_read_scope(region,store) OR (region IS NULL AND store IS NULL AND kind IN ('goals','rules') AND EXISTS(SELECT 1 FROM public.wb_actor())));
DROP POLICY IF EXISTS wb_items_insert ON public.wb_items;
CREATE POLICY wb_items_insert ON public.wb_items FOR INSERT TO authenticated
WITH CHECK (public.wb_can_write_item(kind,region,store));
DROP POLICY IF EXISTS wb_items_update ON public.wb_items;
CREATE POLICY wb_items_update ON public.wb_items FOR UPDATE TO authenticated
USING (public.wb_can_write_item(kind,region,store))
WITH CHECK (public.wb_can_write_item(kind,region,store));

-- 项目负责人一次性原子替换一个月的底表，不影响其他月份。
CREATE OR REPLACE FUNCTION public.wb_replace_month(p_month text, p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  IF NOT public.wb_is_project() THEN RAISE EXCEPTION 'Only project lead may upload company data'; END IF;
  IF p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) > 10000 THEN RAISE EXCEPTION 'Invalid month or row count'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) AS z(x)
             WHERE nullif(trim(x->>'房源编号'),'') IS NULL OR nullif(trim(x->>'大区'),'') IS NULL OR nullif(trim(x->>'门店'),'') IS NULL)
  THEN RAISE EXCEPTION 'Listing rows must have 房源编号, 大区 and 门店'; END IF;
  DELETE FROM public.wb_housing WHERE month=p_month;
  INSERT INTO public.wb_housing (month, house_id, region, store, payload)
  SELECT p_month, x->>'房源编号', x->>'大区', x->>'门店', x FROM
  (SELECT DISTINCT ON (value->>'房源编号') value AS x
      FROM jsonb_array_elements(p_rows) AS r(value)
      ORDER BY value->>'房源编号') d;
  GET DIAGNOSTICS n=ROW_COUNT;
  -- 刷新历史面见记录的当前责任门店归属，防止串店。
  UPDATE public.wb_meetings m SET region=h.region, store=h.store
  FROM public.wb_housing h WHERE m.month=p_month AND h.month=p_month AND m.house_id=h.house_id;
  RETURN n;
END;
$$;

-- 可多次增量导入面见明细，同一条只保留一个事件，不影响其他月份。
CREATE OR REPLACE FUNCTION public.wb_merge_meetings(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  IF NOT public.wb_is_project() THEN RAISE EXCEPTION 'Only project lead may upload company data'; END IF;
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>10000 THEN RAISE EXCEPTION 'Invalid rows'; END IF;
  INSERT INTO public.wb_meetings (month,event_key,house_id,region,store,payload)
  SELECT left(x->>'面见时间',7),
    md5(coalesce(x->>'房源编号','')||'|'||coalesce(x->>'面见时间','')||'|'||
        coalesce(x->>'面见人姓名',x->>'维护人姓名','')||'|'||coalesce(x->>'面见反馈','')),
    x->>'房源编号', coalesce(h.region, x->>'大区',''), coalesce(h.store,x->>'门店',''), x
  FROM jsonb_array_elements(p_rows) AS z(x)
  LEFT JOIN public.wb_housing h ON h.month=left(x->>'面见时间',7) AND h.house_id=x->>'房源编号'
  WHERE x->>'面见时间' ~ '^20[0-9]{2}-(0[1-9]|1[0-2])'
    AND nullif(trim(x->>'房源编号'),'') IS NOT NULL
  ON CONFLICT (month,event_key) DO UPDATE
    SET region=excluded.region,store=excluded.store,payload=excluded.payload,updated_at=now();
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n;
END;
$$;

-- 最小权限：匿名用户完全无法读取业务表。
REVOKE ALL ON public.wb_members, public.wb_housing, public.wb_meetings, public.wb_items FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.wb_members TO authenticated;
GRANT SELECT ON public.wb_housing, public.wb_meetings TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.wb_items TO authenticated;
REVOKE ALL ON FUNCTION public.wb_replace_month(text,jsonb), public.wb_merge_meetings(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wb_replace_month(text,jsonb), public.wb_merge_meetings(jsonb) TO authenticated;

-- 【必须修改】把这里换成项目负责人实际用于邮箱验证登录的邮箱。
-- 确认后再运行以下 INSERT，不要把示例邮箱原样使用。
-- INSERT INTO public.wb_members (email,role) VALUES ('LEAD_EMAIL@example.com','project') ON CONFLICT(email) DO UPDATE SET role='project',enabled=true;
-- 给其他 BP 开通权限（示例，改为真实邮箱与真实大区/门店）：
-- INSERT INTO public.wb_members(email,role,region,store) VALUES ('bp@example.com','store','黄浦大区','黄浦滨江店');
-- INSERT INTO public.wb_members(email,role,region,store) VALUES ('regionbp@example.com','region','黄浦大区',NULL);
-- 仅在 wb_members 名单中的邮箱登录后才可以读取授权范围的业务数据。

-- 私有付款凭证存储：BP 可以写入自己授权范围、查看自己授权范围。
-- Supabase Storage 中 bucket 为 private，无法被匿名 URL 直接读取。
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wb-evidence','wb-evidence',false,10485760,ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,
  allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp','application/pdf'];

DROP POLICY IF EXISTS wb_evidence_read ON storage.objects;
CREATE POLICY wb_evidence_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='wb-evidence'
  AND public.wb_can_read_scope((storage.foldername(name))[2],(storage.foldername(name))[3]));
DROP POLICY IF EXISTS wb_evidence_upload ON storage.objects;
CREATE POLICY wb_evidence_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='wb-evidence'
  AND public.wb_can_write_item('expense',(storage.foldername(name))[2],(storage.foldername(name))[3]));
