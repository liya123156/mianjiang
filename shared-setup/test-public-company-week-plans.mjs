/* Static privacy contract for the intentionally public weekly planning RPC.
 * This does not execute SQL or touch the database. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path=new URL('./database-public-company-week-plans.sql',import.meta.url);
const source=fs.readFileSync(path,'utf8'),sql=source.replace(/--[^\n]*/g,'');
const signature='public.wb_public_company_week_plans(text)';
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.wb_public_company_week_plans\(p_month text\)/i);
assert.match(sql,/RETURNS jsonb\s+LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO ''/i);
assert.match(sql,/IF p_month IS NULL OR p_month !~ '\^20\[0-9\]\{2\}-\(0\[1-9\]\|1\[0-2\]\)\$' THEN/);
const monthPattern=/^20[0-9]{2}-(0[1-9]|1[0-2])$/;
const monthAccepted=value=>typeof value==='string'&&monthPattern.exec(value)?.[0]===value;
for(const value of ['2026-01','2026-11','2099-12'])assert.ok(monthAccepted(value));
for(const value of [null,'','2026-00','2026-13','26-11','2026-1','2026-11-01',' 2026-11','2026-11 ','2026-11\n',"2026-11' OR true--"] )assert.ok(!monthAccepted(value));

// Only company-level plans with a matching genuine save audit are eligible.
assert.match(sql,/FROM public\.wb_items i\s+WHERE i\.month=p_month AND i\.kind='review'\s+AND i\.region IS NULL AND i\.store IS NULL/);
assert.match(sql,/i\.payload->>'recordType'='company-week-plan'/);
assert.match(sql,/EXISTS\s*\(\s*SELECT 1 FROM public\.wb_audit a/);
assert.match(sql,/a\.month=i\.month AND a\.region IS NULL AND a\.store IS NULL/);
assert.match(sql,/a\.action='save-company-week-plan'/);
assert.match(sql,/a\.detail->>'key'=i\.key/);
assert.match(sql,/\(a\.detail->>'savedUpdatedAt'\)::timestamptz=i\.updated_at/);
assert.match(sql,/ORDER BY saved\.payload->>'periodStart',saved\.payload->>'periodEnd',saved\.updated_at/);
assert.match(sql,/'\[\]'::jsonb\)\);/,'no records return an empty public item list');

// Read the literal key positions of every jsonb_build_object call. A future
// payload field cannot become public merely by being added to wb_items.
function splitArguments(body){
 const args=[];let start=0,depth=0,quoted=false;
 for(let i=0;i<body.length;i++){
  const ch=body[i];if(ch==="'"){if(quoted&&body[i+1]==="'"){i++;continue;}quoted=!quoted;continue;}if(quoted)continue;
  if(ch==='(')depth++;else if(ch===')')depth--;else if(ch===','&&depth===0){args.push(body.slice(start,i).trim());start=i+1;}
 }
 args.push(body.slice(start).trim());return args;
}
const calls=[];
for(const match of sql.matchAll(/jsonb_build_object\s*\(/gi)){
 const begin=match.index+match[0].length;let depth=1,quoted=false,end=begin;
 for(;end<sql.length;end++){
  const ch=sql[end];if(ch==="'"){if(quoted&&sql[end+1]==="'"){end++;continue;}quoted=!quoted;continue;}if(quoted)continue;
  if(ch==='(')depth++;else if(ch===')'&&--depth===0)break;
 }
 assert.equal(depth,0,'each projection constructor is syntactically balanced');
 const args=splitArguments(sql.slice(begin,end));assert.equal(args.length%2,0);
 const keys=args.filter((_,i)=>i%2===0).map(key=>{assert.match(key,/^'[A-Za-z_][A-Za-z0-9_]*'$/,'public keys are fixed literals');return key.slice(1,-1);});
 calls.push(keys);
}
const expected=[
 ['month','items'],
 ['payload','updated_at'],
 ['recordType','periodStart','periodEnd','target','strategyText','sourceAsOf','sourceVersion','calculation'],
 ['monthlyTarget','monthlyMet','remainingGap','remainingDays','periodDays','suggestedTarget'],
 ['allocation'],
 ['version','stores'],
 ['region','store','monthlyTarget','monthlyMet','remainingGap','weeklyTarget']
];
assert.deepEqual(calls,expected,'the public DTO is an explicit nested whitelist');
for(const privateKey of ['updatedBy','actor','email','login_id','status','fields','blockers','highlights','nextActions','feedback','payer','advisor','proofPath','note','previous'])assert.ok(!calls.flat().includes(privateKey),privateKey+' is not projected');
assert.doesNotMatch(sql,/\bto_jsonb\s*\(|\brow_to_json\s*\(|SELECT\s+\*|jsonb_agg\s*\(\s*(?:i|saved)\s*\)/i,'no entire item, payload or audit row is returned');
assert.doesNotMatch(sql,/\|\|\s*(?:i|saved)\.payload\b|jsonb_build_object\(\s*'payload'\s*,\s*(?:i|saved)\.payload\s*[,)]/i,'public payload is never the raw private payload');

// Scalars cannot silently turn into nested private documents in a future schema.
for(const key of ['periodStart','periodEnd','strategyText','sourceAsOf','sourceVersion'])assert.ok(sql.includes("jsonb_typeof(i.payload->'"+key+"')='string'"),key+' must remain a string');
for(const key of ['monthlyTarget','monthlyMet','remainingGap','remainingDays','periodDays','suggestedTarget'])assert.ok(sql.includes("jsonb_typeof(i.payload#>'{calculation,"+key+"}')"),key+' is type checked before publication');
assert.match(sql,/CASE WHEN jsonb_typeof\(saved\.payload#>'\{allocation,stores\}'\)='array'\s+THEN saved\.payload#>'\{allocation,stores\}' ELSE '\[\]'::jsonb END/);
assert.match(sql,/saved\.payload#>'\{allocation,version\}'='1'::jsonb/);
assert.match(sql,/HAVING count\(\*\)=18 AND count\(DISTINCT entry\.value->>'store'\)=18/);
assert.match(sql,/bool_and\(coalesce\(/,'missing allocation fields must fail closed, not disappear into SQL NULL');
for(const key of ['region','store','monthlyTarget','monthlyMet','remainingGap','weeklyTarget'])assert.ok(sql.includes("jsonb_typeof(entry.value->'"+key+"')"),key+' allocation field is type checked');
assert.match(sql,/CASE WHEN allocation\.projected IS NULL THEN '\{\}'::jsonb/,'an absent or invalid allocation is omitted rather than leaking its original shape');

// A read-only definer is intentionally exposed only through this narrow RPC.
const body=sql.split('AS $function$')[1]?.split('END $function$;')[0];assert.ok(body);
assert.doesNotMatch(body,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|EXECUTE|GRANT|REVOKE|COPY|CALL)\b/i,'RPC body has no data writes, dynamic SQL or privilege changes');
assert.doesNotMatch(body,/public\.(?:wb_members|wb_code_sessions|wb_imports)|pg_advisory|FOR UPDATE/i,'no private identity/source API or row-lock side effect is added');
const grants=[...sql.matchAll(/GRANT\s+([^;]+);/gi)].map(match=>match[1].trim());
assert.deepEqual(grants,['EXECUTE ON FUNCTION '+signature+' TO anon, authenticated']);
assert.ok(sql.includes('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC;'));
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/gi)||[]).length,1,'the existing authenticated save API remains unchanged');
console.log('PASS public company week plan SQL privacy contract: strict month, audited company scope, fixed nested DTO and numeric/scalar types, optional18-store whitelist, no person/raw/financial fields, STABLE read-only body and per-function grants only.');
