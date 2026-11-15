import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
let taskServiceCalls = 0;
const context = {
  window: null,
  document: { addEventListener() {}, getElementById() { return null; } },
  currentMonth: '2026-11',
  WBCloud: { member: { role: 'project' }, plan() { taskServiceCalls++; throw Error('Task service must not be used'); } },
  WBQuality: { labels: {} },
  console,
};
context.window = context;
Object.defineProperty(context, 'WBPlanExecution', { get() { taskServiceCalls++; throw Error('Task module must not be read'); } });
vm.createContext(context);
for (const name of ['core', 'ui', 'november-plan', 'november-schedule']) {
  vm.runInContext(read('operations/' + name + '.js'), context, { filename: name + '.js' });
}

const targets = context.WBOperations.novemberTargets();
assert.equal(targets.total, 300);
assert.equal(targets.stores.length, 18);
assert.equal(targets.regions.length, 5);
assert.equal(targets.stores.reduce((sum, row) => sum + row.target, 0), 300);
assert.equal(targets.regions.reduce((sum, row) => sum + row.target, 0), 300);
assert.equal(context.WBNovemberPlan.actions.length, 39);
assert.equal(context.WBNovemberPlan.strategies.length, 4);

const view = { scope: 'company', name: '全司' };
const schedule = context.WBNovemberSchedule.render(view);
const planning = context.WBNovemberPlan.render(view);
const exported = context.WBNovemberPlan.exportText();
assert.equal(context.WBNovemberSchedule.rows().length, 39);
assert.match(schedule, /整月规划排期/);
assert.match(schedule, /本表为规划排期/);
assert.match(planning, /Part 1｜项目目标/);
assert.match(planning, /Part 2｜核心策略与落地动作/);
assert.match(planning, /300套/);
for (const action of context.WBNovemberPlan.actions) {
  assert.ok(planning.includes('id="nov-action-' + action.id.replace('.', '-') + '"'), action.id + ' remains available');
}
for (const content of [schedule, planning, exported]) {
  assert.doesNotMatch(content, /规划分派与责任范围|正在同步执行记录|当前账号可见的执行状态|保存并发布日任务|启用日任务|生成任务|待验收|退回补充|配置排期／更新数据/);
}
assert.equal(taskServiceCalls, 0);
assert.doesNotMatch(read('operations/ui.js'), /WBPlanExecution|pe-admin|计划分包与门店配置/);
assert.doesNotMatch(read('index.html'), /(?:src|href)="operations\/plan-execution\.(?:js|css)/);
assert.equal(typeof context.WBOperations.buildSendPackage, 'function');
assert.equal(typeof context.WBOperations.buildPublicationPackage, 'function');
assert.equal(typeof context.WBOperations.saveSendConfig, 'function');
console.log('PASS dispatch removal: no task-service calls or UI mounts; read-only schedule, 39 actions, 4 strategies, 300 target and 18-store/5-region breakdown preserved; publication exports remain available.');
