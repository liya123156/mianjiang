/* Two independent windows sharing a server: recalculate, publish, and read updates. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = name => fs.readFileSync(new URL('../operations/' + name + '.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const month = '2026-11';
const week = {periodStart: '2026-11-23', periodEnd: '2026-11-29'};
const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function client(server, {project = false, login = '1001'} = {}) {
  const events = new Map(), documentEvents = new Map(), timers = new Map();
  const status = {textContent: ''};
  const host = {
    isConnected: true, renders: 0, html: '', form: null,
    contains: element => Boolean(element),
    get innerHTML() { return this.html; },
    set innerHTML(html) {
      this.html = html; this.renders++;
      if (!html.includes('data-cwp-form="plan"')) { this.form = null; return; }
      const target = html.match(/name="target"[^>]*value="([^"]*)"/);
      const strategy = html.match(/name="strategyText"[^>]*>([\s\S]*?)<\/textarea>/);
      this.form = {
        elements: {
          target: {value: target?.[1] || ''},
          strategyText: {value: decode(strategy?.[1] || '')},
          confirmed: {checked: /name="confirmed" checked/.test(html)}
        },
        reportValidity: () => true,
        querySelector: () => ({disabled: false})
      };
    },
    querySelector(selector) {
      if (selector === '[data-cwp-form]') return this.form;
      if (selector === '[data-cwp-status]') return status;
      return null;
    }
  };
  const root = {
    console, Intl, Date, URL, Blob, AbortController,
    document: {visibilityState: 'visible', addEventListener: (event, fn) => documentEvents.set(event, fn)},
    addEventListener: (event, fn) => events.set(event, fn),
    setInterval(fn, ms) { const id = {}; timers.set(id, {fn, ms}); return id; },
    clearInterval: id => timers.delete(id)
  };
  root.window = root;
  vm.createContext(root);
  for (const name of ['core', 'quality-feed', 'quality-rules', 'quality', 'store-review-model']) vm.runInContext(read(name), root);
  vm.runInContext(read('company-week-plan').replace('root.WBCompanyWeekPlan={', 'root.testSync={draft,load,recalculate,refreshSharedPlan,save};root.WBCompanyWeekPlan={'), root);
  const calls = {public: 0, private: 0, business: 0, save: 0};
  const member = {login_id: login, display_name: login};
  const cloud = {
    project, member,
    async storeReview() { assert.equal(project, true); calls.business++; return {businessData: clone(server.business), items: []}; },
    async companyWeekPlan(action, args) {
      assert.equal(project, true);
      if (action === 'load') { calls.private++; return {month, items: server.row ? [clone(server.row)] : []}; }
      assert.equal(action, 'save'); calls.save++;
      if (server.failSave) throw Error('共享保存失败');
      assert.equal(args.expectedUpdatedAt, server.row?.updated_at || null);
      server.saves++;
      server.row = {
        key: month + '|review|@@company|company-week-plan:' + week.periodStart + ':' + week.periodEnd,
        updated_at: '2026-11-23T10:00:' + String(server.saves).padStart(2, '0') + '.000Z',
        payload: {recordType: 'company-week-plan', ...week, ...clone(args.payload), updatedBy: login}
      };
      return clone(server.row);
    },
    async publicCompanyWeekPlans(action, args) {
      assert.equal(action, 'load'); assert.equal(args.month, month); calls.public++;
      return {month, items: server.row ? [clone(server.row)] : []};
    }
  };
  const ctx = {month, today: '2026-11-23', host, cloud, businessData: null};
  return {root, ctx, host, calls, events, documentEvents, timers, status, P: root.WBCompanyWeekPlan, U: root.testSync};
}

function business(model, {asOf = '2026-11-21', version = '2026-11-22T01:00:00.000Z', met = 1} = {}) {
  const goals = {}, housing = [];
  for (const store of model.storeCatalog.filter(item => item.ownerApplicable !== false)) {
    goals[store.store] = 10;
    for (let j = 0; j < 10; j++) housing.push({'房源编号': store.store + j, '大区': store.region, '门店': store.store, '细分在售户数': 1, '本月是否面见': Number(j < met)});
  }
  return {housing, meetings: [], imports: [{as_of: asOf, created_at: version}], items: [{kind: 'goals', key: month + '|goals|@@company|monthly', payload: goals}]};
}
async function settle(c) { const pending = c.P.state.pending.get(month); if (pending) await pending; }
async function mount(c, data) { c.ctx.businessData = clone(data); c.P.mount(c.ctx); await settle(c); }
function draft(c) { return c.U.draft(c.ctx, week); }

const server = {saves: 0, row: null, business: null};
const admin = client(server, {project: true, login: '0921'});
const initial = business(admin.root.WBModel);
server.business = initial;
const original = admin.P.calculate(initial, week);
server.row = {
  key: month + '|review|@@company|company-week-plan:' + week.periodStart + ':' + week.periodEnd,
  updated_at: '2026-11-22T10:00:00.000Z',
  payload: {recordType: 'company-week-plan', ...week, ...original, target: 100, strategyText: '已经共享的策略', status: 'confirmed', updatedBy: 'Liya', allocation: admin.P.allocationPayload(admin.P.allocate(initial, 100))}
};
const bp = client(server);
const editingWindow = client(server, {project: true, login: '0921'});
await mount(admin, initial); await mount(bp, initial); await mount(editingWindow, initial);
assert.equal(admin.timers.size, 1);
assert.equal([...admin.timers.values()][0].ms, 15000);

// Recalculate publishes a fresh snapshot even if both the target and suggestion stay unchanged.
server.business = business(admin.root.WBModel, {asOf: '2026-11-22', version: '2026-11-23T01:00:00.000Z', met: 2});
assert.equal(admin.P.calculate(server.business, week).calculation.suggestedTarget, original.calculation.suggestedTarget);
await admin.U.recalculate(admin.ctx);
assert.equal(server.saves, 1);
assert.equal(server.row.payload.target, 100);
assert.equal(server.row.payload.sourceAsOf, '2026-11-22');
assert.equal(server.row.payload.calculation.monthlyMet, 36);
assert.equal(server.row.payload.allocation.stores[0].monthlyMet, 2);
assert.equal(draft(admin).dirty, false);

// Another signed-in BP reads the new version without touching any input or reloading the page.
await bp.U.refreshSharedPlan();
assert.equal(draft(bp).target, 100);
assert.equal(draft(bp).sourceAsOf, '2026-11-22');
assert.ok(bp.host.innerHTML.includes('月度累计面见</span><strong>36<small>'));
assert.equal(bp.calls.save, 0);
assert.equal(bp.calls.private, 0);
assert.equal(bp.calls.business, 0);
assert.equal(bp.ctx.businessData.imports[0].as_of, '2026-11-21', 'an older local base table cannot hide the newer shared calculation');
const renderCount = bp.host.renders;
await bp.U.refreshSharedPlan();
assert.equal(bp.host.renders, renderCount, 'an unchanged background read must not repaint the form');

// A different window's in-progress input survives the automatic update and keeps conflict checks.
const editing = draft(editingWindow);
editing.strategyText = '另一窗口正在写的内容'; editing.dirty = true;
editingWindow.host.form.elements.strategyText.value = editing.strategyText;
const editingRenders = editingWindow.host.renders;
await editingWindow.U.refreshSharedPlan();
assert.equal(editing.strategyText, '另一窗口正在写的内容');
assert.equal(editing.remote.updated_at, server.row.updated_at);
assert.equal(editingWindow.host.renders, editingRenders);
await assert.rejects(() => editingWindow.U.save(editingWindow.ctx, editingWindow.host.form), /其他窗口/);

// Recalculation shares numeric updates without publishing unrelated unfinished strategy edits.
const local = draft(admin);
local.strategyText = '管理员尚未保存的策略'; local.dirty = true;
admin.host.form.elements.strategyText.value = local.strategyText;
server.business = business(admin.root.WBModel, {asOf: '2026-11-22', version: '2026-11-23T03:00:00.000Z', met: 3});
await admin.U.recalculate(admin.ctx);
assert.equal(server.saves, 2);
assert.equal(server.row.payload.strategyText, '已经共享的策略');
assert.equal(draft(admin).strategyText, '管理员尚未保存的策略');
assert.equal(draft(admin).dirty, true);
assert.match(draft(admin).notice, /仍待保存/);

// Returning to a window immediately checks the shared plan; hidden pages do no polling work.
bp.events.get('focus')(); await settle(bp);
assert.ok(bp.host.innerHTML.includes('月度累计面见</span><strong>54<small>'));
bp.root.document.visibilityState = 'hidden';
const reads = bp.calls.public;
await bp.U.refreshSharedPlan(); assert.equal(bp.calls.public, reads);
bp.root.document.visibilityState = 'visible';
bp.documentEvents.get('visibilitychange')(); await settle(bp);
assert.equal(bp.calls.public, reads + 1);
bp.events.get('pagehide')(); assert.equal(bp.timers.size, 0);
bp.events.get('pageshow')(); await settle(bp); assert.equal(bp.timers.size, 1);
await assert.rejects(() => bp.U.recalculate(bp.ctx), /仅项目负责人/);

// A new unconfirmed plan still requires an explicit save, and write failures keep the draft.
const unpublishedServer = {saves: 0, row: null, business: initial};
const unpublished = client(unpublishedServer, {project: true}); await mount(unpublished, initial);
await unpublished.U.recalculate(unpublished.ctx);
assert.equal(unpublishedServer.saves, 0); assert.equal(draft(unpublished).dirty, true);
server.failSave = true;
await admin.U.recalculate(admin.ctx);
assert.equal(server.saves, 2); assert.equal(draft(admin).dirty, true);
assert.match(draft(admin).error, /共享保存失败/);

console.log('PASS company plan sync: unchanged-target recalculation publishes, independent BP windows refresh, newest shared metrics win over stale base data, polling is read-only and quiet, drafts and conflicts survive, focus/visibility refresh, permissions and write failures stay safe.');
