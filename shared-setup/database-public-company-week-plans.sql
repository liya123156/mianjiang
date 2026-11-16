-- Public reporting projection of explicitly saved company weekly plans only.
-- It exposes target, allocation and strategy fields; source/audit/private rows
-- remain protected by their existing permissions. The save API is unchanged.
CREATE OR REPLACE FUNCTION public.wb_public_company_week_plans(p_month text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
 IF p_month IS NULL OR p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN
  RAISE EXCEPTION '全司周计划月份不正确';
 END IF;

 RETURN jsonb_build_object('month',p_month,'items',coalesce((
  WITH saved AS (
   SELECT i.payload,i.updated_at,i.key
   FROM public.wb_items i
   WHERE i.month=p_month AND i.kind='review'
    AND i.region IS NULL AND i.store IS NULL
    AND i.payload->>'recordType'='company-week-plan'
    AND EXISTS (
     SELECT 1 FROM public.wb_audit a
     WHERE a.month=i.month AND a.region IS NULL AND a.store IS NULL
      AND a.action='save-company-week-plan'
      AND a.detail->>'key'=i.key
      AND (a.detail->>'savedUpdatedAt')::timestamptz=i.updated_at
    )
    -- Fail closed if a future payload shape changes a public scalar into an
    -- object. Never serialize an unknown nested value into a public string.
    AND jsonb_typeof(i.payload)='object'
    AND jsonb_typeof(i.payload->'periodStart')='string'
    AND jsonb_typeof(i.payload->'periodEnd')='string'
    AND jsonb_typeof(i.payload->'target') IN ('number','null')
    AND jsonb_typeof(i.payload->'strategyText')='string'
    AND jsonb_typeof(i.payload->'sourceAsOf')='string'
    AND jsonb_typeof(i.payload->'sourceVersion')='string'
    AND jsonb_typeof(i.payload->'calculation')='object'
    AND jsonb_typeof(i.payload#>'{calculation,monthlyTarget}') IN ('number','null')
    AND jsonb_typeof(i.payload#>'{calculation,monthlyMet}')='number'
    AND jsonb_typeof(i.payload#>'{calculation,remainingGap}')='number'
    AND jsonb_typeof(i.payload#>'{calculation,remainingDays}')='number'
    AND jsonb_typeof(i.payload#>'{calculation,periodDays}')='number'
    AND jsonb_typeof(i.payload#>'{calculation,suggestedTarget}') IN ('number','null')
  )
  SELECT jsonb_agg(
   jsonb_build_object(
    'payload',jsonb_build_object(
     'recordType','company-week-plan',
     'periodStart',saved.payload->'periodStart',
     'periodEnd',saved.payload->'periodEnd',
     'target',saved.payload->'target',
     'strategyText',saved.payload->'strategyText',
     'sourceAsOf',saved.payload->'sourceAsOf',
     'sourceVersion',saved.payload->'sourceVersion',
     'calculation',jsonb_build_object(
      'monthlyTarget',saved.payload#>'{calculation,monthlyTarget}',
      'monthlyMet',saved.payload#>'{calculation,monthlyMet}',
      'remainingGap',saved.payload#>'{calculation,remainingGap}',
      'remainingDays',saved.payload#>'{calculation,remainingDays}',
      'periodDays',saved.payload#>'{calculation,periodDays}',
      'suggestedTarget',saved.payload#>'{calculation,suggestedTarget}'
     )
    ) || CASE WHEN allocation.projected IS NULL THEN '{}'::jsonb
     ELSE jsonb_build_object('allocation',allocation.projected) END,
    'updated_at',saved.updated_at
   ) ORDER BY saved.payload->>'periodStart',saved.payload->>'periodEnd',saved.updated_at
  )
  FROM saved
  LEFT JOIN LATERAL (
   SELECT jsonb_build_object('version',1,'stores',jsonb_agg(
    jsonb_build_object(
     'region',entry.value->'region',
     'store',entry.value->'store',
     'monthlyTarget',entry.value->'monthlyTarget',
     'monthlyMet',entry.value->'monthlyMet',
     'remainingGap',entry.value->'remainingGap',
     'weeklyTarget',entry.value->'weeklyTarget'
    ) ORDER BY entry.ordinality
   )) AS projected
   FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(saved.payload#>'{allocation,stores}')='array'
     THEN saved.payload#>'{allocation,stores}' ELSE '[]'::jsonb END
   ) WITH ORDINALITY AS entry(value,ordinality)
   WHERE jsonb_typeof(saved.payload->'allocation')='object'
    AND saved.payload#>'{allocation,version}'='1'::jsonb
   HAVING count(*)=18 AND count(DISTINCT entry.value->>'store')=18
    AND bool_and(coalesce(
     jsonb_typeof(entry.value)='object'
     AND jsonb_typeof(entry.value->'region')='string'
     AND jsonb_typeof(entry.value->'store')='string'
     AND jsonb_typeof(entry.value->'monthlyTarget')='number'
     AND jsonb_typeof(entry.value->'monthlyMet')='number'
     AND jsonb_typeof(entry.value->'remainingGap')='number'
     AND jsonb_typeof(entry.value->'weeklyTarget')='number'
    ,false))
  ) allocation ON true
 ),'[]'::jsonb));
END $function$;

-- Only this intentionally public, read-only projection receives execution.
REVOKE ALL ON FUNCTION public.wb_public_company_week_plans(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_public_company_week_plans(text) TO anon, authenticated;
