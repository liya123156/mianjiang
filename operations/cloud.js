/* Supabase REST bridge. Business records stay in the shared database, never browser storage. */
(function(root){
  'use strict';
  const config=root.WORKBENCH_CLOUD||{},url=String(config.url||'').replace(/\/$/,'');
  const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&String(config.anonKey||'').length>30;
  let session=null,member=null,refreshing=null;
  const sessionKey='mianjiang.session.'+url;
  try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
  function remember(){try{session?sessionStorage.setItem(sessionKey,JSON.stringify(session)):sessionStorage.removeItem(sessionKey);}catch{}}
  async function request(path,{method='GET',body,headers={},auth=true,raw=false}={}){
    if(!configured)throw Error('共享服务尚未连接');
    if(auth&&session?.expires_at&&session.expires_at<Date.now()/1000+60){
      if(!refreshing)refreshing=refresh().finally(()=>refreshing=null);await refreshing;
    }
    const h={apikey:config.anonKey,...headers};if(auth&&session?.access_token)h.Authorization='Bearer '+session.access_token;
    if(body!=null&&!raw)h['Content-Type']='application/json';
    const response=await fetch(url+path,{method,headers:h,body:body==null?undefined:raw?body:JSON.stringify(body)});
    const content=await response.text();let data;try{data=content?JSON.parse(content):null;}catch{data=content;}
    if(!response.ok)throw Error(data?.message||data?.msg||data?.error_description||data?.error||('连接失败：'+response.status));return data;
  }
  async function refresh(){if(!session?.refresh_token)throw Error('请重新登录');try{const x=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',auth:false,body:{refresh_token:session.refresh_token}});session={...x,expires_at:Date.now()/1000+x.expires_in};remember();}catch(e){session=null;member=null;remember();throw e;}}
  async function login(email,password){const data=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email,password}});session={...data,expires_at:Date.now()/1000+data.expires_in};remember();try{await membership();}catch(e){await logout();throw e;}return member;}
  async function membership(){if(!session)return null;await request('/auth/v1/user');const rows=await request('/rest/v1/wb_members?select=email,role,region,store,stores,enabled');member=rows.find(x=>x.enabled&&x.email.toLowerCase()===session.user?.email?.toLowerCase());if(!member)throw Error('当前账号尚未获工作台授权，请联系项目负责人');return member;}
  async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST'});}finally{session=null;member=null;remember();}}
  const rpc=(name,body)=>request('/rest/v1/rpc/'+name,{method:'POST',body});
  async function list(table,query=''){
    const rows=[];for(let offset=0;offset<30000;offset+=500){const data=await request('/rest/v1/'+table+'?'+query+(query?'&':'')+'limit=500&offset='+offset,{headers:{'Range-Unit':'items'}});if(!Array.isArray(data))throw Error('共享数据格式异常');rows.push(...data);if(data.length<500)return rows;}throw Error('读取记录超过预期范围');
  }
  async function load(month){
    if(!member)throw Error('请先登录');const q='month=eq.'+encodeURIComponent(month);
    const [housing,meetings,items,imports,snapshots,periods]=await Promise.all([list('wb_housing',q+'&select=payload'),list('wb_meetings',q+'&select=payload'),list('wb_items',q+'&select=key,kind,region,store,payload,updated_at'),list('wb_imports',q+'&order=as_of.desc,created_at.desc&select=as_of,created_at,filenames,housing_count'),list('wb_snapshots',q+'&select=as_of,region,store,payload&order=as_of.desc'),list('wb_periods',q+'&select=month,region,store,locked,summary,updated_at')]);
    return {month,housing:housing.map(x=>x.payload),meetings:meetings.map(x=>x.payload),items,imports,snapshots,periods,loadedAt:new Date().toISOString()};
  }
  async function saveItem(month,kind,id,region,store,payload,expected){return rpc('wb_save_item',{p_month:month,p_kind:kind,p_id:id,p_region:region,p_store:store,p_payload:payload,p_expected_updated_at:expected||null});}
  async function uploadProof(file,month,region,store){
    if(!member)throw Error('请先登录');if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>10*1024*1024)throw Error('凭证支持PNG、JPG、WEBP或PDF，每份不超过10MB');
    const extension=file.type==='application/pdf'?'pdf':file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';
    const path=[month,region,store,session.user.id,root.WBModel.uuid()+'.'+extension].join('/');
    await request('/storage/v1/object/wb-evidence/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',raw:true,body:file,headers:{'Content-Type':file.type,'x-upsert':'false'}});
    return {path,name:file.name,size:file.size,type:file.type};
  }
  async function proofUrl(path){const data=await request('/storage/v1/object/sign/wb-evidence/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',body:{expiresIn:120}});return url+'/storage/v1'+data.signedURL;}
  root.WBCloud={configured,login,membership,logout,load,rpc,saveItem,uploadProof,proofUrl,get member(){return member;},get hasSession(){return !!session;},get project(){return member?.role==='project';}};
})(window);
