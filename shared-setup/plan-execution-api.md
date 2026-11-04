# 项目规划与日检核接口

部署顺序：先执行 `database-plan-execution.sql`，再由数据库 owner 执行 `database-plan-november-seed.sql`。后者从现有 `2000-01 / review / leadership` 名册核对并读取21店，写入24项执行模板（关联35项规划动作），幂等生成11月全周期任务，含12月1日月复盘。两份文件均可重跑，不覆盖已有执行结果。初始化只有“规划初始化”事件，不新增成员或登录会话，全部任务为待开展。

入口：`POST /rest/v1/rpc/wb_plan_api`，参数 `{p_token,p_action,p_args}`；前端包装为 `WBCloud.plan(action,args)`。除 `public` 外复用现有8小时工号会话。所有 `args` 必须含 `month:'2026-11'`。

| action | 参数 | 返回/用途 |
|---|---|---|
| `public` | `month` | 公开规划 `actions`、门店名/大区 `stores`；不含人员、任务结果或依据 |
| `load` | `month` | `{month,actions,stores,tasks,events,member,permissions}`，任务/事件/门店按服务端授权范围过滤 |
| `save-actions` | `actions:[…]` | 项目负责人保存模板；已有模板实际变更需数字 `version`，不变则幂等跳过 |
| `save-stores` | `stores:[{id?,region,store,enabled?,version?}]` | 项目负责人维护范围；遗漏记录不删除，显式停用保留历史 |
| `generate` | `month` | 项目负责人补建全周期缺少的任务，返回 `{created,existing,storeCount,unassigned,notice}` |
| `submit` | `taskId,expectedVersion,status,result,evidence,groupDetails,benchmark,issue,nextAction` | `status` 仅 `in_progress / blocked / submitted`；返回 `{task}` |
| `review` | `taskId,expectedVersion,decision,note` | `decision` 仅 `accept / reject`；返回 `{task}` |

动作字段：`id,strategyId,title,why,how,acceptance,scope,ownerRole,frequency,startDate,endDate,dueDate,weekday,enabled,version`，另保留 `linkedActionIds,dailyBundle,collaborators,when,scheduleBasis,trigger`。范围和角色固定对应 `company→project / region→region / store→store`。`once` 用 `dueDate`；`daily` 用起止日；`weekly` 加 `weekday`（周一1至周日7）。排期只允许本月及次月前7日。

任务返回驼峰字段：`id,month,actionId,title,strategyId,scope,ownerRole,region,store,taskDate,dueDate,status,version,actionSnapshot,how,acceptance,linkedActionIds,result,evidence,groupDetails,benchmark,issue,nextAction,submittedBy,submittedAt,reviewedBy,reviewedAt,reviewNote,updatedAt,assignees,assignmentStatus,canSubmit,canReview`。`assignees` 是现有启用成员按角色及主/附加门店范围动态匹配的 `{name,role}[]`，没有账号则 `unassigned`，不虚构人员。新增授权后自动承接原任务，无需再次生成。

任务一经生成，动作的范围、角色、频率、起止、截止日和每周日期锁定，避免重复排期。已有任务保留生成时完整动作快照；后续文字修改不会悄悄改变其验收标准。已有任务的门店不能直接换区/改名。停用动作或门店不会删除、取消或隐藏历史任务。

状态由服务端校验：实际结果至少2字；提交验收必须有事实/记录位置/链接作为依据；受阻必须有问题和下一步；推进中必须有下一步。未来日/周任务不可提前填成已执行。店面BP只能更新授权店任务；大区BP更新本区大区任务，并验收本区门店任务；项目负责人可协助更新全范围。店面BP不能自验，大区任务由项目负责人验收。仅待验收可通过/退回，已验收结果须项目负责人写明原因后退回更正。

每次提交/验收在同一事务内锁定任务、核验 `expectedVersion`、递增版本并追加原始事实事件；冲突返回 SQLSTATE `40001`，界面应刷新后重试。操作者、提交时间、验收人由服务端取得，不接受客户端冒名。事件含 `id,taskId,type,actorName,createdAt,payload`，`payload` 保留前后状态、版本和结果快照。四张表均启用RLS且撤销外部直接访问，旧 `wb_save_item` 无法修改它们。

此处自动分派是在站内按完整周期预排任务，BP按日期查看；不发送外部消息，不依赖打开网页触发后台日程。费用核销、原始业务导入与原有模块不改动。

## 验证

`test-plan-execution.mjs` 只在内存中的 PostgreSQL（PGlite）创建测试成员、会话和名册，不连接生产。使用独立目录安装 `@electric-sql/pglite@0.5.15` 后，将 `PLAN_TEST_PGLITE_MODULE` 指向其 `dist/index.js`，执行本测试文件；仓库无需增加运行依赖。

覆盖：SQL完整部署和重跑、公开字段隔离、直接表及内部函数访问禁止、会话过期/成员停用、主/附加门店授权、大区边界、责任人待分派、三种频率及跨月复盘、幂等生成、24个实际模板、21店初始化、服务器操作者、店面自验及跨区越权拒绝、必填依据、乐观并发、退回/重提/验收/重新打开、事件保留、任务快照、排期和组织名称锁定。生产验收应只读确认21店/24模板/预排数、全部初始状态待开展、公开RPC无人员与执行明细；实际提交待真实BP使用后发生。
