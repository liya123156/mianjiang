/* Scoped server sessions: public progress, employee-code entry for private operations. */
(function(root){
 'use strict';
 const config=root.WORKBENCH_CLOUD||{},url=String(config.url||'').replace(/\/$/,''),archiveBucket='wb-review-archives';
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
 const encodedPath=path=>String(path||'').split('/').map(encodeURIComponent).join('/');
 function archiveUrl(path,downloadName=''){const base=url+'/storage/v1/object/public/'+archiveBucket+'/'+encodedPath(path);return downloadName?base+'?download='+encodeURIComponent(downloadName):base;}
 async function loadArchives(month){const rows=await request('wb_public_archives',{p_month:month});return (Array.isArray(rows)?rows:[]).map(x=>({...x,url:archiveUrl(x.object_path),downloadUrl:archiveUrl(x.object_path,x.original_name)}));}
 async function load(month){
  const scoped=Boolean(member)&&member.role!=='collaborator',isProject=member?.role==='project';
  // Private operations keep their authorized scope. Public progress supplies only the
  // already-public company comparison, including when a BP is viewing one region/store.
  const [data,archives,directory,publicProgress,customer,workRecords]=await Promise.all([scoped?api('load',{p_month:month}):request('wb_public_daily',{p_month:month}),loadArchives(month),scoped?api('load',{p_month:'2000-01'}):Promise.resolve(null),scoped?request('wb_public_daily',{p_month:month}).catch(()=>null):Promise.resolve(null),month==='2026-11'?request('wb_customer_api',{p_token:scoped?session?.token:null,p_action:'load',p_args:{month}}):Promise.resolve({}),member?records('list',{month}).catch(error=>({records:[],processorAvailable:false,error:error.message})):Promise.resolve(null)]);
  const shownImport=data.imports?.[0],publicImport=publicProgress?.imports?.[0];
  const sameImport=shownImport&&publicImport&&shownImport.as_of===publicImport.as_of&&shownImport.created_at===publicImport.created_at;
  const sendConfigItem=isProject?(directory?.items||[]).find(x=>x.key==='2000-01|rules|@@company|wechat-send-config-v1'&&x.kind==='rules'&&x.payload?.recordType==='wechat-send-config')||null:null;
  return {...data,...customer,companyProgress:scoped?(sameImport?publicProgress:null):data,archives,directory:(directory?.items||[]).filter(x=>x.kind==='review'&&x.payload.recordType==='leadership'),sendConfigItem,workRecords,loadedAt:new Date().toISOString()};
 }
 async function importCustomerSnapshot({month,asOf,rows,filenames=[]}){
  if(!session?.token||member?.role!=='project')throw Error('仅项目负责人可导入全司客户面见明细');
  return request('wb_customer_api',{p_token:session.token,p_action:'import',p_args:{month,asOf,rows,filenames}});
 }
 const rpc=(name,body)=>api(name,body);
 async function plan(action,args={}){
  if(!['public'].includes(action)&&!session?.token)throw Error('请先进入BP／管理入口');
  return request('wb_plan_api',{p_token:session?.token||null,p_action:action,p_args:args});
 }
 async function records(action,args={}){
  if(!session?.token)throw Error('请先输入已授权工号后4位');
  const token=session.token,call=values=>request('wb_work_records_api',{p_token:token,p_action:action,p_args:values});
  if(action!=='list'||args.offset!==undefined)return call(args);
  const collected=new Map();let first;
  for(let offset=0;offset<10000;offset+=200){
   const page=await call({...args,limit:200,offset});if(session?.token!==token)throw Error('登录状态已变化，请刷新共享记录');first||=page;
   const rows=Array.isArray(page.records)?page.records:[];
   for(const row of rows){const previous=collected.get(row.id);if(!previous||Number(row.version)>=Number(previous.version))collected.set(row.id,row);}
   if(rows.length<200)return {...first,records:[...collected.values()],complete:true,offset:0};
  }
  throw Error('本月共享记录较多，请缩小月份或组织范围后读取');
 }
 const recordTypes=new Set(['image/png','image/jpeg','image/webp','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/amr']);
 const recordExtensions={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',webm:'audio/webm',amr:'audio/amr'};
 async function uploadRecordAttachment(file,options={}){
  const type=String(file?.type||recordExtensions[String(file?.name||'').split('.').pop().toLowerCase()]||'').toLowerCase();
  if(!file||!recordTypes.has(type)||!file.size||file.size>8*1024*1024)throw Error('请选择8MB以内的PNG、JPG、WEBP图片或音频文件');
  const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('附件读取失败，原始输入已保留'));reader.readAsDataURL(file);});
  const result=await records('attachment-upload',{name:file.name,type,data:encoded,requestId:options.requestId||crypto.randomUUID()});return result.attachment||result;
 }
 async function recordAttachmentUrl(id){
  const result=await records('attachment-read',{id}),bytes=Uint8Array.from(atob(String(result.data||'').replace(/\s/g,'')),value=>value.charCodeAt(0));
  const objectUrl=URL.createObjectURL(new Blob([bytes],{type:result.type}));setTimeout(()=>URL.revokeObjectURL(objectUrl),120000);return objectUrl;
 }
 const saveItem=(month,kind,id,region,store,payload,expected)=>rpc('wb_save_item',{p_month:month,p_kind:kind,p_id:id,p_region:region,p_store:store,p_payload:payload,p_expected_updated_at:expected||null});
 async function uploadProof(file,month,region,store){
  if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)||file.size>2*1024*1024)throw Error('凭证支持PNG、JPG、WEBP或PDF，每份不超过2MB');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('凭证读取失败'));reader.readAsDataURL(file);});
  return api('proof-upload',{p_month:month,p_region:region,p_store:store,name:file.name,mime:file.type,data});
 }
 async function proofUrl(path){const x=await api('proof-read',{path}),raw=atob(x.data.replace(/\s/g,'')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),u=URL.createObjectURL(new Blob([bytes],{type:x.type}));setTimeout(()=>URL.revokeObjectURL(u),120000);return u;}
 async function uploadArchive(file,month){
  if(!session?.token||member?.role!=='project')throw Error('仅项目负责人可上传历史复盘文件');
  if(!/^2026-(0[3-9])$/.test(month))throw Error('历史复盘归档仅支持2026年3月至9月');
  if(!/\.(doc|docx|pdf)$/i.test(file.name)||!file.size||file.size>25*1024*1024)throw Error('支持Word或PDF文件，单个文件不超过25MB');
  const body=new FormData();body.append('month',month);body.append('file',file,file.name);
  const response=await fetch(url+'/functions/v1/wb-archive-upload',{method:'POST',headers:{apikey:config.anonKey,'x-workbench-token':session.token},body});
  const content=await response.text();let result;try{result=content?JSON.parse(content):{};}catch{result={error:'上传服务返回内容异常'};}
  if(!response.ok||result.error)throw Error(result.error||result.message||'文件上传失败：'+response.status);
  return {...result.asset,url:archiveUrl(result.asset.object_path),downloadUrl:archiveUrl(result.asset.object_path,result.asset.original_name)};
 }
 root.WBCloud={configured,validateCode,login,membership,logout,load,rpc,plan,records,uploadRecordAttachment,recordAttachmentUrl,importCustomerSnapshot,saveItem,uploadProof,proofUrl,uploadArchive,archiveUrl,get member(){return member;},get hasSession(){return !!session;},get project(){return member?.role==='project';},get canRecords(){return ['project','collaborator'].includes(member?.role);}};
})(window);

