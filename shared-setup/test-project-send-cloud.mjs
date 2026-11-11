import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const key='2000-01|rules|@@company|wechat-send-config-v1';
const item={key,kind:'rules',payload:{recordType:'wechat-send-config',version:2,stores:[]}};
const leader={key:'leader',kind:'review',payload:{recordType:'leadership'}};
let role='project';const calls=[];
const storage=new Map();
const context={URL,Date,console,WORKBENCH_CLOUD:{url:'https://fixture.supabase.co',anonKey:'a'.repeat(40)},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,request)=>{
 const name=url.split('/').at(-1),body=JSON.parse(request.body);calls.push({name,body});
 let data={};
 if(name==='wb_code_login')data={token:'fixture-session-only',expires_at:Date.now()/1000+3600,member:{role,region:role==='project'?null:'黄浦大区'}};
 else if(name==='wb_code_api'&&body.p_action==='load')data=body.p_args.p_month==='2000-01'?{items:[leader,item]}:{housing:[],meetings:[],items:[],imports:[]};
 else if(name==='wb_public_daily')data={housing:[],meetings:[],items:[],imports:[]};
 else if(name==='wb_public_archives')data=[];
 return {ok:true,text:async()=>JSON.stringify(data)};
}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../operations/cloud.js',import.meta.url),'utf8'),context);
const C=context.WBCloud;
await C.login('0001');let data=await C.load('2026-11');assert.equal(data.sendConfigItem.key,key);assert.equal(data.directory.length,1);assert.equal(data.directory[0].key,'leader');
assert.ok(calls.some(c=>c.name==='wb_code_api'&&c.body.p_action==='load'&&c.body.p_args.p_month==='2000-01'));
await C.logout();role='region';await C.login('0002');data=await C.load('2026-11');assert.equal(data.sendConfigItem,null,'region role cannot receive the project-only config, even if an unexpected response includes it');
await C.logout();role='store';await C.login('0003');data=await C.load('2026-11');assert.equal(data.sendConfigItem,null);
await C.logout();data=await C.load('2026-11');assert.equal(data.sendConfigItem,null);
console.log('PASS cloud project configuration: private project load, preserved leadership directory, no region/store/public exposure.');
