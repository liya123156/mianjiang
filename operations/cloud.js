/* Scoped server sessions: public progress, employee-code entry for private operations. */
(function(root){
 'use strict';
 const config=root.WORKBENCH_CLOUD||{},url=String(config.url||'').replace(/\/$/,'');
 const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&String(config.anonKey||'').length>30;
 let session=null,member=null;const sessionKey='mianjiang.code-session.'+url;
 try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');if(session?.expires_at<Date.now()/1000)session=null;}catch{}
 function remember(){try{session?sessionStorage.setItem(sessionKey,JSON.stringify(session)):sessionStorage.removeItem(sessionKey);}catch{}}
 async function request(name,body){
  if(!configured)throw Error('共享服务尚未连接');
  const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const content=await response.text();let data;try{data=content?JSON.parse(content):null;}catch{data={message:'共享服务暂时不可用，请稍后刷新'};}
  if(!response.ok){if(data?.code==='PGRST202')throw Error('数据库连接有效，工号免密码接口待完成安装');throw Error(data?.message||'连接失败：'+response.status);}
  if(data?.error)throw Error(data.error);return data;
 }
 function validateCode(code){const id=String(code??'').trim();if(!/^[0-9]{4}$/.test(id))throw Error('请输入工号后4位，开头的0也需要保留');return id;}
 async function api(action,args={}){if(!session?.token)throw Error('请先输入已授权工号后4位');return request('wb_code_api',{p_token:session.token,p_action:action,p_args:args});}
 async function login(code){const data=await request('wb_code_login',{p_code:validateCode(code)});session={token:data.token,expires_at:data.expires_at};member=data.member;remember();return member;}
 async function membership(){if(!session)return null;try{member=await api('member');return member;}catch(e){session=null;member=null;remember();throw e;}}
 async function logout(){try{if(session)await api('logout');}finally{session=null;member=null;remember();}}
 async function load(month){const data=member?await api('load',{p_month:month}):await request('wb_public_daily',{p_month:month});return {...data,loadedAt:new Date().toISOString()};}
 const rpc=(name,body)=>api(name,body);
 const saveItem=(month,kind,id,region,store,payload,expected)=>rpc('wb_save_item',{p_month:month,p_kind:kind,p_id:id,p_region:region,p_store:store,p_payload:payload,p_expected_updated_at:expected||null});
 async function uploadProof(file,month,region,store){
  if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>2*1024*1024)throw Error('凭证支持PNG、JPG、WEBP或PDF，每份不超过2MB');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('凭证读取失败'));reader.readAsDataURL(file);});
  return api('proof-upload',{p_month:month,p_region:region,p_store:store,name:file.name,mime:file.type,data});
 }
 async function proofUrl(path){const x=await api('proof-read',{path}),raw=atob(x.data.replace(/\s/g,'')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),u=URL.createObjectURL(new Blob([bytes],{type:x.type}));setTimeout(()=>URL.revokeObjectURL(u),120000);return u;}
 root.WBCloud={configured,validateCode,login,membership,logout,load,rpc,saveItem,uploadProof,proofUrl,get member(){return member;},get hasSession(){return !!session;},get project(){return member?.role==='project';}};
})(window);
