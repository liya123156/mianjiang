# 共享工作记录接口

`database-work-records.sql` 是独立SQL草稿。它依赖现有 `wb_members`、`wb_code_sessions`，不创建个人名单，不配置模型或收费服务。

## 账号和权限

- 保留现有工号登录及8小时自定义会话。
- `collaborator` 是无大区、无门店归属的协作角色；不要用虚构组织填充旧角色，也不要提升为 `project`。
- 授权表中的启用 `project` / `collaborator` 成员可查看、补充、修改全部共享工作记录。
- 旧私有房源、费用、导入、目标及账号管理权限不扩大。
- 人员及内部身份键由负责人在部署时单独配置，不提交到公开源码。

## 请求格式

调用现有POST RPC渠道：

```json
{"p_token":"<custom-session-token>","p_action":"list","p_args":{"month":"2026-11"}}
```

RPC名称为 `wb_work_records_api`。成员身份从服务端会话取得，不接受客户端提交的姓名、角色或操作者作为授权依据。

| action | p_args | 返回 |
| --- | --- | --- |
| list | month可选；region/store/id可选；limit默认100、最大200；offset默认0 | records、processorAvailable:false |
| create | requestId(UUID)、month；rawText和attachmentIds至少一项；region/store/group/title/occurredAt可选 | record、processorAvailable:false |
| append | id、expectedVersion、requestId(UUID)；rawText和attachmentIds至少一项；occurredAt可选 | 更新后的record |
| edit | id、expectedVersion；title/region/store/group/status/owner/due/occurredAt/summary可选 | 更新后的record |
| history | id | history，含每次修改前后快照和服务端操作者 |
| attachment-upload | requestId(UUID)、name、type或mime、data(base64) | attachment元信息 |
| attachment-read | id | data(base64)、type、name |
| attachment-delete | id | deleted:true，仅本人尚未关联的附件 |

`requestId` 在一次提交及其网络重试中保持不变。相同标识但内容改变会被拒绝；版本冲突返回SQLSTATE `40001`。

`list` 按 `created_at DESC, id` 稳定分页，普通编辑不改变记录在分页遍历中的位置。界面取得全部相关页后，可在本地按 `updatedAt` 排列展示最新进展。此offset分页保证编辑不会导致漏项；遍历期间新增记录仍可能移动offset边界，需由客户端按id去重并在需要时重新刷新完整列表。

## 记录与归纳

`record` 包含 id/month/region/store/group/title/rawText/sources/attachments/status/owner/due/occurredAt/version/sourceVersion/createdBy/createdAt/updatedBy/updatedAt。

- `rawText` 汇集原始文字，`sources` 保留每次追加的原文、附件引用、原始发生时间与提交人。
- `occurredAt` 不清楚时保持null，不能把上传时间当成事件发生日期。
- `status` 为业务推进状态：open / in_progress / blocked / done。
- `summary` 是有界JSON对象。建议字段：done、plans、feedback、pending、blockers、next_steps（数组）及review_text（字符串）。
- 人工保存summary时，服务端固定 `summaryMethod=manual`，记录summaryBy/summaryAt。`summaryReviewStatus` 可传draft或reviewed，未传默认draft。
- 新增原文时保留原summary，但把 `summaryStatus` 标为stale，表示“有新原文待整理”。summarySourceVersion可追溯该归纳依据哪一版原始材料。
- 当前没有模型处理器，`processorAvailable=false`，`aiStatus=pending`。提交原始资料只进入待处理队列，不能描述成自动AI已完成。客户端不能修改aiStatus或处理器状态。

## 附件约束

支持PNG/JPG/WebP及常用音频格式，包括AMR。每份最多8MiB，每事项最多4份且合计最多20MiB；此模块附件总配额64MiB。附件字节仅通过已鉴权RPC读取，不产生公开URL。未提交的临时附件只有上传人能读取或移除；关联记录后，全部记录协作者可查看。

## 本地数据库测试

使用真实PostgreSQL引擎的PGlite WASM运行隔离测试，不连接远程Supabase。依赖固定为 `@electric-sql/pglite@0.5.16`，无需将测试依赖加入网页应用。

```sh
npm install --prefix /tmp/work-records-pglite --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.16
PGLITE_MODULE=/tmp/work-records-pglite/node_modules/@electric-sql/pglite/dist/index.js node shared-setup/test-work-records-db.mjs
```

覆盖自定义会话授权、协作角色、跨用户读写、并发版本冲突、原文及历史、人工归纳与待处理状态、请求重试去重、附件私有读取和原子关联，以及草稿重复应用的数据保留。
