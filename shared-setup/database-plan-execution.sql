-- 11月项目规划与执行：独立于费用核销和旧 wb_items 的任务及验收账本。
-- 前置：database-setup.sql / database-upgrade.sql / database-code-access.sql。
-- 本文件可重复部署；不含账号创建、不修改旧业务数据、不把规划标记成完成。
BEGIN;

CREATE TABLE IF NOT EXISTS public.wb_plan_actions (
 month text NOT NULL CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 id text NOT NULL CHECK (length(id) BETWEEN 1 AND 100),
 definition jsonb NOT NULL CHECK (jsonb_typeof(definition)='object'),
 version integer NOT NULL DEFAULT 1 CHECK (version>0),
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(month,id),
 CHECK (definition->>'scope' IN ('company','region','store')),
 CHECK (definition->>'ownerRole' IN ('project','region','store')),
 CHECK (definition->>'frequency' IN ('once','daily','weekly'))
);
CREATE TABLE IF NOT EXISTS public.wb_plan_stores (
 month text NOT NULL CHECK (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 id text NOT NULL, region text NOT NULL CHECK (length(btrim(region)) BETWEEN 1 AND 100),
 store text NOT NULL CHECK (length(btrim(store)) BETWEEN 1 AND 100),
 source text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK (version>0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(month,id), UNIQUE(month,store)
);
CREATE TABLE IF NOT EXISTS public.wb_plan_tasks (
 id text PRIMARY KEY, month text NOT NULL, action_id text NOT NULL,
 action_snapshot jsonb NOT NULL,
 scope text NOT NULL CHECK (scope IN ('company','region','store')),
 owner_role text NOT NULL CHECK (owner_role IN ('project','region','store')),
 region text NOT NULL DEFAULT '', store text NOT NULL DEFAULT '',
 task_date date NOT NULL, due_date date NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','submitted','accepted','rejected')),
 version integer NOT NULL DEFAULT 1 CHECK (version>0), report jsonb NOT NULL DEFAULT '{}',
 submitted_by text, submitted_at timestamptz, reviewed_by text, reviewed_at timestamptz,
 review_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(month,action_id) REFERENCES public.wb_plan_actions(month,id),
 UNIQUE(month,action_id,scope,region,store,task_date),
 CHECK ((scope='company' AND region='' AND store='') OR (scope='region' AND region<>'' AND store='') OR (scope='store' AND region<>'' AND store<>'')),
 CHECK ((scope='company' AND owner_role='project') OR (scope='region' AND owner_role='region') OR (scope='store' AND owner_role='store'))
);
CREATE TABLE IF NOT EXISTS public.wb_plan_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 month text NOT NULL, task_id text REFERENCES public.wb_plan_tasks(id),
 type text NOT NULL, actor_email text, actor_name text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wb_plan_tasks_month_scope_date ON public.wb_plan_tasks(month,region,store,due_date);
CREATE INDEX IF NOT EXISTS wb_plan_events_month_task ON public.wb_plan_events(month,task_id,id);
ALTER TABLE public.wb_plan_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_plan_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_plan_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_plan_actions,public.wb_plan_stores,public.wb_plan_tasks,public.wb_plan_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.wb_plan_events_id_seq FROM PUBLIC,anon,authenticated;

-- 内部函数均撤销外部执行权限。成员和责任人只从服务端授权表读取。
CREATE OR REPLACE FUNCTION public.wb_plan_in_scope(m public.wb_members,p_scope text,p_region text,p_store text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(m.enabled AND (m.role='project' OR
  (m.role='region' AND p_scope<>'company' AND m.region=p_region) OR
  (m.role='store' AND p_scope='store' AND ((m.region=p_region AND m.store=p_store) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(m.stores,'[]'::jsonb)) s WHERE s->>'region'=p_region AND s->>'store'=p_store)))),false)
$$;
CREATE OR REPLACE FUNCTION public.wb_plan_assignees(p_role text,p_scope text,p_region text,p_store text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',coalesce(nullif(btrim(m.display_name),''),CASE m.role WHEN 'project' THEN '项目负责人' WHEN 'region' THEN '大区BP' ELSE '店面BP' END),'role',m.role) ORDER BY m.display_name,m.email),'[]'::jsonb)
 FROM public.wb_members m WHERE m.enabled AND m.role=p_role AND public.wb_plan_in_scope(m,p_scope,p_region,p_store)
$$;
CREATE OR REPLACE FUNCTION public.wb_plan_task_json(t public.wb_plan_tasks,m public.wb_members)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'month',t.month,'actionId',t.action_id,'title',t.action_snapshot->>'title',
  'strategyId',t.action_snapshot->>'strategyId','scope',t.scope,'ownerRole',t.owner_role,'region',t.region,'store',t.store,
  'taskDate',t.task_date,'dueDate',t.due_date,'status',t.status,'version',t.version,
  'actionSnapshot',t.action_snapshot,'how',t.action_snapshot->'how','acceptance',t.action_snapshot->'acceptance','linkedActionIds',t.action_snapshot->'linkedActionIds',
  'result',coalesce(t.report->>'result',''),'evidence',coalesce(t.report->>'evidence',''),'groupDetails',coalesce(t.report->>'groupDetails',''),
  'benchmark',coalesce(t.report->>'benchmark',''),'issue',coalesce(t.report->>'issue',''),'nextAction',coalesce(t.report->>'nextAction',''),
  'submittedBy',t.submitted_by,'submittedAt',t.submitted_at,'reviewedBy',t.reviewed_by,'reviewedAt',t.reviewed_at,'reviewNote',t.review_note,
  'updatedAt',t.updated_at,'assignees',public.wb_plan_assignees(t.owner_role,t.scope,t.region,t.store),
  'assignmentStatus',CASE WHEN jsonb_array_length(public.wb_plan_assignees(t.owner_role,t.scope,t.region,t.store))>0 THEN 'assigned' ELSE 'unassigned' END,
  'canSubmit',public.wb_plan_in_scope(m,t.scope,t.region,t.store) AND (m.role='project' OR m.role=t.owner_role) AND t.status<>'accepted',
  'canReview',public.wb_plan_in_scope(m,t.scope,t.region,t.store) AND
   ((m.role='project' AND t.status IN ('submitted','accepted')) OR (m.role='region' AND t.scope='store' AND t.status='submitted')))
$$;

-- 只由已鉴权 RPC 或数据库 owner 调用。部署初始化可用 null actor_email/'规划初始化'，不伪造用户登录。
CREATE OR REPLACE FUNCTION public.wb_plan_generate(p_month text,p_actor_email text,p_actor_name text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.wb_plan_actions; target record; d date; sd date; ed date; dd date; n integer; made integer:=0; candidates integer:=0; tid text;
BEGIN
 IF p_month IS NULL OR p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '月份不正确'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('wb-plan:'||p_month));
 FOR a IN SELECT * FROM public.wb_plan_actions WHERE month=p_month AND enabled ORDER BY id LOOP
  IF a.definition->>'scope' IS NULL OR a.definition->>'ownerRole' IS DISTINCT FROM (CASE a.definition->>'scope' WHEN 'company' THEN 'project' WHEN 'region' THEN 'region' WHEN 'store' THEN 'store' END)
   OR coalesce(a.definition->>'frequency','') NOT IN ('once','daily','weekly') THEN RAISE EXCEPTION '动作 % 的范围或频率不正确',a.id; END IF;
  sd:=coalesce(nullif(a.definition->>'startDate','')::date,(p_month||'-01')::date);
  ed:=coalesce(nullif(a.definition->>'endDate','')::date,((p_month||'-01')::date+interval '1 month - 1 day')::date);
  dd:=coalesce(nullif(a.definition->>'dueDate','')::date,sd);
  IF a.definition->>'frequency'='once' THEN sd:=dd;ed:=dd; END IF;
  IF sd<(p_month||'-01')::date OR ed<sd OR ed>((p_month||'-01')::date+interval '1 month 6 days')::date THEN RAISE EXCEPTION '动作 % 排期须在本月及次月前7日以内',a.id; END IF;
  IF a.definition->>'frequency'='weekly' AND coalesce(a.definition->>'weekday','') !~ '^[1-7]$' THEN RAISE EXCEPTION '每周动作 % 缺少 weekday（1—7）',a.id; END IF;
  FOR target IN
   SELECT ''::text AS region,''::text AS store WHERE a.definition->>'scope'='company'
   UNION ALL SELECT DISTINCT s.region,''::text FROM public.wb_plan_stores s WHERE s.month=p_month AND s.enabled AND a.definition->>'scope'='region'
   UNION ALL SELECT s.region,s.store FROM public.wb_plan_stores s WHERE s.month=p_month AND s.enabled AND a.definition->>'scope'='store'
  LOOP
   FOR d IN SELECT x::date FROM generate_series(sd::timestamp,ed::timestamp,interval '1 day') x
    WHERE a.definition->>'frequency'<>'weekly' OR extract(isodow FROM x)::text=a.definition->>'weekday'
   LOOP
    candidates:=candidates+1;
    IF candidates>20000 THEN RAISE EXCEPTION '本轮排期超过20000条，请减少范围'; END IF;
    tid:=md5(concat_ws('|',p_month,a.id,a.definition->>'scope',target.region,target.store,d::text));
    INSERT INTO public.wb_plan_tasks(id,month,action_id,action_snapshot,scope,owner_role,region,store,task_date,due_date)
     VALUES(tid,p_month,a.id,a.definition||jsonb_build_object('id',a.id,'version',a.version),a.definition->>'scope',a.definition->>'ownerRole',target.region,target.store,d,d)
     ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n=ROW_COUNT;made:=made+n;
   END LOOP;
  END LOOP;
 END LOOP;
 IF made>0 THEN
  INSERT INTO public.wb_plan_events(month,type,actor_email,actor_name,payload)
   VALUES(p_month,'generated',p_actor_email,coalesce(nullif(btrim(p_actor_name),''),'规划初始化'),jsonb_build_object('created',made,'existing',candidates-made,'status','open'));
 END IF;
 RETURN jsonb_build_object('created',made,'existing',candidates-made,
  'storeCount',(SELECT count(*) FROM public.wb_plan_stores WHERE month=p_month AND enabled),
  'unassigned',(SELECT count(*) FROM public.wb_plan_tasks t WHERE t.month=p_month AND jsonb_array_length(public.wb_plan_assignees(t.owner_role,t.scope,t.region,t.store))=0),
  'notice','任务按全周期预排。原有任务、提交及验收结果不覆盖；修改规划后只补建缺少的任务。未授权BP的门店显示待分派。');
END $$;

CREATE OR REPLACE FUNCTION public.wb_plan_api(p_token text,p_action text,p_args jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.wb_members; mon text; actor text; x jsonb; def jsonb; aid text; sid text; rg text; st text;
 a public.wb_plan_actions; s public.wb_plan_stores; t public.wb_plan_tasks; old_status text; report jsonb;
 result jsonb; changed integer:=0; requested_status text; decision text; note text; expected integer; sd date; ed date; dd date;
BEGIN
 mon:=p_args->>'month';
 IF mon IS NULL OR mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '月份不正确'; END IF;
 IF octet_length(coalesce(p_args,'{}')::text)>1048576 THEN RAISE EXCEPTION '本次内容过大，请分批提交'; END IF;
 IF p_action='public' THEN
  RETURN jsonb_build_object('month',mon,'actions',coalesce((SELECT jsonb_agg(a.definition||jsonb_build_object('id',a.id,'enabled',a.enabled,'version',a.version) ORDER BY a.id) FROM public.wb_plan_actions a WHERE a.month=mon AND a.enabled),'[]'::jsonb),
   'stores',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'region',s.region,'store',s.store) ORDER BY s.region,s.store) FROM public.wb_plan_stores s WHERE s.month=mon AND s.enabled),'[]'::jsonb));
 END IF;
 SELECT mm.* INTO m FROM public.wb_code_sessions ss JOIN public.wb_members mm ON mm.email=ss.email
  WHERE ss.token_hash=md5(p_token) AND ss.expires_at>now() AND mm.enabled;
 IF NOT FOUND THEN RAISE EXCEPTION '工号会话已过期，请重新进入'; END IF;
 actor:=coalesce(nullif(btrim(m.display_name),''),CASE m.role WHEN 'project' THEN '项目负责人' WHEN 'region' THEN '大区BP' ELSE '店面BP' END);

 IF p_action='load' THEN
  SELECT jsonb_build_object('month',mon,
   'actions',coalesce((SELECT jsonb_agg(a.definition||jsonb_build_object('id',a.id,'enabled',a.enabled,'version',a.version) ORDER BY a.id) FROM public.wb_plan_actions a WHERE a.month=mon),'[]'::jsonb),
   'stores',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'region',s.region,'store',s.store,'source',s.source,'enabled',s.enabled,'version',s.version,
     'assignees',public.wb_plan_assignees('store','store',s.region,s.store),'assignmentStatus',CASE WHEN jsonb_array_length(public.wb_plan_assignees('store','store',s.region,s.store))>0 THEN 'assigned' ELSE 'unassigned' END) ORDER BY s.region,s.store)
     FROM public.wb_plan_stores s WHERE s.month=mon AND public.wb_plan_in_scope(m,'store',s.region,s.store)),'[]'::jsonb),
   'tasks',coalesce((SELECT jsonb_agg(public.wb_plan_task_json(t,m) ORDER BY t.due_date,t.region,t.store,t.action_id) FROM public.wb_plan_tasks t WHERE t.month=mon AND public.wb_plan_in_scope(m,t.scope,t.region,t.store)),'[]'::jsonb),
   'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'taskId',e.task_id,'type',e.type,'actorName',e.actor_name,'createdAt',e.created_at,'payload',e.payload) ORDER BY e.id)
     FROM public.wb_plan_events e LEFT JOIN public.wb_plan_tasks t ON t.id=e.task_id WHERE e.month=mon AND ((e.task_id IS NULL AND m.role='project') OR public.wb_plan_in_scope(m,t.scope,t.region,t.store))),'[]'::jsonb),
   'member',jsonb_build_object('role',m.role,'region',m.region,'store',m.store,'stores',m.stores,'display_name',actor),
   'permissions',jsonb_build_object('configure',m.role='project','generate',m.role='project','review',m.role IN ('project','region'))) INTO result;
  RETURN result;

 ELSIF p_action='save-actions' THEN
  IF m.role<>'project' THEN RAISE EXCEPTION '仅项目负责人可修改规划'; END IF;
  IF jsonb_typeof(p_args->'actions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_args->'actions')>100 THEN RAISE EXCEPTION '动作需为数组且不超过100条'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wb-plan:'||mon));
  FOR x IN SELECT value FROM jsonb_array_elements(p_args->'actions') LOOP
   aid:=btrim(x->>'id');
   IF aid IS NULL OR length(aid) NOT BETWEEN 1 AND 100 OR length(btrim(coalesce(x->>'title',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION '动作编号或标题不正确'; END IF;
   IF coalesce(x->>'scope','') NOT IN ('company','region','store') OR x->>'ownerRole' IS DISTINCT FROM (CASE x->>'scope' WHEN 'company' THEN 'project' WHEN 'region' THEN 'region' WHEN 'store' THEN 'store' END) THEN RAISE EXCEPTION '动作责任角色与范围不匹配'; END IF;
   IF coalesce(x->>'frequency','') NOT IN ('once','daily','weekly') THEN RAISE EXCEPTION '频率仅支持once/daily/weekly'; END IF;
   IF x->>'frequency'='weekly' AND coalesce(x->>'weekday','') !~ '^[1-7]$' THEN RAISE EXCEPTION '每周动作需填写weekday（1—7）'; END IF;
   sd:=coalesce(nullif(x->>'startDate','')::date,(mon||'-01')::date);
   ed:=coalesce(nullif(x->>'endDate','')::date,((mon||'-01')::date+interval '1 month - 1 day')::date);
   dd:=coalesce(nullif(x->>'dueDate','')::date,sd);
   IF x->>'frequency'='once' THEN sd:=dd;ed:=dd; END IF;
   IF sd<(mon||'-01')::date OR ed<sd OR ed>((mon||'-01')::date+interval '1 month 6 days')::date THEN RAISE EXCEPTION '排期须在本月及次月前7日以内'; END IF;
   SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO def FROM jsonb_each(x)
    WHERE key IN ('strategyId','title','why','how','acceptance','scope','ownerRole','frequency','startDate','endDate','dueDate','weekday','linkedActionIds','dailyBundle','collaborators','when','scheduleBasis','trigger');
   SELECT * INTO a FROM public.wb_plan_actions WHERE month=mon AND id=aid FOR UPDATE;
   IF FOUND THEN
    IF a.definition=def AND a.enabled=coalesce((x->>'enabled')::boolean,true) THEN CONTINUE; END IF;
    IF coalesce(x->>'version','') !~ '^[0-9]+$' OR (x->>'version')::integer<>a.version THEN RAISE EXCEPTION '规划已由他人更新，请刷新后重试' USING ERRCODE='40001'; END IF;
    IF EXISTS(SELECT 1 FROM public.wb_plan_tasks WHERE month=mon AND action_id=aid) AND EXISTS(
     SELECT 1 FROM unnest(ARRAY['scope','ownerRole','frequency','startDate','endDate','dueDate','weekday']) k WHERE (a.definition->k) IS DISTINCT FROM (def->k)) THEN
     RAISE EXCEPTION '本周期任务已生成，排期已锁定；调整需单独处理并保留原执行记录';
    END IF;
    UPDATE public.wb_plan_actions SET definition=def,enabled=coalesce((x->>'enabled')::boolean,true),version=version+1,updated_at=now() WHERE month=mon AND id=aid;
   ELSE
    INSERT INTO public.wb_plan_actions(month,id,definition,enabled) VALUES(mon,aid,def,coalesce((x->>'enabled')::boolean,true));
   END IF;
   changed:=changed+1;
  END LOOP;
  IF changed>0 THEN INSERT INTO public.wb_plan_events(month,type,actor_email,actor_name,payload) VALUES(mon,'actions-configured',m.email,actor,jsonb_build_object('changed',changed)); END IF;
  RETURN jsonb_build_object('changed',changed);

 ELSIF p_action='save-stores' THEN
  IF m.role<>'project' THEN RAISE EXCEPTION '仅项目负责人可修改范围'; END IF;
  IF jsonb_typeof(p_args->'stores') IS DISTINCT FROM 'array' OR jsonb_array_length(p_args->'stores')>100 THEN RAISE EXCEPTION '门店需为数组且不超过100家'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('wb-plan:'||mon));
  FOR x IN SELECT value FROM jsonb_array_elements(p_args->'stores') LOOP
   rg:=btrim(x->>'region');st:=btrim(x->>'store');sid:=coalesce(nullif(btrim(x->>'id'),''),md5(mon||'|'||rg||'|'||st));
   IF rg IS NULL OR st IS NULL OR length(rg) NOT BETWEEN 1 AND 100 OR length(st) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '请填写真实大区和门店名称'; END IF;
   SELECT * INTO s FROM public.wb_plan_stores WHERE month=mon AND (id=sid OR store=st) FOR UPDATE;
   IF FOUND THEN
    IF s.region=rg AND s.store=st AND s.enabled=coalesce((x->>'enabled')::boolean,true) THEN CONTINUE; END IF;
    IF coalesce(x->>'version','') !~ '^[0-9]+$' OR (x->>'version')::integer<>s.version THEN RAISE EXCEPTION '门店范围已更新，请刷新后重试' USING ERRCODE='40001'; END IF;
    IF (s.region<>rg OR s.store<>st) AND EXISTS(SELECT 1 FROM public.wb_plan_tasks WHERE month=mon AND region=s.region AND store=s.store) THEN RAISE EXCEPTION '该门店已有任务，不能直接改名或换区；请先核对组织名称'; END IF;
    UPDATE public.wb_plan_stores SET region=rg,store=st,enabled=coalesce((x->>'enabled')::boolean,true),version=version+1,updated_at=now() WHERE month=mon AND id=s.id;
   ELSE
    INSERT INTO public.wb_plan_stores(month,id,region,store,source,enabled) VALUES(mon,sid,rg,st,left(coalesce(x->>'source','项目负责人配置'),200),coalesce((x->>'enabled')::boolean,true));
   END IF;
   changed:=changed+1;
  END LOOP;
  IF changed>0 THEN INSERT INTO public.wb_plan_events(month,type,actor_email,actor_name,payload) VALUES(mon,'stores-configured',m.email,actor,jsonb_build_object('changed',changed)); END IF;
  RETURN jsonb_build_object('changed',changed);

 ELSIF p_action='generate' THEN
  IF m.role<>'project' THEN RAISE EXCEPTION '仅项目负责人可发布排期'; END IF;
  RETURN public.wb_plan_generate(mon,m.email,actor);

 ELSIF p_action IN ('submit','review') THEN
  SELECT * INTO t FROM public.wb_plan_tasks WHERE id=p_args->>'taskId' AND month=mon FOR UPDATE;
  IF NOT FOUND OR NOT public.wb_plan_in_scope(m,t.scope,t.region,t.store) THEN RAISE EXCEPTION '无权查看或更新该任务'; END IF;
  IF coalesce(p_args->>'expectedVersion','') !~ '^[0-9]+$' THEN RAISE EXCEPTION '缺少任务版本，请刷新后重试' USING ERRCODE='40001'; END IF;
  expected:=(p_args->>'expectedVersion')::integer;
  IF expected<>t.version THEN RAISE EXCEPTION '任务已由他人更新，请刷新后重试' USING ERRCODE='40001'; END IF;
  old_status:=t.status;
  IF p_action='submit' THEN
   IF m.role<>'project' AND m.role<>t.owner_role THEN RAISE EXCEPTION '请由对应责任BP更新，管理者可验收'; END IF;
   requested_status:=p_args->>'status';
   IF requested_status IS NULL OR requested_status NOT IN ('in_progress','blocked','submitted') THEN RAISE EXCEPTION '推进状态不正确'; END IF;
   IF t.status='accepted' THEN RAISE EXCEPTION '已验收任务如需更正，请项目负责人先退回'; END IF;
   IF t.action_snapshot->>'frequency' IN ('daily','weekly') AND t.task_date>(now() AT TIME ZONE 'Asia/Shanghai')::date THEN RAISE EXCEPTION '未来的日/周任务尚未到执行日期'; END IF;
   IF length(btrim(coalesce(p_args->>'result','')))<2 THEN RAISE EXCEPTION '请填写实际推进结果'; END IF;
   IF requested_status='submitted' AND length(btrim(coalesce(p_args->>'evidence','')))<2 THEN RAISE EXCEPTION '提交验收需说明核实依据，可填写具体事实、记录位置或链接'; END IF;
   IF requested_status='blocked' AND length(btrim(coalesce(p_args->>'issue','')))<2 THEN RAISE EXCEPTION '受阻任务请说明问题和所需支持'; END IF;
   IF requested_status IN ('blocked','in_progress') AND length(btrim(coalesce(p_args->>'nextAction','')))<2 THEN RAISE EXCEPTION '请填写下一步动作'; END IF;
   report:=jsonb_build_object('result',coalesce(p_args->>'result',''),'evidence',coalesce(p_args->>'evidence',''),
    'groupDetails',coalesce(p_args->>'groupDetails',''),'benchmark',coalesce(p_args->>'benchmark',''),'issue',coalesce(p_args->>'issue',''),'nextAction',coalesce(p_args->>'nextAction',''));
   IF octet_length(report::text)>60000 THEN RAISE EXCEPTION '单次结果过长，请精简文字并使用依据链接'; END IF;
   UPDATE public.wb_plan_tasks SET status=requested_status,report=report,version=version+1,updated_at=now(),
    submitted_by=CASE WHEN requested_status='submitted' THEN actor ELSE submitted_by END,
    submitted_at=CASE WHEN requested_status='submitted' THEN now() ELSE submitted_at END
    WHERE id=t.id RETURNING * INTO t;
   INSERT INTO public.wb_plan_events(month,task_id,type,actor_email,actor_name,payload)
    VALUES(mon,t.id,requested_status,m.email,actor,jsonb_build_object('fromStatus',old_status,'toStatus',t.status,'version',t.version,'report',report));
  ELSE
   IF NOT (m.role='project' OR (m.role='region' AND t.scope='store')) THEN RAISE EXCEPTION '店面BP不能自行验收，需大区BP或项目负责人验收'; END IF;
   decision:=p_args->>'decision';note:=btrim(coalesce(p_args->>'note',''));
   IF decision IS NULL OR decision NOT IN ('accept','reject') THEN RAISE EXCEPTION '验收结论不正确'; END IF;
   IF length(note)<2 OR length(note)>5000 THEN RAISE EXCEPTION '请填写具体的验收结论或补充要求'; END IF;
   IF t.status<>'submitted' AND NOT (t.status='accepted' AND decision='reject' AND m.role='project') THEN RAISE EXCEPTION '仅待验收任务可验收；项目负责人可退回已验收任务更正'; END IF;
   UPDATE public.wb_plan_tasks SET status=CASE decision WHEN 'accept' THEN 'accepted' ELSE 'rejected' END,
    version=version+1,updated_at=now(),reviewed_by=actor,reviewed_at=now(),review_note=note WHERE id=t.id RETURNING * INTO t;
   INSERT INTO public.wb_plan_events(month,task_id,type,actor_email,actor_name,payload)
    VALUES(mon,t.id,decision,m.email,actor,jsonb_build_object('fromStatus',old_status,'toStatus',t.status,'version',t.version,'note',note,'report',t.report));
  END IF;
  RETURN jsonb_build_object('task',public.wb_plan_task_json(t,m));
 ELSE RAISE EXCEPTION '不支持的规划操作';
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.wb_plan_in_scope(public.wb_members,text,text,text),public.wb_plan_assignees(text,text,text,text),public.wb_plan_task_json(public.wb_plan_tasks,public.wb_members),public.wb_plan_generate(text,text,text),public.wb_plan_api(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wb_plan_api(text,text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
