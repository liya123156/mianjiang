-- 11月5日补充：预计11月12日全员培训，当晚店总会同步通关标准与物料。
-- 仅更新两项动作的说明；正式排期、启用状态、任务结果和验收历史保留。
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('wb-plan:2026-11'));
DO $guard$
BEGIN
 IF (SELECT count(*) FROM public.wb_plan_actions WHERE month='2026-11' AND id IN ('2.13','2.14'))<>2 THEN
  RAISE EXCEPTION '报告培训与通关动作尚未初始化，请先核对规划';
 END IF;
END $guard$;
UPDATE public.wb_plan_actions AS current
SET definition=current.definition || (patch.value-'id'),version=current.version+1,updated_at=now()
FROM jsonb_array_elements($training_plan$[
  {
    "id": "2.13",
    "how": "预计11月12日面向全体伙伴开展上海城市报告培训。项目负责人对接海燕落实培训内容、讲师和参训安排；使用线上定稿版本开展学习，纸质印刷与配送同步推进。当晚在全司店总会上再次同步培训内容、门店通关标准及配套物料，明确由门店承接通关。",
    "collaborators": "内容与讲师协调：海燕；全员参训与门店承接：店总；参训及物料接收跟进：BP",
    "when": "预计11月12日开展全员培训\n预计11月12日晚全司店总会再次同步培训、通关标准及相关物料",
    "acceptance": "分别核实全员培训的实际开展与参训情况、当晚店总会同步情况，以及各店是否收到并理解通关标准和配套物料；记录缺席、需补学的问题及门店后续承接安排。预计排期不代表已经完成。",
    "scheduleBasis": "预计11月12日；具体培训时段、讲师及最终会期仍需落实，确认后启用对应任务。",
    "trigger": "线上报告定稿后，按预计11月12日的安排落实全员培训和当晚店总会同步；不等待纸质报告到货。"
  },
  {
    "id": "2.14",
    "how": "承接预计11月12日的全员培训及当晚全司店总会同步的通关标准、配套物料，由店总组织、经理实施单店通关。结合实际顾客需求，通过模拟面见检核伙伴能否讲清报告并用于服务；BP记录已通关、待补训及复查安排，未通过的补训后再次通关。",
    "when": "11月12日培训及当晚店总会标准、物料同步后，由门店承接通关\n单店具体通关、补训及复查日期与店总确认；首次使用报告服务前完成",
    "acceptance": "核实本店已收到通关标准及配套物料，并明确组织人、通关日期和参与人员；逐人记录通关结果、待补训问题和复查日期。依据实际演练与复核确认完成，参加培训或收到物料不等于通关。",
    "scheduleBasis": "前置培训及店总会预计11月12日；各店通关完成日期待确认，不将培训日期作为单店通关截止日。",
    "trigger": "承接2.13全员培训和当晚店总会的标准、物料同步，再由门店组织通关；未通过的补训、复核。"
  }
]$training_plan$::jsonb) AS patch(value)
WHERE current.month='2026-11' AND current.id=patch.value->>'id'
AND current.definition IS DISTINCT FROM current.definition || (patch.value-'id');
COMMIT;
