-- Shared work records: SQL draft, not a hosted migration until explicitly applied.
-- Requires wb_members + wb_code_sessions from database-code-access.sql.
-- No member names, employee numbers, login codes, API keys or model endpoints are seeded here.
-- Existing import, expense, private-housing and account-administration permissions are unchanged.
BEGIN;

-- Collaborators are real members with an intentionally unscoped role. Do not invent stores
-- or promote them to project. Provision their internal identity keys separately, server-side.
DO $$
DECLARE c record;
BEGIN
 IF to_regclass('public.wb_members') IS NULL OR to_regclass('public.wb_code_sessions') IS NULL THEN
  RAISE EXCEPTION '请先安装现有工号会话服务';
 END IF;
 FOR c IN
  SELECT k.conname FROM pg_constraint k
  JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attname='role'
  WHERE k.conrelid='public.wb_members'::regclass AND k.contype='c' AND a.attnum=ANY(k.conkey)
 LOOP
  EXECUTE format('ALTER TABLE public.wb_members DROP CONSTRAINT %I',c.conname);
 END LOOP;
 ALTER TABLE public.wb_members ADD CONSTRAINT wb_members_role_check
  CHECK(role IN ('project','region','store','collaborator'));
 ALTER TABLE public.wb_members ADD CONSTRAINT wb_members_scope_check
  CHECK(role='project' OR (role='region' AND region IS NOT NULL AND store IS NULL)
   OR (role='store' AND region IS NOT NULL AND store IS NOT NULL)
   OR (role='collaborator' AND region IS NULL AND store IS NULL));
END $$;

CREATE SCHEMA IF NOT EXISTS wb_work_private;
REVOKE ALL ON SCHEMA wb_work_private FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wb_work_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 month text NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 region text NOT NULL DEFAULT '' CHECK(length(region)<=120),
 store text NOT NULL DEFAULT '' CHECK(length(store)<=120),
 group_name text NOT NULL DEFAULT '' CHECK(length(group_name)<=160),
 title text NOT NULL DEFAULT '新工作记录' CHECK(length(title) BETWEEN 1 AND 200),
 summary jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(summary)='object' AND octet_length(summary::text)<=100000),
 summary_method text NOT NULL DEFAULT 'none' CHECK(summary_method IN ('none','manual')),
 summary_status text NOT NULL DEFAULT 'empty' CHECK(summary_status IN ('empty','draft','reviewed','stale')),
 summary_by text, summary_at timestamptz, summary_source_version integer,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','done')),
 owner_name text NOT NULL DEFAULT '' CHECK(length(owner_name)<=120), due_date date,
 occurred_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 source_version integer NOT NULL DEFAULT 1 CHECK(source_version>0),
 ai_status text NOT NULL DEFAULT 'pending' CHECK(ai_status IN ('pending','processing','ready','needs_confirmation','failed')),
 created_by text NOT NULL, created_name text NOT NULL,
 updated_by text NOT NULL, updated_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wb_work_records_month_scope ON public.wb_work_records(month,region,store,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.wb_work_record_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid REFERENCES public.wb_work_records(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 250),
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/aac','audio/ogg','audio/webm','audio/amr')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 content_hash text NOT NULL,
 -- Private bytes use the existing custom-session RPC pattern. They never get a public URL.
 bytes bytea NOT NULL CHECK(octet_length(bytes)=size_bytes),
 created_by text NOT NULL, created_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wb_work_record_attachments_record ON public.wb_work_record_attachments(record_id);
CREATE UNIQUE INDEX IF NOT EXISTS wb_work_record_attachments_pending_unique ON public.wb_work_record_attachments(created_by,content_hash,mime) WHERE record_id IS NULL;

CREATE TABLE IF NOT EXISTS public.wb_work_record_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.wb_work_records(id),
 source_version integer NOT NULL CHECK(source_version>0),
 raw_text text NOT NULL DEFAULT '' CHECK(length(raw_text)<=50000),
 attachment_ids uuid[] NOT NULL DEFAULT '{}',
 occurred_at timestamptz, fingerprint text NOT NULL,
 created_by text NOT NULL, created_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(length(btrim(raw_text))>0 OR cardinality(attachment_ids)>0),
 UNIQUE(record_id,source_version), UNIQUE(record_id,fingerprint)
);

CREATE TABLE IF NOT EXISTS public.wb_work_record_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 record_id uuid NOT NULL REFERENCES public.wb_work_records(id), version integer NOT NULL,
 type text NOT NULL CHECK(type IN ('created','source-appended','edited')),
 actor_email text NOT NULL, actor_name text NOT NULL,
 before_snapshot jsonb, after_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(record_id,version)
);

CREATE TABLE IF NOT EXISTS public.wb_work_record_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), record_id uuid NOT NULL REFERENCES public.wb_work_records(id),
 source_version integer NOT NULL, record_version integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','ready','needs_confirmation','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 last_error text NOT NULL DEFAULT 'AI整理服务尚未接入，原始信息已保存',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(record_id,source_version)
);

CREATE TABLE IF NOT EXISTS public.wb_work_record_requests (
 actor_email text NOT NULL, request_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('create','append','attachment-upload')),
 fingerprint text NOT NULL, record_id uuid REFERENCES public.wb_work_records(id),
 attachment_id uuid REFERENCES public.wb_work_record_attachments(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_email,request_id)
);

ALTER TABLE public.wb_work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_work_record_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_work_record_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_work_record_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_work_record_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_work_record_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_work_records,public.wb_work_record_attachments,public.wb_work_record_sources,
 public.wb_work_record_history,public.wb_work_record_jobs,public.wb_work_record_requests FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.wb_work_record_history_id_seq FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION wb_work_private.record_json(r public.wb_work_records)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'month',r.month,'region',r.region,'store',r.store,'group',r.group_name,
  'title',r.title,'status',r.status,'owner',r.owner_name,'due',r.due_date,'occurredAt',r.occurred_at,
  'summary',r.summary,'summaryMethod',r.summary_method,'summaryStatus',r.summary_status,
  'summaryBy',r.summary_by,'summaryAt',r.summary_at,'summarySourceVersion',r.summary_source_version,
  'version',r.version,'sourceVersion',r.source_version,'aiStatus',r.ai_status,
  'processorAvailable',false,'createdBy',r.created_name,'createdAt',r.created_at,
  'updatedBy',r.updated_name,'updatedAt',r.updated_at,
  'rawText',coalesce((SELECT string_agg(s.raw_text,E'\n\n' ORDER BY s.source_version) FROM public.wb_work_record_sources s WHERE s.record_id=r.id),''),
  'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'version',s.source_version,'rawText',s.raw_text,
   'attachmentIds',s.attachment_ids,'occurredAt',s.occurred_at,'createdBy',s.created_name,'createdAt',s.created_at) ORDER BY s.source_version)
   FROM public.wb_work_record_sources s WHERE s.record_id=r.id),'[]'::jsonb),
  'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'type',a.mime,
   'size',a.size_bytes,'createdBy',a.created_name,'createdAt',a.created_at) ORDER BY a.created_at,a.id)
   FROM public.wb_work_record_attachments a WHERE a.record_id=r.id),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION wb_work_private.record_json(public.wb_work_records) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wb_work_records_api(p_token text,p_action text,p_args jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE
 m public.wb_members; r public.wb_work_records; f public.wb_work_record_attachments;
 req public.wb_work_record_requests; rid uuid; v_request_id uuid; actor text; before_json jsonb;
 raw text; mon text; rg text; st text; grp text; title_text text; fp text; source_fp text;
 ids uuid[]; linked_count integer; linked_bytes bigint; existing_count integer; existing_bytes bigint;
 bin bytea; mime_text text; name_text text; result jsonb; expected integer; occurred timestamptz;
 list_limit integer; list_offset integer; summary_changed boolean;
BEGIN
 SELECT mm.* INTO m FROM public.wb_code_sessions ss JOIN public.wb_members mm ON mm.email=ss.email
  WHERE ss.token_hash=md5(coalesce(p_token,'')) AND ss.expires_at>now() AND mm.enabled
   AND mm.role IN ('project','collaborator');
 IF NOT FOUND THEN RAISE EXCEPTION '请使用已授权的工号进入共享工作记录' USING ERRCODE='42501'; END IF;
 actor:=coalesce(nullif(btrim(m.display_name),''),'协作成员');
 IF p_args IS NULL OR jsonb_typeof(p_args)<>'object' THEN RAISE EXCEPTION '提交内容格式不正确'; END IF;
 IF octet_length(p_args::text)>12000000 THEN RAISE EXCEPTION '提交内容过大，请分批上传'; END IF;

 IF p_action='list' THEN
  mon:=nullif(p_args->>'month','');
  IF mon IS NOT NULL AND mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '月份不正确'; END IF;
  list_limit:=least(200,greatest(1,coalesce((p_args->>'limit')::integer,100)));
  list_offset:=greatest(0,coalesce((p_args->>'offset')::integer,0));
  SELECT coalesce(jsonb_agg(wb_work_private.record_json(z) ORDER BY z.created_at DESC,z.id),'[]'::jsonb) INTO result
  FROM (SELECT wr.* FROM public.wb_work_records wr
   WHERE (mon IS NULL OR wr.month=mon)
    AND (nullif(p_args->>'region','') IS NULL OR wr.region=p_args->>'region')
    AND (nullif(p_args->>'store','') IS NULL OR wr.store=p_args->>'store')
    AND (nullif(p_args->>'id','') IS NULL OR wr.id=(p_args->>'id')::uuid)
   ORDER BY wr.created_at DESC,wr.id LIMIT list_limit OFFSET list_offset) z;
  RETURN jsonb_build_object('records',result,'processorAvailable',false,'limit',list_limit,'offset',list_offset);
 END IF;

 IF p_action='attachment-upload' THEN
  v_request_id:=(p_args->>'requestId')::uuid;
  IF v_request_id IS NULL THEN RAISE EXCEPTION '缺少上传标识，请重试'; END IF;
  name_text:=btrim(p_args->>'name');mime_text:=coalesce(p_args->>'type',p_args->>'mime');
  IF p_args ? 'type' AND p_args ? 'mime' AND p_args->>'type' IS DISTINCT FROM p_args->>'mime' THEN RAISE EXCEPTION '附件类型不一致'; END IF;
  IF name_text IS NULL OR length(name_text) NOT BETWEEN 1 AND 250 OR mime_text IS NULL
   OR mime_text NOT IN ('image/png','image/jpeg','image/webp','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/aac','audio/ogg','audio/webm','audio/amr') THEN
   RAISE EXCEPTION '附件仅支持PNG、JPG、WebP图片或常用录音格式';
  END IF;
  IF length(coalesce(p_args->>'data',''))>11184812 THEN RAISE EXCEPTION '单个附件不能超过8MB'; END IF;
  BEGIN bin:=decode(p_args->>'data','base64'); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION '附件数据不正确'; END;
  IF bin IS NULL OR octet_length(bin) NOT BETWEEN 1 AND 8388608 THEN RAISE EXCEPTION '单个附件须为1字节至8MB'; END IF;
  fp:=md5(bin);source_fp:=md5(jsonb_build_object('hash',fp,'type',mime_text,'name',name_text)::text);
  PERFORM pg_advisory_xact_lock(hashtext('wb-work-request:'||m.email||':'||v_request_id));
  SELECT * INTO req FROM public.wb_work_record_requests q WHERE q.actor_email=m.email AND q.request_id=v_request_id;
  IF FOUND THEN
   IF req.action<>'attachment-upload' OR req.fingerprint<>source_fp THEN RAISE EXCEPTION '同一上传标识的内容已变化，请重新提交'; END IF;
   SELECT * INTO f FROM public.wb_work_record_attachments a WHERE a.id=req.attachment_id;
   IF NOT FOUND THEN RAISE EXCEPTION '附件已移除，请重新上传'; END IF;
  ELSE
   PERFORM pg_advisory_xact_lock(hashtext('wb-work-attachment-quota'));
   SELECT * INTO f FROM public.wb_work_record_attachments a WHERE a.created_by=m.email AND a.content_hash=fp AND a.mime=mime_text AND a.record_id IS NULL;
   IF NOT FOUND THEN
    IF (SELECT coalesce(sum(a.size_bytes),0) FROM public.wb_work_record_attachments a)+octet_length(bin)>67108864 THEN
     RAISE EXCEPTION '共享记录附件容量已达64MB，请先处理未使用附件';
    END IF;
    INSERT INTO public.wb_work_record_attachments(name,mime,size_bytes,content_hash,bytes,created_by,created_name)
     VALUES(name_text,mime_text,octet_length(bin),fp,bin,m.email,actor) RETURNING * INTO f;
   END IF;
   INSERT INTO public.wb_work_record_requests(actor_email,request_id,action,fingerprint,attachment_id)
    VALUES(m.email,v_request_id,'attachment-upload',source_fp,f.id);
  END IF;
  RETURN jsonb_build_object('attachment',jsonb_build_object('id',f.id,'name',f.name,'type',f.mime,'size',f.size_bytes,'createdBy',f.created_name,'createdAt',f.created_at));
 END IF;

 IF p_action IN ('attachment-read','attachment-delete') THEN
  SELECT * INTO f FROM public.wb_work_record_attachments a WHERE a.id=(p_args->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR (f.record_id IS NULL AND f.created_by<>m.email) THEN RAISE EXCEPTION '附件不存在或无权查看' USING ERRCODE='42501'; END IF;
  IF p_action='attachment-read' THEN
   RETURN jsonb_build_object('data',encode(f.bytes,'base64'),'type',f.mime,'name',f.name);
  END IF;
  IF f.record_id IS NOT NULL OR f.created_by<>m.email THEN RAISE EXCEPTION '仅可移除本人尚未关联记录的附件'; END IF;
  DELETE FROM public.wb_work_record_requests WHERE attachment_id=f.id;
  DELETE FROM public.wb_work_record_attachments WHERE id=f.id;
  RETURN jsonb_build_object('deleted',true);
 END IF;

 IF p_action IN ('create','append') THEN
  v_request_id:=(p_args->>'requestId')::uuid;
  IF v_request_id IS NULL THEN RAISE EXCEPTION '缺少本次提交标识，请重试'; END IF;
  raw:=btrim(coalesce(p_args->>'rawText',''));
  IF length(raw)>50000 THEN RAISE EXCEPTION '单次文字不能超过50000字'; END IF;
  IF p_args ? 'attachmentIds' AND jsonb_typeof(p_args->'attachmentIds')<>'array' THEN RAISE EXCEPTION '附件列表不正确'; END IF;
  SELECT coalesce(array_agg(DISTINCT x::uuid ORDER BY x::uuid),'{}'::uuid[]) INTO ids FROM jsonb_array_elements_text(coalesce(p_args->'attachmentIds','[]')) z(x);
  IF cardinality(ids)>4 THEN RAISE EXCEPTION '每次最多提交4个附件'; END IF;
  IF raw='' AND cardinality(ids)=0 THEN RAISE EXCEPTION '请补充原始文字或附件'; END IF;
  occurred:=nullif(p_args->>'occurredAt','')::timestamptz;
  fp:=md5((p_args-'requestId')::text);
  PERFORM pg_advisory_xact_lock(hashtext('wb-work-request:'||m.email||':'||v_request_id));
  SELECT * INTO req FROM public.wb_work_record_requests q WHERE q.actor_email=m.email AND q.request_id=v_request_id;
  IF FOUND THEN
   IF req.action<>p_action OR req.fingerprint<>fp THEN RAISE EXCEPTION '同一提交标识的内容已变化，请重新提交'; END IF;
   SELECT * INTO r FROM public.wb_work_records wr WHERE wr.id=req.record_id;
   RETURN jsonb_build_object('record',wb_work_private.record_json(r),'processorAvailable',false,'duplicate',true);
  END IF;

  IF p_action='create' THEN
   mon:=p_args->>'month';rg:=btrim(coalesce(p_args->>'region',''));st:=btrim(coalesce(p_args->>'store',''));grp:=btrim(coalesce(p_args->>'group',''));
   title_text:=coalesce(nullif(btrim(p_args->>'title'),''),'新工作记录');
   IF mon IS NULL OR mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '请选择记录所属月份'; END IF;
   IF length(rg)>120 OR length(st)>120 OR length(grp)>160 OR length(title_text)>200 THEN RAISE EXCEPTION '组织名称或标题过长'; END IF;
   INSERT INTO public.wb_work_records(month,region,store,group_name,title,occurred_at,created_by,created_name,updated_by,updated_name)
    VALUES(mon,rg,st,grp,title_text,occurred,m.email,actor,m.email,actor) RETURNING * INTO r;
   before_json:=NULL;
  ELSE
   rid:=(p_args->>'id')::uuid;
   SELECT * INTO r FROM public.wb_work_records wr WHERE wr.id=rid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION '工作记录不存在'; END IF;
   expected:=(p_args->>'expectedVersion')::integer;
   IF expected IS NULL OR expected<>r.version THEN RAISE EXCEPTION '记录已被其他伙伴更新，请刷新后重试' USING ERRCODE='40001'; END IF;
   before_json:=wb_work_private.record_json(r);
   IF (SELECT coalesce(sum(length(s.raw_text)),0) FROM public.wb_work_record_sources s WHERE s.record_id=r.id)+length(raw)>250000 THEN RAISE EXCEPTION '本事项原文较多，请新建关联事项'; END IF;
  END IF;

  -- Lock attachment rows before eligibility/quota checks; linking and source creation commit together.
  PERFORM a.id FROM public.wb_work_record_attachments a WHERE a.id=ANY(ids) ORDER BY a.id FOR UPDATE;
  SELECT count(*),coalesce(sum(a.size_bytes),0) INTO linked_count,linked_bytes FROM public.wb_work_record_attachments a
   WHERE a.id=ANY(ids) AND ((a.record_id IS NULL AND a.created_by=m.email) OR a.record_id=r.id);
  IF linked_count<>cardinality(ids) THEN RAISE EXCEPTION '附件已被使用、已移除或无权关联，请重新核对'; END IF;
  SELECT count(*),coalesce(sum(a.size_bytes),0) INTO existing_count,existing_bytes FROM public.wb_work_record_attachments a WHERE a.record_id=r.id AND NOT(a.id=ANY(ids));
  IF existing_count+linked_count>4 OR existing_bytes+linked_bytes>20971520 THEN RAISE EXCEPTION '同一事项最多4个附件、合计不超过20MB'; END IF;
  source_fp:=md5(jsonb_build_object('rawText',raw,'attachments',ids,'occurredAt',occurred)::text);
  IF p_action='append' AND EXISTS(SELECT 1 FROM public.wb_work_record_sources s WHERE s.record_id=r.id AND s.fingerprint=source_fp) THEN
   INSERT INTO public.wb_work_record_requests(actor_email,request_id,action,fingerprint,record_id) VALUES(m.email,v_request_id,p_action,fp,r.id);
   RETURN jsonb_build_object('record',wb_work_private.record_json(r),'processorAvailable',false,'duplicate',true);
  END IF;
  IF p_action='append' THEN
   UPDATE public.wb_work_records SET version=version+1,source_version=source_version+1,ai_status='pending',
    summary_status=CASE WHEN summary_status='empty' THEN 'empty' ELSE 'stale' END,
    updated_by=m.email,updated_name=actor,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
  END IF;
  UPDATE public.wb_work_record_attachments SET record_id=r.id WHERE id=ANY(ids);
  INSERT INTO public.wb_work_record_sources(record_id,source_version,raw_text,attachment_ids,occurred_at,fingerprint,created_by,created_name)
   VALUES(r.id,r.source_version,raw,ids,occurred,source_fp,m.email,actor);
  INSERT INTO public.wb_work_record_jobs(record_id,source_version,record_version) VALUES(r.id,r.source_version,r.version) ON CONFLICT DO NOTHING;
  INSERT INTO public.wb_work_record_history(record_id,version,type,actor_email,actor_name,before_snapshot,after_snapshot)
   VALUES(r.id,r.version,CASE WHEN p_action='create' THEN 'created' ELSE 'source-appended' END,m.email,actor,before_json,wb_work_private.record_json(r));
  INSERT INTO public.wb_work_record_requests(actor_email,request_id,action,fingerprint,record_id) VALUES(m.email,v_request_id,p_action,fp,r.id);
  RETURN jsonb_build_object('record',wb_work_private.record_json(r),'processorAvailable',false);
 END IF;

 IF p_action IN ('edit','history') THEN
  rid:=(p_args->>'id')::uuid;
  SELECT * INTO r FROM public.wb_work_records wr WHERE wr.id=rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '工作记录不存在'; END IF;
  IF p_action='history' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'type',h.type,'actorName',h.actor_name,'createdAt',h.created_at,
    'version',h.version,'before',h.before_snapshot,'after',h.after_snapshot) ORDER BY h.version DESC),'[]'::jsonb) INTO result
    FROM public.wb_work_record_history h WHERE h.record_id=r.id;
   RETURN jsonb_build_object('history',result);
  END IF;
  expected:=(p_args->>'expectedVersion')::integer;
  IF expected IS NULL OR expected<>r.version THEN RAISE EXCEPTION '记录已被其他伙伴更新，请刷新后重试' USING ERRCODE='40001'; END IF;
  before_json:=wb_work_private.record_json(r);
  IF p_args ? 'summary' AND (jsonb_typeof(p_args->'summary')<>'object' OR octet_length((p_args->'summary')::text)>100000) THEN RAISE EXCEPTION '归纳内容须为JSON对象且不超过100KB'; END IF;
  IF p_args ? 'status' AND (p_args->>'status' IS NULL OR p_args->>'status' NOT IN ('open','in_progress','blocked','done')) THEN RAISE EXCEPTION '推进状态不正确'; END IF;
  IF p_args ? 'summaryReviewStatus' AND (p_args->>'summaryReviewStatus' IS NULL OR p_args->>'summaryReviewStatus' NOT IN ('draft','reviewed')) THEN RAISE EXCEPTION '核对状态不正确'; END IF;
  summary_changed:=p_args ? 'summary';
  UPDATE public.wb_work_records SET
   title=CASE WHEN p_args ? 'title' THEN btrim(coalesce(p_args->>'title','')) ELSE title END,
   region=CASE WHEN p_args ? 'region' THEN btrim(coalesce(p_args->>'region','')) ELSE region END,
   store=CASE WHEN p_args ? 'store' THEN btrim(coalesce(p_args->>'store','')) ELSE store END,
   group_name=CASE WHEN p_args ? 'group' THEN btrim(coalesce(p_args->>'group','')) ELSE group_name END,
   status=CASE WHEN p_args ? 'status' THEN p_args->>'status' ELSE status END,
   owner_name=CASE WHEN p_args ? 'owner' THEN btrim(coalesce(p_args->>'owner','')) ELSE owner_name END,
   due_date=CASE WHEN p_args ? 'due' THEN nullif(p_args->>'due','')::date ELSE due_date END,
   occurred_at=CASE WHEN p_args ? 'occurredAt' THEN nullif(p_args->>'occurredAt','')::timestamptz ELSE occurred_at END,
   summary=CASE WHEN summary_changed THEN p_args->'summary' ELSE summary END,
   summary_method=CASE WHEN summary_changed THEN 'manual' ELSE summary_method END,
   summary_status=CASE WHEN summary_changed THEN coalesce(p_args->>'summaryReviewStatus','draft') ELSE summary_status END,
   summary_by=CASE WHEN summary_changed THEN actor ELSE summary_by END,
   summary_at=CASE WHEN summary_changed THEN clock_timestamp() ELSE summary_at END,
   summary_source_version=CASE WHEN summary_changed THEN source_version ELSE summary_source_version END,
   version=version+1,updated_by=m.email,updated_name=actor,updated_at=clock_timestamp()
   WHERE id=r.id RETURNING * INTO r;
  UPDATE public.wb_work_record_jobs SET record_version=r.version,updated_at=clock_timestamp()
   WHERE record_id=r.id AND source_version=r.source_version AND status='pending';
  INSERT INTO public.wb_work_record_history(record_id,version,type,actor_email,actor_name,before_snapshot,after_snapshot)
   VALUES(r.id,r.version,'edited',m.email,actor,before_json,wb_work_private.record_json(r));
  RETURN jsonb_build_object('record',wb_work_private.record_json(r),'processorAvailable',false);
 END IF;
 RAISE EXCEPTION '不支持的共享记录操作';
END $$;
REVOKE ALL ON FUNCTION public.wb_work_records_api(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_work_records_api(text,text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
