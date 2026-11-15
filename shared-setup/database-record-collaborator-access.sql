-- Account preauthorization only. Does not launch shared work records.
-- No people are seeded; provision the explicitly approved member roster separately.
-- Existing custom-code login and project/region/store permissions remain unchanged.
BEGIN;
ALTER TABLE public.wb_members DROP CONSTRAINT IF EXISTS wb_members_role_check;
ALTER TABLE public.wb_members DROP CONSTRAINT IF EXISTS wb_members_check;
ALTER TABLE public.wb_members ADD CONSTRAINT wb_members_role_check
 CHECK(role IN ('project','region','store','collaborator'));
ALTER TABLE public.wb_members ADD CONSTRAINT wb_members_check
 CHECK(role='project'
  OR (role='region' AND region IS NOT NULL AND store IS NULL)
  OR (role='store' AND region IS NOT NULL AND store IS NOT NULL)
  OR (role='collaborator' AND region IS NULL AND store IS NULL));
COMMIT;
