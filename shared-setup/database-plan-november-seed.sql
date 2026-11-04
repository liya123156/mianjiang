-- 2026年11月规划初始化。先部署 database-plan-execution.sql，再由数据库 owner 执行。
-- 来源：11月4日共创规划；门店范围取现有组织名册2026-10-27。
-- 不新增成员、不创建登录会话、不代替BP提交；全部任务保持open。
-- 可重跑：已有动作/范围不覆盖，已生成任务不重复。
BEGIN;
DO $guard$
DECLARE n integer; unique_names integer;
BEGIN
 SELECT count(*),count(DISTINCT store) INTO n,unique_names FROM (
  SELECT DISTINCT btrim(region) region,btrim(store) store FROM public.wb_items
  WHERE month='2000-01' AND kind='review' AND payload->>'recordType'='leadership'
   AND btrim(coalesce(store,''))<>'' AND btrim(coalesce(region,''))<>''
 ) roster;
 IF n<>21 OR unique_names<>21 THEN RAISE EXCEPTION '原组织名册需为21家唯一门店，当前%行/%个店名，请核对后再初始化',n,unique_names; END IF;
END $guard$;
INSERT INTO public.wb_plan_actions(month,id,definition,enabled)
 SELECT '2026-11',a->>'id',a-'id'-'enabled',coalesce((a->>'enabled')::boolean,true)
 FROM jsonb_array_elements($nov_plan$[
  {
    "id": "1.1",
    "strategyId": "1",
    "title": "全司月会启动与效果回看",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "月会说明感恩月背景、目标、服务价值及行动包入口。启动后由BP了解各店承接情况，项目负责人汇总需要补充解读的内容。",
    "acceptance": "区分“已发布”与“已理解”。检核伙伴是否知道目的、物料入口和第一步行动；不清楚的安排补充演示与解读。",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.1"
    ],
    "when": "11月3日启动已完成\n本周补效果检核；建议11月6日前",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "协同：店总、店面BP"
  },
  {
    "id": "1.2",
    "strategyId": "1",
    "title": "全司店总会目标与职责共识",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "项目负责人向店总讲清月目标、重点对象、管理动作、资源支持及反馈要求，结合门店实际讨论承接办法。",
    "acceptance": "店总能讲清本店目标、重点动作、谁来承接、何时开始；记录需支持事项。后续行为检核纳入3.3及3.5。",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.2"
    ],
    "when": "本周安排共识\n具体全司店总会会期待确认",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "承接：各店店总；协同：大区总"
  },
  {
    "id": "1.3",
    "strategyId": "1",
    "title": "文化研讨方案输出与BP接收",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "项目负责人将主持框架、研讨问题及预期产出交付BP并解读；BP确认获取方案，理解如何与店总协同组织。",
    "acceptance": "确认BP已打开、理解并知道下一步；形成单店研讨排期。未接收到的当日补发并确认，不能以发群消息代替接收。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-05",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.3"
    ],
    "when": "方案已输出，BP接收与解读待补\n建议11月5日完成",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "承接：大区BP、店面BP"
  },
  {
    "id": "1.4",
    "strategyId": "1",
    "title": "单店启动大会承接",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "店总结合本店目标解读感恩月重点、对象和支持，明确组别承接。店面BP协助物料、现场演示及记录。",
    "acceptance": "检查经理是否知道本组要推进什么，伙伴能否找到物料并开始行动；已开展的店直接检核效果，不重复组织。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.4"
    ],
    "when": "按单店启动安排\n本周确认是否已开展；未开展的补排期",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "协助：店面BP；承接：经理"
  },
  {
    "id": "1.5",
    "strategyId": "1",
    "title": "单店文化研讨",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "店总围绕真实服务经历、希望感谢的顾客、准备多做的一步组织讨论；店面BP协助准备并整理行动产出。",
    "acceptance": "形成具体对象、服务动作、责任人和时间。BP了解伙伴是否理解，并核实是否已开始执行；未转化为行动的再次沟通。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-08",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.5"
    ],
    "when": "建议11月6日前排期\n11月8日前完成首轮，结束后次日检核",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "协助：店面BP；参与：经理、伙伴"
  },
  {
    "id": "1.7",
    "strategyId": "1",
    "title": "周度大区店总会共识",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "大区BP结合各店进展和差距，向店总共识面见与感恩服务价值、重点问题和下一步支持。",
    "acceptance": "形成各店明确的下一步及承接时间，下一次会议回看。需要项目组统一支持的同步项目负责人。",
    "scope": "region",
    "ownerRole": "region",
    "frequency": "weekly",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": null,
    "weekday": 5,
    "enabled": true,
    "linkedActionIds": [
      "1.7"
    ],
    "when": "每周大区店总会\n具体会期沿大区安排",
    "scheduleBasis": "每周大区店总会；任务默认周五归集，实际会期按大区安排。",
    "collaborators": "承接：各店店总；支持：大区总"
  },
  {
    "id": "1.8",
    "strategyId": "1",
    "title": "每日晒数据中的目标共识",
    "why": "通过全司、大区、单店多场景共识，让管理者和伙伴理解目标与服务价值，明确各自行动，并通过行为变化判断共识是否有效。",
    "how": "大区BP发布进展时，结合目标差距说明重点店、店组和需推动的动作；店面BP结合本店情况跟进。",
    "acceptance": "数据之后有具体推动对象和下一步，管理者有回应及行动；数据统计截至时间清楚。",
    "scope": "region",
    "ownerRole": "region",
    "frequency": "daily",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": null,
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.8"
    ],
    "when": "每日晒数据时\n具体时点沿现有节奏",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "协同：店面BP、店总"
  },
  {
    "id": "2.1",
    "strategyId": "2",
    "title": "基础物料和礼品方案统一交付",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "项目负责人统一礼品建议、可用物料、取用入口及现行费用口径，并向销售中心共识；BP实际试用贺卡、下载与打印文件。",
    "acceptance": "各店能找到并使用物料，采购与制作问题有明确支持人。统一模板更新后及时提醒使用最新版。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.1"
    ],
    "when": "本周完成再次交付与使用确认\n建议11月6日前",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "承接：店总、经理；落地协助：店面BP"
  },
  {
    "id": "2.2",
    "strategyId": "2",
    "title": "纸质报告供应商确认与定稿",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "确认印刷供应商、纸张规格、报价、交期和交付范围；组织内容定稿，确定印刷文件版本。",
    "acceptance": "留存确认的供应商、定稿文件、报价及交期。内容、费用和制作要求由实际责任人确认后下单。",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-08",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.2"
    ],
    "when": "本周（11月2—8日）\n本周确认供应商和定稿",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "协同：报告内容负责人、采购或印刷承接人（姓名待补）"
  },
  {
    "id": "2.3",
    "strategyId": "2",
    "title": "线上报告发布到销售中心",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "定稿后向销售中心发送线上版本及固定入口，说明使用场景；店面BP确认伙伴可以打开、下载和取用。",
    "acceptance": "检核各店收到及文件可用情况，记录打不开、下载失败等问题并解决；线上与印刷版本保持一致。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-08",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.3"
    ],
    "when": "本周（11月2—8日）\n定稿后发送线上版本",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "传递与使用确认：店面BP"
  },
  {
    "id": "2.4",
    "strategyId": "2",
    "title": "报告印量与到店分发计划",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "汇总各店需求及库存情况，确认总印量、各店配额、费用支付与报销安排；明确各店收件人、地址和分发方式。",
    "acceptance": "印量、门店配额、费用、收件人和配送方式清楚。纸质报告份数单独确认，不能套用hmall图20份建议。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.4"
    ],
    "when": "建议11月6日前汇总门店需求；必须在印刷下单前确认印量、配额和收件信息。",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "需求与收件信息：店面BP、店总；下单承接人待补"
  },
  {
    "id": "2.5",
    "strategyId": "2",
    "title": "纸质报告印刷与分发",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "与供应商确认校样和制作进度，按门店配额分发；BP到店核对数量和印刷质量，告知领取方式。",
    "acceptance": "项目负责人按21店清单核实到店接收。未到货、少量或质量问题逐项确认补齐时间；延期立即协调，线上版本持续可用。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-15",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.5"
    ],
    "when": "下周推进印刷与分发\n预计11月15日前完成",
    "scheduleBasis": "用户计划：预计11月15日前分发到店；实际到货据实更新。",
    "collaborators": "制作：供应商；到店接收：店面BP"
  },
  {
    "id": "2.6",
    "strategyId": "2",
    "title": "hmall图印刷情况确认",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "店面BP先确认本店是否已印刷、现有数量、规格及可用情况。未印刷或数量不足的，协助对接打印店补齐；建议单店备20份，采用A3卡纸或A3塑封，按实际需求确认。",
    "acceptance": "项目负责人检核各店已印刷数量、规格和可用情况。未印或不足的明确承接人及补齐时间，按约定复查；20份为建议数。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.6"
    ],
    "when": "建议本周先完成印刷情况确认\n未印或不足的明确补齐时间",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "需求确认：店总；提供原文件、检核：项目负责人"
  },
  {
    "id": "2.7",
    "strategyId": "2",
    "title": "hmall图店面公用与使用场景说明",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "印刷情况确认、物料到位后，由店面BP在店内统一存放，供伙伴公用；说明带看、面见客户等使用场景，以及存放位置、取还方式。伙伴随取随用，用后归还，BP统一保管。",
    "acceptance": "项目负责人检核各店是否落实公用存放和使用说明。伙伴知道在哪里取、哪些场景使用、用后归还哪里；BP保持可用数量清楚，破损或旧版及时更换。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-08",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.7"
    ],
    "when": "印刷情况确认、物料到位后立即完成；建议11月8日前首轮检核，全月公用并维护。",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "公用取还：店面伙伴"
  },
  {
    "id": "2.8",
    "strategyId": "2",
    "title": "贺卡方式和目标用量确认",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "店面BP与店总根据目标量确定：伙伴线上个性化定制，或店内批量印刷空白贺卡供手写，也可组合使用；明确数量与费用。",
    "acceptance": "每店明确使用方式、预计数量、制作承接人和完成时间，避免伙伴有需求时无人支持。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.8"
    ],
    "when": "本周确认\n首批集中服务前完成",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "协调执行：店面BP；模板支持：项目负责人"
  },
  {
    "id": "2.9",
    "strategyId": "2",
    "title": "贺卡印刷与实际取用",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "BP协助对接打印店、确认纸张和样张、组织制作；个性化卡片由伙伴核对称呼和署名，空白卡按店面需求备好。",
    "acceptance": "检查印刷是否完成、内容是否正确、存放领取是否明确；线上定制的店确认伙伴会操作。项目负责人看各店准备结果。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-08",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.9"
    ],
    "when": "方式确认后推进，首批集中服务前到位；建议11月8日前首轮检核，按本店首次使用日期校准。",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "内容核对：伙伴；需求及费用确认：店总"
  },
  {
    "id": "2.10",
    "strategyId": "2",
    "title": "礼品选购落实到店组",
    "why": "解决伙伴开展顾客服务时的准备障碍，让礼品、贺卡、hmall图和专业报告能按时到位、方便取用，并有清晰的采购制作支持。",
    "how": "店面BP与店总、经理确认本周选购什么礼品、多少份、谁采购、何时到货，再下钻到组，区分已选、已下单、已到货和未行动。",
    "acceptance": "形成门店及店组的实际状态、所选礼品和预计到货时间。未行动的说明原因并反馈项目负责人；不默认BP个人垫付采购。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "2.10"
    ],
    "when": "本周推进各店选购\n首轮集中检核建议11月6日",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "决定：店总、经理；落地协助：店面BP；采购：门店实际指定人"
  },
  {
    "id": "3.1",
    "strategyId": "3",
    "title": "月目标逐店共识并明确依据",
    "why": "将月目标落实到单店、店组和具体行动，持续看清目标差距与未行动原因，通过再共识和针对性支持推动进展。",
    "how": "项目负责人与每位店总共识月目标、基数和重点类别，结合当前进展及可服务对象确认差距，明确本店承接安排。",
    "acceptance": "沿用工作台现有11月目标口径：全司面见300套、全盘面见率≥20%、门店TOP与户型TOP面见率≥40%、有效客户和业主名单线上表达覆盖100%。逐店确认目标、分母、截至日期、当前完成和差距；店面目标以数据管理中已确认版本为准。",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-06",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "3.1"
    ],
    "when": "本周完成逐店确认\n建议11月6日前",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "结果承接：店总；数据协助：大区BP、店面BP"
  },
  {
    "id": "3.7",
    "strategyId": "3",
    "title": "月度目标与项目效果复盘",
    "why": "将月目标落实到单店、店组和具体行动，持续看清目标差距与未行动原因，通过再共识和针对性支持推动进展。",
    "how": "核对覆盖、在售及TOP面见结果，汇总支持动作、行为变化及真实业务进展，提炼有效策略与后续改进。",
    "acceptance": "数据口径一致，区分项目交付、实际行动和结果；记录委托、转介绍、成交等进展时由销售管理者核实，避免简单归因。",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-12-01",
    "dueDate": "2026-12-01",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "3.7"
    ],
    "when": "建议11月30日统计截止\n12月1日完成复盘",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "结果确认：店总；信息协助：大区BP、店面BP"
  },
  {
    "id": "4.1",
    "strategyId": "4",
    "title": "明确每日正反馈发现与分享安排",
    "why": "让BP主动发现数据、行为和顾客反馈中的进步，及时认可伙伴，传播可学习的做法，增强行动意愿并带动其他伙伴采用。",
    "how": "项目负责人向BP共识每天主动发现、及时分享的要求，明确店内、大区及全司渠道；项目组汇总各店线索，推动全司每天有真实标杆或正反馈可分享。",
    "acceptance": "明确谁发现、谁核实、谁发布、发到哪里。每日运营目标落在全司，不推定每店每天必须产出同等数量案例。",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "once",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": "2026-11-05",
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "4.1"
    ],
    "when": "本周完成安排\n建议11月5日起每日运行",
    "scheduleBasis": "建议排期，可按实际承接日期调整",
    "collaborators": "单店发现：店面BP；大区汇聚：大区BP"
  },
  {
    "id": "store-daily",
    "strategyId": "cross",
    "title": "单店日检核｜共识、目标进度与正反馈",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "daily",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": null,
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "1.6",
      "1.9",
      "3.3",
      "3.4",
      "4.2",
      "4.3",
      "4.4"
    ],
    "why": "把同一天、同一门店需要检核的事实合并更新，连接规划动作与日常推动。",
    "how": "①共识与行为：早会后看各组是否明确当天重点；集中共识后次日核实理解、安排和行为变化。\n②目标与卡点：结合已有数据记录已行动、未行动及待核实店组，说明差距、原因、所需支持和下一步。\n③正反馈：主动从数据和行为变化发现线索，追问真实场景、动作、顾客回应和可学的一步；有核实事实及时分享。当天暂无素材如实记录。",
    "acceptance": "三个维度均有当日事实或明确的“待核实/暂无”；卡点有承接人及复查时间；标杆有具体动作与真实变化。无案例不等于未行动，不要求每店每日硬性产出案例。管理者核实结果后验收，退回项补充后再提交。",
    "scheduleBasis": "建议11月5日起按新安排运行；按当天实际结果更新。"
  },
  {
    "id": "company-daily",
    "strategyId": "cross",
    "title": "全司日检核｜问题承接与每日正反馈运营",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "daily",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": null,
    "weekday": null,
    "enabled": true,
    "linkedActionIds": [
      "3.5",
      "4.5"
    ],
    "why": "把同一天、同一门店需要检核的事实合并更新，连接规划动作与日常推动。",
    "how": "查看各店提交结果，聚焦未行动、持续无进展和资源阻碍；与店总再次共识，必要时协调大区BP及大区总，明确动作和复查日。汇聚各区已核实素材，选定当天可传播内容和发布承接人；保留案例真实发生日期。",
    "acceptance": "需要介入的问题有承接人、下一步和复查时间；不以“已沟通”关闭问题。全司每日正反馈据实运营，暂无已核实素材时明确补充来源，不将旧案例写成当日新发生。",
    "scheduleBasis": "建议11月5日起按新安排运行；按当天实际结果更新。"
  },
  {
    "id": "store-weekly",
    "strategyId": "cross",
    "title": "单店周检核｜目标承接、物料费用与标杆采用",
    "scope": "store",
    "ownerRole": "store",
    "frequency": "weekly",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": null,
    "weekday": 5,
    "enabled": true,
    "linkedActionIds": [
      "2.12",
      "3.2",
      "4.6"
    ],
    "why": "把同一天、同一门店需要检核的事实合并更新，连接规划动作与日常推动。",
    "how": "回看店总目标是否落实到店组、伙伴和具体对象；复盘本周行动与卡点。沿费用核销和既有台账核对采购、印刷、付款、送出与库存，印刷费用口径单独确认。了解伙伴尝试了哪些标杆做法及实际变化。",
    "acceptance": "说明本周目标承接和结果、未解决问题、下周目标动作及责任日期；费用和库存与既有明细对应，不重复登记账目；区分案例传播和实际采用。",
    "scheduleBasis": "建议每周五归集，实际会期可按安排调整。"
  },
  {
    "id": "company-weekly",
    "strategyId": "cross",
    "title": "全司周复盘｜21店进度、资源补齐与标杆运营",
    "scope": "company",
    "ownerRole": "project",
    "frequency": "weekly",
    "startDate": "2026-11-05",
    "endDate": "2026-11-30",
    "dueDate": null,
    "weekday": 5,
    "enabled": true,
    "linkedActionIds": [
      "2.11",
      "3.6",
      "4.7"
    ],
    "why": "把同一天、同一门店需要检核的事实合并更新，连接规划动作与日常推动。",
    "how": "按21店及重点店组汇总目标进展，回看上周动作及问题闭环；核实报告、hmall图、贺卡和礼品是否收到、制作、可取用和已使用；回看每日正反馈、BP主动发现和案例采用情况，调整下周重点及支持。",
    "acceptance": "产出下周目标、重点店组、动作、责任人和复查日；未准备物料明确补齐时间；无案例门店区分未行动、已行动未反馈、已有事实未挖掘。已解决问题需有复查结论。",
    "scheduleBasis": "建议每周五归集，实际会期可按安排调整。"
  }
]$nov_plan$::jsonb) a
 ON CONFLICT(month,id) DO NOTHING;
INSERT INTO public.wb_plan_stores(month,id,region,store,source)
 SELECT '2026-11',md5('2026-11|'||region||'|'||store),region,store,'现有组织名册2026-10-27'
 FROM (SELECT DISTINCT btrim(region) region,btrim(store) store FROM public.wb_items
  WHERE month='2000-01' AND kind='review' AND payload->>'recordType'='leadership'
   AND btrim(coalesce(store,''))<>'' AND btrim(coalesce(region,''))<>'') roster
 ON CONFLICT DO NOTHING;
SELECT public.wb_plan_generate('2026-11',null,'规划初始化');
COMMIT;
