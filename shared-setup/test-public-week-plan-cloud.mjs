import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const calls=[],stored=new Map();
const x={window:null,WORKBENCH_CLOUD:{url:'https://example.supabase.co',anonKey:'a'.repeat(45)},sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body),headers:opts.headers});return {ok:true,text:async()=>JSON.stringify({month:'2026-11',items:[]})};},console,Date,URL,Blob,FormData};x.window=x;vm.createContext(x);vm.runInContext(fs.readFileSync(new URL('../operations/cloud.js',import.meta.url),'utf8'),x);
assert.equal(x.WBCloud.member,null);const data=await x.WBCloud.publicCompanyWeekPlans('load',{month:'2026-11'});assert.equal(data.month,'2026-11');assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/rpc/wb_public_company_week_plans'));assert.deepEqual(calls[0].body,{p_month:'2026-11'});assert.ok(!Object.keys(calls[0].body).some(k=>/token|actor|session/i.test(k)));
for(const [action,args] of [['save',{month:'2026-11'}],['delete',{month:'2026-11'}],['load',{month:'2026-13'}],['load',{month:'2026-11',payload:{}}],['load',null]])await assert.rejects(x.WBCloud.publicCompanyWeekPlans(action,args));
assert.equal(calls.length,1,'invalid public write actions never reach server');await assert.rejects(x.WBCloud.companyWeekPlan('save',{month:'2026-11'}),/BP/);await assert.rejects(x.WBCloud.storeReview('load',{month:'2026-11'}),/BP/);assert.equal(calls.length,1,'private operations remain login protected');
console.log('PASS public weekly plan connector: anonymous whitelisted month-only read, no session transmission, rejected mutations and unchanged private auth');
