-- 面见工作台：日常免登录；管理和财务仅使用已授权工号后4位。
-- 在现有项目 SQL Editor 执行整份文件，不需要修改密钥或密码。
BEGIN;
CREATE TABLE IF NOT EXISTS public.wb_code_sessions (
 token_hash text PRIMARY KEY, email text NOT NULL REFERENCES public.wb_members(email) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wb_code_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_code_sessions FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS public.wb_private_proofs (
 path text PRIMARY KEY,month text NOT NULL,region text NOT NULL,store text NOT NULL,
 name text NOT NULL,mime text NOT NULL,bytes bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wb_private_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wb_private_proofs FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.wb_code_login(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.wb_members; t text;
BEGIN
 IF p_code IS NULL OR p_code !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('error','请输入工号后4位，保留开头的0'); END IF;
 SELECT * INTO m FROM public.wb_members WHERE login_id=p_code AND enabled;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','该工号尚未授权'); END IF;
 DELETE FROM public.wb_code_sessions WHERE expires_at<now();
 t:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.wb_code_sessions(token_hash,email,expires_at) VALUES(md5(t),m.email,now()+interval '8 hours');
 RETURN jsonb_build_object('token',t,'expires_at',extract(epoch FROM now()+interval '8 hours'),'member',
 jsonb_build_object('role',m.role,'region',m.region,'store',m.store,'stores',m.stores,'display_name',m.display_name,'login_id',m.login_id,'enabled',true));
END $$;
CREATE OR REPLACE FUNCTION public.wb_public_daily(p_month text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_month IS NULL OR p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '月份不正确'; END IF;
 -- 只公开进展所需字段；不返回房间号、联系方式、反馈原文、费用、成员或凭证。
 SELECT jsonb_build_object('month',p_month,'housing',coalesce((SELECT jsonb_agg(
 jsonb_build_object('房源编号',md5(h.house_id),'大区',h.region,'门店',h.store,
 '店组',h.payload->'店组','维护人姓名',h.payload->'维护人姓名',
 '细分在售户数',coalesce(h.payload->'细分在售户数',h.payload->'在售户数'),
 '本月是否面见',h.payload->'本月是否面见','本月是否送礼物',h.payload->'本月是否送礼物',
 '门店top户数',h.payload->'门店top户数','户型top户数',h.payload->'户型top户数'))
 FROM public.wb_housing h WHERE h.month=p_month),'[]'::jsonb),
 'meetings','[]'::jsonb,'items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.wb_items i WHERE month=p_month AND kind='goals'),'[]'::jsonb),
 'imports',coalesce((SELECT jsonb_agg(jsonb_build_object('as_of',i.as_of,'created_at',i.created_at,'housing_count',i.housing_count) ORDER BY i.as_of DESC,i.created_at DESC) FROM public.wb_imports i WHERE month=p_month),'[]'::jsonb),
 'snapshots',coalesce((SELECT jsonb_agg(jsonb_build_object('as_of',s.as_of,'region',s.region,'store',s.store,'payload',jsonb_build_object(
 'metIds',coalesce((SELECT jsonb_agg(md5(x)) FROM jsonb_array_elements_text(coalesce(s.payload->'metIds','[]')) z(x)),'[]'::jsonb),
 'giftIds',coalesce((SELECT jsonb_agg(md5(x)) FROM jsonb_array_elements_text(coalesce(s.payload->'giftIds','[]')) z(x)),'[]'::jsonb))))
 FROM public.wb_snapshots s WHERE s.month=p_month),'[]'::jsonb),'periods','[]'::jsonb) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.wb_code_api(p_token text,p_action text,p_args jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.wb_members; result jsonb; mon text; old_claims text; proof public.wb_private_proofs; bin bytea; pa text; ext text;
BEGIN
 SELECT mm.* INTO m FROM public.wb_code_sessions ss JOIN public.wb_members mm ON mm.email=ss.email
 WHERE ss.token_hash=md5(p_token) AND ss.expires_at>now() AND mm.enabled;
 IF NOT FOUND THEN RAISE EXCEPTION '工号会话已过期，请重新进入'; END IF;
 old_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('email',m.email,'sub',md5(m.email)::uuid)::text,true);
 mon:=p_args->>'p_month';
 IF p_action='member' THEN
 result:=jsonb_build_object('role',m.role,'region',m.region,'store',m.store,'stores',m.stores,'display_name',m.display_name,'login_id',m.login_id,'enabled',true);
 ELSIF p_action='logout' THEN
 DELETE FROM public.wb_code_sessions WHERE token_hash=md5(p_token);result:='{}';
 ELSIF p_action='load' THEN
 IF mon IS NULL OR mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '月份不正确'; END IF;
 SELECT jsonb_build_object('month',mon,
 'housing',coalesce((SELECT jsonb_agg(h.payload) FROM public.wb_housing h WHERE month=mon AND public.wb_can_read_scope(h.region,h.store)),'[]'::jsonb),
 'meetings',coalesce((SELECT jsonb_agg(h.payload) FROM public.wb_meetings h WHERE month=mon AND public.wb_can_read_scope(h.region,h.store)),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM public.wb_items i WHERE month=mon AND (public.wb_can_read_scope(i.region,i.store) OR kind='goals')),'[]'::jsonb),
 'imports',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY as_of DESC,created_at DESC) FROM public.wb_imports i WHERE month=mon),'[]'::jsonb),
 'snapshots',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.wb_snapshots s WHERE month=mon AND public.wb_can_read_scope(s.region,s.store)),'[]'::jsonb),
 'periods',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM public.wb_periods p WHERE month=mon AND public.wb_can_read_scope(p.region,p.store)),'[]'::jsonb)) INTO result;
 ELSIF p_action='wb_save_item' THEN
 result:=public.wb_save_item(mon,p_args->>'p_kind',p_args->>'p_id',p_args->>'p_region',p_args->>'p_store',p_args->'p_payload',(p_args->>'p_expected_updated_at')::timestamptz);
 ELSIF p_action='wb_import_snapshot' THEN
 result:=public.wb_import_snapshot(mon,(p_args->>'p_as_of')::date,p_args->'p_rows',p_args->'p_meetings',p_args->'p_snapshots',p_args->'p_filenames');
 ELSIF p_action='wb_set_period' THEN
 result:=public.wb_set_period(mon,p_args->>'p_region',p_args->>'p_store',(p_args->>'p_locked')::boolean,p_args->'p_summary',p_args->>'p_reason');
 ELSIF p_action='proof-upload' THEN
 IF NOT public.wb_can_write_item('expense',p_args->>'p_region',p_args->>'p_store') THEN RAISE EXCEPTION '没有该门店凭证权限'; END IF;
 IF mon IS NULL OR mon !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '月份不正确'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('ledger:'||mon||':'||(p_args->>'p_store')));
 IF NOT public.wb_month_open(mon,p_args->>'p_store') THEN RAISE EXCEPTION '账本已锁定'; END IF;
 IF p_args->>'mime' NOT IN ('image/png','image/jpeg','image/webp','application/pdf') OR length(coalesce(p_args->>'data',''))>2800000 THEN RAISE EXCEPTION '凭证支持图片或PDF，每份不超过2MB'; END IF;
 bin:=decode(p_args->>'data','base64');
 IF bin IS NULL OR octet_length(bin) NOT BETWEEN 1 AND 2097152 THEN RAISE EXCEPTION '凭证大小不正确'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('wb-proof-quota'));
 IF (SELECT coalesce(sum(octet_length(bytes)),0) FROM public.wb_private_proofs)+octet_length(bin)>104857600 THEN RAISE EXCEPTION '凭证总容量已达100MB，请负责人先归档'; END IF;
 ext:=CASE p_args->>'mime' WHEN 'application/pdf' THEN '.pdf' WHEN 'image/png' THEN '.png' WHEN 'image/jpeg' THEN '.jpg' ELSE '.webp' END;
 pa:=mon||'/'||(p_args->>'p_region')||'/'||(p_args->>'p_store')||'/'||gen_random_uuid()::text||ext;
 INSERT INTO public.wb_private_proofs(path,month,region,store,name,mime,bytes) VALUES(pa,mon,p_args->>'p_region',p_args->>'p_store',left(p_args->>'name',250),p_args->>'mime',bin);
 result:=jsonb_build_object('path',pa,'name',p_args->>'name','size',octet_length(bin),'type',p_args->>'mime');
 ELSIF p_action='proof-read' THEN
 SELECT * INTO proof FROM public.wb_private_proofs WHERE path=p_args->>'path';
 IF NOT FOUND OR NOT public.wb_can_read_scope(proof.region,proof.store) THEN RAISE EXCEPTION '无权读取该凭证'; END IF;
 result:=jsonb_build_object('data',encode(proof.bytes,'base64'),'type',proof.mime,'name',proof.name);
 ELSE RAISE EXCEPTION '不支持的操作';
 END IF;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.wb_code_login(text),public.wb_public_daily(text),public.wb_code_api(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_code_login(text),public.wb_public_daily(text),public.wb_code_api(text,text,jsonb) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
