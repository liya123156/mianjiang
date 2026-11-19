-- Add the two existing latest-meeting participation flags to the existing
-- public progress projection. Preserve every other field and the current
-- function owner, privileges, validation and source-data selection.
DO $patch$
DECLARE
  definition text;
  original_fields constant text := '''门店top户数'',h.payload->''门店top户数'',''户型top户数'',h.payload->''户型top户数''';
  updated_fields constant text := '''门店top户数'',h.payload->''门店top户数'',''户型top户数'',h.payload->''户型top户数'',''本月最近一次面见是否店总陪同'',h.payload->''本月最近一次面见是否店总陪同'',''本月最近一次面见是否店经理陪同'',h.payload->''本月最近一次面见是否店经理陪同''';
BEGIN
  SELECT pg_get_functiondef('public.wb_public_daily(text)'::regprocedure) INTO definition;
  IF position('本月最近一次面见是否店总陪同' IN definition)>0
     AND position('本月最近一次面见是否店经理陪同' IN definition)>0 THEN
    RETURN;
  END IF;
  IF position('本月最近一次面见是否店总陪同' IN definition)>0
     OR position('本月最近一次面见是否店经理陪同' IN definition)>0
     OR position(original_fields IN definition)=0 THEN
    RAISE EXCEPTION 'Public progress projection differs from the expected source; review before changing it';
  END IF;
  EXECUTE replace(definition,original_fields,updated_fields);
END
$patch$;
