import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const x={window:null,console,Intl,Date,crypto:globalThis.crypto};x.window=x;vm.createContext(x);
for(const name of ['manager-directory','core'])vm.runInContext(fs.readFileSync(new URL('../operations/'+name+'.js',import.meta.url),'utf8'),x,{filename:name+'.js'});
const D=x.WBManagerDirectory,M=x.WBModel;
const expected=[
 ['花木大区','御翠园店','A:陈飞 C:宋春杰 D:黄伟安 F:纪胜强'],
 ['花木大区','仁恒河滨城店','A:卢海威 B:袁圆 D:卢晓琪 E:马兆庶'],
 ['花木大区','浦东别墅旗舰店','A:张译匀 B:朱丹丹 C:王亮 D:齐杰'],
 ['花木大区','碧云店','A:聂磊 B:殷付荣 C:赵正阳 D:程雪凝'],
 ['陆家嘴大区','星河湾店','A:魏亮亮 B:蔡娣 C:张彬 D:吕佳峰'],
 ['陆家嘴大区','顶级豪宅部','A:鲁德月 B:何奕伟 C:郭慧 D:潘闯庆'],
 ['陆家嘴大区','陆家嘴金融中心店','A:曹元龙 B:柳勇 C:赵薇 D:黄一凡'],
 ['陆家嘴大区','陆家嘴旗舰店','A:曹得亮 C:朱文宇 D:张燕 E:韩斌畴'],
 ['陆家嘴大区','陆家嘴滨江店','A:孙少琦 B:孔钦军 C:刘倩倩 D:杨继栋'],
 ['黄浦大区','新天地一店','A:张宇 B:郭瑞瑞 C:范福星 D:王漫'],
 ['黄浦大区','新天地二店','A:钱勇 B:宗丽 C:任晓帅 D:王卓'],
 ['黄浦大区','黄浦滨江店','A:原涛 B:刘争彦 C:张珍 D:黄琛巍'],
 ['黄浦大区','复兴香园店','A:景兆欢 B:虞芳红 C:鲍志成 D:胡蝶'],
 ['徐汇大区','尚海湾店','A:陈圆 B:龚进 C:瞿建柱 D:杨霄霄'],
 ['徐汇大区','徐汇滨江店','A:周衡坤 B:谢明睿 C:陈飞 D:余高翔'],
 ['徐汇大区','嘉御庭公馆店','A:孙磊鑫 B:余艳 C:孙威风 D:李胜男'],
 ['滨江古北大区','融创滨江壹号院店','A:蒋碧珊 B:杨超 C:赵爽 D:王正兵'],
 ['滨江古北大区','长宁古北店','A:郝彬 C:李可毅 D:赵成宇']
];
let checked=0;for(const [region,store,assignments] of expected)for(const assignment of assignments.split(' ')){const [letter,name]=assignment.split(':');const group=store+letter+'组';assert.equal(D.lookup({region,store,group}),name,region+' / '+group);checked++;}
assert.equal(checked,71);assert.equal(D.rows.length,71);assert.equal(new Set(D.rows.map(r=>[r.region,r.store,r.group].join('|'))).size,71);
assert.equal(D.rows.filter(r=>r.name==='陈飞').length,2,'same-name managers in two stores retain their distinct organizational identities');
assert.equal(D.lookup({region:' 花木大区 ',store:' 御翠园店 ',group:' 御翠园店 Ａ 组 '}),'陈飞');
assert.equal(D.lookup({运营大区:'黄浦大区',门店:'新天地一店',组:'新天地一店Ｃ组'}),'范福星');
assert.equal(D.lookup({region:'徐汇大区',store:'御翠园店',group:'御翠园店A组'}),'','region is part of the identity; never guess from a similar group');
assert.equal(D.lookup({region:'花木大区',store:'御翠园店',group:'御翠园店B组'}),'','unprovided groups stay unresolved');
assert.equal(D.nameFor({region:'花木大区',store:'御翠园店',group:'御翠园店B组'}),'待补充');
for(const group of ['',undefined,'/','—','-'])assert.equal(D.nameFor({region:'花木大区',store:'御翠园店',group}),'—','aggregate groups have no manager');
assert.ok(Object.isFrozen(D.rows)&&D.rows.every(Object.isFrozen),'reference roster cannot be accidentally changed in place');

const h=(id,group,advisor,met,overrides={})=>({房源编号:id,大区:'花木大区',门店:'御翠园店',店组:'御翠园店'+group+'组',维护人姓名:advisor,细分在售户数:1,本月是否面见:met,门店top户数:1,户型top户数:0,...overrides});
const housing=[h('f','F','伙伴己',0),h('c','C','伙伴丙',1),h('a','A','伙伴甲',1),h('unknown','B','伙伴乙',0),h('foreign','C','伙伴丁',1,{大区:'徐汇大区',门店:'徐汇滨江店',店组:'徐汇滨江店C组'})];
const events=[{房源编号:'a'},{房源编号:'a'},{房源编号:'c'}];
const baseline=M.metrics(housing.slice(0,4),events);
const company=M.table(housing,{}, {},'2026-11',events);
assert.ok(!company.columns.some(c=>c.key==='manager'),'ordinary company summary does not add a completely blank manager column');
assert.ok(!company.rows.some(r=>r._level==='group'||r._level==='advisor'));
const selected=M.table(housing,{region:'花木大区',store:'御翠园店'},{御翠园店:13},'2026-11',events);
const keys=Array.from(selected.columns,c=>c.key);assert.equal(keys.indexOf('manager'),keys.indexOf('group')+1);assert.equal(keys.indexOf('name'),keys.indexOf('manager')+1);
assert.deepEqual(Array.from(selected.rows.filter(r=>r._level==='group'),r=>r.group),['御翠园店A组','御翠园店B组','御翠园店C组','御翠园店F组']);
for(const row of selected.rows.filter(r=>r._level==='group'||r._level==='advisor'))assert.equal(row.manager,D.nameFor(row));
assert.equal(selected.rows.find(r=>r._level==='advisor'&&r.name==='伙伴甲').manager,'陈飞');assert.equal(selected.rows.find(r=>r._level==='advisor'&&r.name==='伙伴甲').name,'伙伴甲','manager never replaces advisor name');
const storeRow=selected.rows.find(r=>r._level==='store');for(const field of ['stock','met','met_count','gift','store_top_stock','store_top_met','unit_top_stock','unit_top_met'])assert.equal(storeRow[field],baseline[field],field+' total unchanged');
assert.ok(!selected.rows.some(r=>r.group==='御翠园店D组'),'roster-only groups do not create inventory or progress rows');
const allLevels=M.table(housing,{}, {},'2026-11',events,{includeAllLevels:true});assert.ok(allLevels.columns.some(c=>c.key==='manager'),'full all-level exports include the manager column');
assert.equal(allLevels.rows.find(r=>r._level==='advisor'&&r.name==='伙伴丁').manager,'陈飞');
console.log('PASS 71 manager assignments across 18 stores: exact region/store/group identity, same-name isolation, normalization, unknown/aggregate behavior, separate progress manager column, unchanged metrics and no invented groups.');
