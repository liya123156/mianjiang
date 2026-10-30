'use strict';

/* Monthly plans are separate from actual review data. Unconfirmed numbers stay null. */
const NOVEMBER_PLAN = {
  version: '20261026-plan-v1',
  title: '11月感恩月 · 在售业主面见计划',
  theme: '把感恩带到业主面前',
  status: '共创初稿 · 待目标共识',
  period: '2026.11.01 — 11.30',
  positioning: '以11月感恩月为契机，由项目组统筹、HRBP运营支持、销售中心自上而下推动的在售业主面见专项。',
  goal: '把全年坚持的“感恩利他、顾客至上”，在11月集中表达、集中兑现。通过全司与单店共识、感恩邀约与心意物料、全月周度推进和真实服务反馈，激发伙伴主动联系自己深耕责任盘内的在售业主，提升实际面见量与去重面见覆盖。',
  value: '让业主在一次次用心、专业、持续的服务中，更了解丽兹行、更熟悉服务伙伴，并逐步建立信任。当业主有出售、置换或资产配置需求时，愿意优先想到我们、给予服务机会，为责任盘心占、后续市占和成交转化积累基础。',
  problem: '解决日常面见缺少共同主题、伙伴主动性与持续性不足、服务价值未被看见的问题；用感恩月形成自然的联系契机，让管理者的业务推动得到氛围、物料和正反馈支持。',
  principles: ['先主动付出、创造服务价值，再赢得信任。', '线上感谢是连接起点；面见承接沟通；专业服务兑现承诺。', '伴手礼为表达心意加分，送出礼物与完成面见分别记录。'],
  goals: [
    {title:'愿意主动去见', result:'把感恩顾客转化为全店共同的面见行动。', why:'伙伴理解持续面见的意义，管理者把共识落到责任盘和当月计划。', supports:[
      {name:'全司启动：文化与行动相连', why:'借11月3日嘉奖大会的集中关注，让全员看见面见的服务价值与参与方式。', what:'面见精英认可、感恩月启动视频、主持人行动号召，合并为一个启动环节。', how:'建议总时长6–8分钟，视频控制在4–5分钟：感恩文化 → 主动服务 → 真实业主回响 → 11月行动。会后发布一页行动说明与物料入口。', owner:'项目组统筹；大会/视频团队制作；销售管理者带动', output:'确认版串词与视频、1页行动说明、统一物料入口。'},
      {name:'单店共识：从文化理解到责任盘行动', why:'让“我认同”转化为“我这周准备怎么做”。', what:'在单店感恩文化研讨中嵌入15–20分钟的业主服务讨论。', how:'店总带伙伴讨论：我们怎样把感谢变成业主感受到的服务？随后明确每位伙伴的责任范围、当月目标与首周安排；BP提供讨论页和目标口径。', owner:'店总主讲并定计划；经理承接；HRBP协助', output:'单店目标、责任到人、首周计划；11月6日前建议完成。'}
    ]},
    {title:'把心意变成面见', result:'全盘启动个性化联系与邀约，带着准备走近业主。', why:'用感恩月提供自然的联系场景，减少表达和物料准备的负担。', supports:[
      {name:'感恩表达：一份专属心意，一次自然邀约', why:'感谢要能对应真实关系，让业主感到被认真对待。', what:'个性化感恩信息、可填写贺卡、小而美伴手礼，以及面见后的服务回信。', how:'顾问补入真实称呼和服务细节；礼品含包装/贺卡/分摊运费控制在30元以内。门店自主选择适合业主的方式；BP提供候选、样品与采购信息。', owner:'HRBP提供物料；门店选品；顾问个性化使用', output:'可直接使用的3款贺卡与表达模板；确认后的采购清单。'},
      {name:'目标共识：全盘联系，实际面见按店定标', why:'扩大覆盖，同时把行动意愿落实到可执行的门店目标。', what:'销售中心核实责任盘在售业主范围，确定面见目标、周计划与专业服务准备。', how:'全盘逐户启动联系与邀请；异地/暂不便见面者持续线上维护。店总结合核实名单、10月同口径基线和团队能力确认目标，经理负责邀约与面见质量。', owner:'店总/经理主责；顾问执行；HRBP汇总与支持', output:'已共识目标池、实际面见目标套数、每周安排及责任人。'}
    ]},
    {title:'让全月持续发生', result:'每周有行动、有变化、有真实服务价值被看见。', why:'通过及时支持与认可保持动力，让一次启动带动全月执行。', supports:[
      {name:'周度运营：固定节奏，重点支持', why:'及时识别停滞门店与资源缺口，把BP时间用于有价值的推动。', what:'每周一份简报，包含进度、变化、重点支持、下一步。', how:'周一复用系统数据；周二与店总对齐当周安排并分享案例；周中解决物料/协同问题；周五核进展。销售管理者持续处理逐户邀约与专业服务问题。', owner:'项目组统一口径；HRBP运营；销售中心执行', output:'同口径目标与实际、重点门店支持事项、明确责任人和完成时间。'},
      {name:'正反馈运营：让用心服务被看见', why:'让伙伴看见持续面见带来的关系变化和服务机会。', what:'系统反馈提炼、当周认可、每周精选故事、12月专项嘉奖推荐。', how:'BP从现有面见反馈筛候选，只补问服务动作与前后变化；管理者核实后，每周精选约2条分享，保留顾客原话。价格/意向信息仅作业务信息，不直接当作认可案例。', owner:'HRBP提炼；销售管理者核实；项目组传播/推荐', output:'简短故事卡与原始依据；顾客信息脱敏，公开使用原声/影像前确认授权。'}
    ]}
  ],
  tasks: [
    {date:'10/27—10/30',title:'统一目标口径与资源',role:'项目组',owner:'项目负责人牵头；大区BP、销售管理者参与',where:'项目对齐会',what:'确认面见统计口径、11月目标制定方式、启动资源与预算。小范围验证不同门店是否看得懂、用得上。',output:'口径页、预算草案、物料责任分工；具体人员待确认',status:'建议排期'},
    {date:'11/1—11/2',title:'门店目标与首周计划',role:'销售中心',owner:'店总定标；经理拆解；HRBP汇总',where:'门店经营安排',what:'核实在售业主范围，参考10月同口径基础，确定11月目标与首周安排；落实到组、顾问和责任盘。',output:'目标池、目标套数、责任人与首周安排',status:'待共识'},
    {date:'11/2前',title:'启动与感恩物料就绪',role:'HRBP',owner:'项目组统筹；HRBP对接门店',where:'共用物料库 / 门店',what:'确认视频、串词和行动页；完成礼物样品与报价核验，门店选品；发布贺卡及表达模板。',output:'上线物料包；礼品采购信息确认后补齐',status:'准备计划'},
    {date:'11/3',title:'全司嘉奖大会启动',role:'项目组',owner:'大会团队、项目组；管理者带动',where:'全司月度嘉奖大会',what:'面见精英认可 → 感恩月视频 → 全员行动号召。讲清为什么主动服务、11月怎么参与、支持从哪里领取。',output:'全员知道主题、行动和入口；建议环节6–8分钟',status:'拟定节点'},
    {date:'11/3—11/6',title:'单店研讨落到当周行动',role:'销售中心',owner:'店总主讲；经理承接；HRBP协助',where:'感恩文化研讨 / 店会',what:'嵌入15–20分钟业主服务话题，结合本店真实案例说明面见价值，回到责任盘确认当周行动。',output:'店内共识记录与当周行动计划',status:'建议排期'},
    {date:'11/1—11/30持续',title:'联系、邀约、面见与服务承接',role:'销售中心',owner:'顾问执行；经理带教；店总管理结果',where:'线上联系 / 责任盘线下面见',what:'逐户表达感恩、自然提出面见邀请；面见前完成专业准备，面见后兑现承诺，并录入现有系统。',output:'真实面见记录、信息反馈与下一步服务；送礼单独登记',status:'全月持续'},
    {date:'每周一',title:'复用系统，形成一页周报',role:'HRBP',owner:'HRBP汇总；项目组校验口径',where:'原有反馈系统 / 周度沟通',what:'取上一周实际新增、月累计、目标差距和支持事项；从反馈筛故事候选。',output:'一页周报；不要求顾问重复填写完整故事',status:'每周循环'},
    {date:'每周二',title:'管理者对齐与及时认可',role:'销售中心',owner:'店总/经理；HRBP协助',where:'早会 / 店会',what:'确认当周面见安排和需要的支持，分享经核实的服务变化，认可具体动作。',output:'当周行动与责任人；约2条周精选由项目组统筹',status:'每周循环'},
    {date:'周中—周五',title:'重点支持与进展反馈',role:'HRBP',owner:'HRBP协调；销售管理者落实',where:'单店沟通 / 区域协同',what:'优先支持启动未落地、进展停滞、物料不足的门店；业务难点交管理者承接，周五回看变化。',output:'支持事项、处理人、完成时间与变化记录',status:'每周循环'},
    {date:'感恩节当周',title:'把已发生的用心传递出去',role:'项目组',owner:'项目组组织；门店选择参与',where:'面向顾客的感谢卡 / 服务内容',what:'精选真实服务片段，形成可对客使用的感谢内容；顾问向业主回顾已完成服务与下一步支持。',output:'可转发内容或短片；素材核实后制作',status:'可选增强'},
    {date:'11/30—12月首周',title:'结果核对、复盘与持续服务',role:'项目组',owner:'项目组、HRBP、销售管理者',where:'月度复盘 / 12月嘉奖推荐',what:'核面见量与去重覆盖、礼物与费用、有效故事及后续服务；销售中心持续跟进服务机会。',output:'11月结果复盘、12月承接清单、嘉奖推荐',status:'计划收口'}
  ],
  materials: [
    {id:'invite',title:'感恩联系与自然邀约',use:'用于已有联系的在售业主；补入真实服务场景后发送。',text:'[称呼]您好，11月是丽兹行的感恩月，也想借这个机会向您问候。[补充一件与您有关的真实服务细节或您关心的事]。近期我为您整理了[具体且有用的内容]，希望找个您方便的时间当面向您汇报，也听听您接下来的安排。您近期什么时候方便？'},
    {id:'first',title:'联系较少的业主',use:'不虚构长期托付，也不把感谢作为见面的交换条件。',text:'[称呼]您好，我是负责[楼栋/责任盘]的丽兹行[姓名]。11月是我们的感恩月，我也希望借这个机会，把日常能为业主提供的服务介绍得更清楚。我准备了[与业主有关的内容]，如您方便，希望有机会当面听听您的需求。时间以您方便为准。'},
    {id:'followup',title:'面见后的服务回信',use:'当天或约定时间发送，把感谢落实为可兑现的下一步。',text:'[称呼]，感谢今天留出时间交流。您提到的[具体关注点]我已记下。我会在[时间]前为您补充[约定内容]，通过[方式]向您反馈。后续有新的想法，也欢迎随时告诉我。'},
    {id:'story',title:'系统反馈补充卡',use:'从既有记录提取，仅对缺失信息补问。',text:'【来源】系统记录日期 / 对应面见记录\n【服务动作】伙伴主动做了什么？\n【真实变化】业主反馈或关系前后有什么变化？\n【依据】可核实的原话 / 记录（传播前脱敏）\n【下一步】还要兑现什么服务，谁在何时跟进？\n【核实】销售管理者确认人 / 时间'},
    {id:'weekly',title:'一页周报模板',use:'BP复用系统数据和已有管理沟通，按同一口径更新。',text:'【范围与截止时间】\n【目标与进度】当月目标 / 上周新增去重套数 / 月累计去重套数 / 目标完成率 / 目标池覆盖率\n【变化】本周比上周新增了什么？\n【重点支持】门店 / 事项 / 承接人 / 完成时间\n【服务故事】经核实的动作与反馈\n【下周】销售管理者确认的行动 / BP支持事项'}
  ],
  cards:[
    {title:'上海秋意版',file:'assets/gratitude-autumn.webp',use:'日常问候、初次或较少联系时使用；手写称呼和一件具体的关心。'},
    {title:'感谢信任版',file:'assets/gratitude-trust.webp',use:'用于确有沟通与服务基础的业主；补充真实细节，避免套话。'},
    {title:'面见后回信版',file:'assets/gratitude-followup.webp',use:'面见后记录业主关心的事，写清后续服务与承诺时间。'}
  ],
  gifts:[
    ['上海梧桐 / 银杏书签 + 贺卡','秋意与阅读相伴，表达细致心意','整份≤28元','看材质、边缘与包装实样；款式/报价待核验'],
    ['简洁杯垫 + 手写贺卡','日常可用，让关心留在生活里','整份≤27元','避免浓重广告感；先验触感、平整度'],
    ['秋冬手部护理小礼 + 贺卡','把季节关怀落到日常使用','整份≤29元','核正规渠道、成分与适用偏好，不默认适合所有业主'],
    ['有质感的感谢卡','把预算留给真实、专属的表达','整份≤5元','核纸张/印刷；个人手写内容更重要']
  ],
  decisions:[
    ['目标与口径','11月在售目标池、每店目标套数、基线比较范围','销售负责人 / 店总','11/2前建议确认','待共识'],
    ['启动资源','11/3时长、视频素材、制作人与审核人','项目负责人 / 大会负责人','制作前确认','待确认'],
    ['礼物与费用','样品、含税及运费报价、采购人、报销口径','项目组 / HRBP / 财务及门店','下单前确认','待确认'],
    ['激励与嘉奖','每周真实故事认可；12月奖项衔接；可选小惊喜预算','项目组 / 嘉奖负责人','启动宣导前确认','待确认'],
    ['周度数据','系统字段、数据提供人、截止时间、反馈模板','项目组 / 数据提供人 / HRBP','首周报前确认','待确认']
  ]
};

function applyProjectPlans(archive) {
  const base = archive.months['2026-10'];
  if (!archive.months['2026-11']) {
    const views = Object.fromEntries(Object.entries(base.views).map(([key,v]) => [key,{
      scope:v.scope,role:v.role,name:v.name,region:v.region,store:v.store,
      title:'11月感恩月 · '+v.name,kpis:[],sections:[]
    }]));
    archive.months['2026-11'] = {
      meta:{month:'2026-11',title:NOVEMBER_PLAN.title,cutoff:'实际结果尚未录入',week:'11月全月',updated_label:'方案初稿 · 2026/10/26'},
      regions:JSON.parse(JSON.stringify(base.regions)),views,planOnly:true
    };
  }
  return archive;
}
function planAvailable() { return ['2026-10','2026-11'].includes(currentMonth); }
function modeFromUrl() {
  const requested = new URLSearchParams(location.search).get('tab');
  if (['daily','expense','admin'].includes(requested)) return requested;
  return requested === 'plan' && planAvailable() ? 'plan' : requested === 'review' ? 'review' : DATA?.planOnly ? 'plan' : ['#goals','#quality','#organizations','#week','#candidate-detail','#results'].includes(location.hash) ? 'review' : 'daily';
}
function renderModeControls() {
  const root = document.getElementById('view-modes'); root.hidden = !DATA;
  root.querySelectorAll('[data-view-mode]').forEach(b => {
    b.setAttribute('aria-pressed',String(b.dataset.viewMode === currentMode));
    b.disabled = b.dataset.viewMode === 'plan' && !planAvailable();
  });
  document.getElementById('copy-report').textContent = currentMode === 'plan' ? '复制当前计划' : currentMode === 'daily' ? '复制推动话术' : '复制当前复盘';
  document.getElementById('copy-progress-image').hidden = !['daily','review'].includes(currentMode) || (!!DATA?.planOnly && currentMode==='review');
  document.querySelector('.nav-label').textContent = 'CONTENTS / '+({plan:'项目计划',review:'结果复盘',daily:'日常推动',expense:'费用核账',admin:'数据管理'}[currentMode]||'项目工作台');
}
function setViewMode(mode) {
  currentMode = mode;
  DATA = ARCHIVE.months[currentMonth] || (typeof WBOperations!=='undefined' && WBOperations.isMode(mode) ? WBOperations.emptyData(currentMonth) : undefined);
  const url = new URL(location.href); url.search = ''; url.hash = ''; history.replaceState(null,'',url);
  DATA ? render(viewFromUrl(),true) : renderEmptyMonth(); window.scrollTo({top:0,behavior:'smooth'});
}
function syncPlanScope(view) {
  document.getElementById('region-filter').innerHTML = '<option value="">全司 · 全部大区</option>'+DATA.regions.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('');
  document.getElementById('region-filter').value = view.region || '';
  const stores = DATA.regions.flatMap(r=>(!view.region || r.name===view.region)?r.stores:[]);
  document.getElementById('store-filter').innerHTML = '<option value="">全部门店</option>'+stores.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  document.getElementById('store-filter').value = view.scope==='store' ? view.store||view.name : '';
  document.getElementById('scope-badge').textContent = (view.scope==='company'?'全司':view.scope==='region'?'大区':'门店')+'视角';
  document.getElementById('scope-live').textContent = '当前查看：'+view.name+' · '+view.role;
  document.querySelector('.scope-note').textContent = '全司方案共用；切换范围查看对应目标和落实重点。分享链接保留月份、计划/复盘和查看范围。';
}
function planSection(id,no,title,summary,body) {
  return `<section class="section plan-section" id="${id}" aria-labelledby="${id}-title"><div class="section-head"><span class="section-no">${no}</span><h2 id="${id}-title">${title}</h2></div><p class="section-summary">${summary}</p>${body}</section>`;
}
function planTable(headers,rows) {
  return `<div class="plan-table-wrap"><table class="plan-table"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<td data-label="${esc(headers[i])}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function scopeFocus(view) {
  if (view.scope==='company') return '项目负责人看全司目标、周度变化与重点支持；统一素材与口径，协同区域解决资源问题。';
  if (view.scope==='region') return `${view.name}：大区BP汇总各店目标与变化，和区域管理者共同确认重点支持门店；具体邀约与面见质量由销售中心负责。`;
  return `${view.name}：店总确认本店目标与节奏，经理落实到组和顾问；BP做好启动、礼物、周度反馈和真实案例支持。本店11月目标套数待与店总共识。`;
}
function renderNovemberPlan(view) {
  const p=NOVEMBER_PLAN;
  const targets = [
    {title:'目标池',value:'待核实',text:'按店核实责任盘内在售业主范围；本月新增与状态变化留痕。'},
    {title:'联系与邀约',value:'全盘启动',text:'建议目标：每位伙伴逐户发起个性化联系与邀请；异地/不便面见者线上维护。'},
    {title:'实际面见目标',value:'待共识',text:(view.scope==='company'?'汇总各店':view.name)+'核实后的目标套数；11/2前建议确认。'},
    {title:'去重面见覆盖',value:'待定标',text:'实际面见去重套数 ÷ 核实后的目标池套数；同时单列复见次数。'}
  ];
  const total = `<div class="plan-goal"><div class="plan-overline">项目定位</div><p>${esc(p.positioning)}</p><h3>总目标</h3><p class="plan-main-goal">${esc(p.goal)}</p><p>${esc(p.value)}</p><details><summary>解决什么问题 · 服务原则</summary><p>${esc(p.problem)}</p><ul>${p.principles.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details></div>`;
  const subgoals = `<div class="plan-goal-grid">${p.goals.map((g,i)=>`<article class="plan-goal-card"><span class="plan-overline">子目标 0${i+1}</span><h3>${esc(g.title)}</h3><p class="plan-result">${esc(g.result)}</p><p>${esc(g.why)}</p><details><summary>关键支撑 · 为什么 · 怎么做</summary>${g.supports.map(s=>`<div class="plan-support"><h4>${esc(s.name)}</h4><dl>${[['为什么',s.why],['具体包含',s.what],['如何落地',s.how],['谁来负责',s.owner],['交付标准',s.output]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`).join('')}</details></article>`).join('')}</div>`;
  const goalSection = planSection('plan-goals','01','本月目标与关键支撑','先对齐要达成什么，再看支撑目标的动作。',total+subgoals+renderBlock({type:'cards',items:targets})+`<div class="plan-note">${esc(scopeFocus(view))}</div><details class="block details"><summary>统计口径与目标制定</summary><p>面见须实际与产权人或核心决策人当面沟通。放物业、快递送礼和线上消息单独记录。按房源去重统计覆盖，同套多次见面另计次数；销售管理者判断专业服务质量。对比10月时统一范围、统计规则和截止时间；现有10月数据仅截至10月25日，不作为完整月基线。关系、委托和成交变化分别观察，避免把业务结果全部归因于本次活动。</p></details>`);
  const taskControls = `<div class="plan-task-controls"><span>按主责查看</span><div class="plan-role-buttons" role="group" aria-label="落地计划主责筛选">${['全部','项目组','HRBP','销售中心'].map((r,i)=>`<button class="btn ${i?'':'primary'}" data-task-role="${r}" aria-pressed="${i===0}">${r}</button>`).join('')}</div><span id="task-count" role="status">${p.tasks.length}项安排</span></div>`;
  const tasks = `<div class="plan-tasks">${p.tasks.map((t,i)=>`<article class="plan-task" data-owner-role="${t.role}"><div class="plan-task-date">${esc(t.date)}<span>${esc(t.status)}</span></div><div class="plan-task-main"><h3>${esc(t.title)}</h3><p>${esc(t.what)}</p><dl><div><dt>主责 / 协同</dt><dd>${esc(t.owner)}</dd></div><div><dt>场景</dt><dd>${esc(t.where)}</dd></div><div><dt>交付 / 验收</dt><dd>${esc(t.output)}</dd></div></dl></div><span class="plan-role">${t.role}</span></article>`).join('')}</div>`;
  const actions = planSection('plan-actions','02','全月落地计划','启动后按周循环推进；下列为建议排期，完成情况待执行后更新。',taskControls+tasks);
  const cards = `<h3 class="block-title">感恩贺卡 · 3款可用底稿</h3><div class="plan-card-gallery">${p.cards.map(c=>`<article><a href="${c.file}" target="_blank" rel="noopener"><img src="${c.file}" alt="${esc(c.title)}感恩贺卡" width="1536" height="1024" loading="lazy"></a><div><h4>${esc(c.title)}</h4><p>${esc(c.use)}</p><a class="btn" href="${c.file}" download>下载贺卡</a></div></article>`).join('')}</div><p class="plan-note">贺卡为视觉底稿；可直接保存使用，印刷前确认公司署名、尺寸和样张。没有真实服务基础时，使用问候版表达。</p>`;
  const texts = `<h3 class="block-title">可复制的行动物料</h3><div class="plan-templates">${p.materials.map(m=>`<details><summary>${esc(m.title)}</summary><p>${esc(m.use)}</p><pre>${esc(m.text)}</pre><button class="btn" data-copy-material="${m.id}">复制模板</button></details>`).join('')}</div>`;
  const gifts = `<details class="plan-gift-details"><summary>礼品候选与预算控制</summary><p>以下为选品方向与规划上限，尚非已核验报价或已确认采购款。单份总成本含包装、贺卡与分摊运费控制在30元以内；门店可先用卡片表达，面见按计划推进。</p>${planTable(['候选','心意与用途','预算上限','采购前确认'],p.gifts)}</details>`;
  const materials = planSection('plan-materials','03','支持物料','围绕感恩表达、真实面见和服务承接，减少重复准备。',cards+texts+gifts);
  const roles = planTable(['角色','负责什么','交付与边界'],[
    ['项目负责人','统一目标口径、方案、资源、传播与复盘','全司计划与周度重点；跨部门资源协同'],
    ['HRBP','全月运营支持：启动、物料、周报、重点门店协同、正反馈','复用系统记录，推动管理者承接；逐户业务问题交销售中心'],
    ['店总 / 经理','定目标、拆计划、带教邀约、把关面见质量、管理结果','单店目标、每周行动、专业服务与后续经营'],
    ['顾问','责任盘内个性化联系、面见、服务兑现、系统反馈','真实记录与持续服务；礼物与面见分别登记']
  ]);
  const decisions = planSection('plan-decisions','04','职责与待共识','先把目标、资源和责任明确，再按周把计划转成结果。',roles+`<h3 class="block-title">待共识事项</h3>`+planTable(['事项','需确认内容','责任角色','节点','状态'],p.decisions));
  return [goalSection,actions,materials,decisions].join('');
}
function renderOctoberPlan(view) {
  const goals = arr(view.sections).find(s=>s.id==='goals');
  const week = arr(view.sections).find(s=>s.id==='week');
  const intro = `<div class="plan-goal"><div class="plan-overline">10月计划归档</div><h3>持续维护责任盘在售业主，把月度目标落实为真实面见</h3><p>在常态维护中推进责任盘经营，通过管理者明确目标、伙伴持续面见、BP提供支持，让业主关系持续积累。当前归档依据10月25日数据及10月27—31日冲刺安排整理，月初原始方案待补充。</p></div>`;
  return planSection('plan-goals','01','10月目标与口径','对应当前查看范围；与结果复盘使用相同数据。',intro+`<div class="kpis">${arr(view.kpis).map(k=>`<article class="kpi ${tone(k.tone)}"><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${esc(k.value)}</div><div class="kpi-note">${esc(k.note)}</div></article>`).join('')}</div>`+`<p class="plan-note">${esc(goals?.summary||'目标版本与统计说明见结果复盘。')}</p><button class="btn" data-plan-mode="review">查看完整目标及达成结果</button>`)+
    planSection('plan-actions','02','10月已明确的落地安排',week?.summary||'按既有复盘留存的行动安排推进。',arr(week?.blocks).map(renderBlock).join(''))+
    planSection('plan-decisions','03','责任分工与资料说明','目标、动作与实际结果按月份留存。',planTable(['角色','本月落实重点'],[['销售管理者','确认正式目标和机会清单，带教邀约、面见与后续服务。'],['HRBP','跟进进展变化，协调支持，核实数据，提炼可复用案例。'],['项目负责人','聚焦重点门店，协同大区管理者，统一口径与月底复盘。']])+`<div class="plan-note">本页引用现有10月资料，目标版本差异和对账事项保留在结果复盘中。11月计划独立留存，未将10月结果复制为11月实际。</div>`);
}
function renderProject(view) {
  currentView=view; tableModels.clear(); tableSerial=0; syncPlanScope(view);
  const nov=currentMonth==='2026-11';
  document.title=(nov?NOVEMBER_PLAN.title:'10月在售业主面见计划')+'｜'+view.name;
  const nav=nov?['本月目标与关键支撑','全月落地计划','支持物料','职责与待共识']:['10月目标与口径','10月落地安排','职责与资料说明'];
  const ids=nov?['plan-goals','plan-actions','plan-materials','plan-decisions']:['plan-goals','plan-actions','plan-decisions'];
  document.getElementById('nav').innerHTML=nav.map((t,i)=>`<a href="#${ids[i]}"><span class="nav-no">0${i+1}</span><span>${t}</span></a>`).join('');
  document.getElementById('report').innerHTML=`<header class="hero plan-hero"><div class="eyebrow">OWNER MEETING · MONTHLY PLAN</div><div class="plan-title-line"><h1>${nov?'11月感恩月 · 在售业主面见计划':'10月在售业主面见计划'}</h1><span class="plan-badge">${nov?NOVEMBER_PLAN.status:'按已有资料归档'}</span></div><p class="plan-theme">${nov?NOVEMBER_PLAN.theme:'让每一次面见，成为持续服务的开始'}</p><div class="meta-row"><span>${esc(view.name)} · ${esc(view.role)}</span><span>${nov?NOVEMBER_PLAN.period:'数据截至2026/10/25 · 行动10/27—10/31'}</span></div></header>${nov?renderNovemberPlan(view):renderOctoberPlan(view)}<footer class="footer"><span>上海丽兹行 · 在售业主面见项目</span><span>方案初稿 · 2026/10/26 · 后续共创更新</span></footer>`;
  ['toolbar','scope-panel','report'].forEach(id=>document.getElementById(id).hidden=false);
  document.getElementById('status').hidden=true; document.getElementById('word-download').hidden=true;
  document.getElementById('copy-report').disabled=false; document.getElementById('print-report').disabled=false;
  highlight();
}
function renderPendingReview(view) {
  currentView=view; tableModels.clear(); syncPlanScope(view);
  document.title=monthLabel(currentMonth)+'面见结果复盘｜'+view.name;
  document.getElementById('nav').innerHTML='<a href="#review-pending" class="active"><span class="nav-no">01</span><span>结果待录入</span></a>';
  document.getElementById('report').innerHTML=`<header class="hero"><div class="eyebrow">OWNER MEETING · MONTHLY REVIEW</div><h1>${monthLabel(currentMonth)}面见结果复盘</h1><p class="subtitle">${esc(view.name)} · 感恩月</p></header><section id="review-pending" class="month-empty"><h2>11月实际结果尚未录入</h2><p>目标方案与全月计划已归档。后续将按相同范围补充实际面见、去重覆盖、关系变化和周度复盘。</p><button class="btn primary" data-plan-mode="plan">查看11月项目计划</button></section>`;
  ['toolbar','scope-panel','report'].forEach(id=>document.getElementById(id).hidden=false);
  document.getElementById('status').hidden=true; document.getElementById('word-download').hidden=true;
  document.getElementById('copy-report').disabled=true; document.getElementById('print-report').disabled=false;
}
function render(view,syncUrl=false) {
  if (!view) return;
  updateUrl(view);
  if (currentMode==='plan' && planAvailable()) renderProject(view);
  else if (DATA.planOnly) renderPendingReview(view);
  else {
    renderReview(view,false);
    document.querySelector('.scope-note').textContent='筛选后，目标、达成结果、质量、组织复盘和本周动作同步切换；分享链接保留当前范围。';
  }
  renderModeControls();
}
function exportProjectText() {
  if(currentMonth==='2026-10') return exportText({...currentView,sections:currentView.sections.filter(s=>['goals','week'].includes(s.id))});
  const p=NOVEMBER_PLAN;
  const parts=[p.title,p.theme,p.status,p.period,'查看范围：'+currentView.name,'', '项目定位',p.positioning,'总目标',p.goal,p.value,'解决的问题',p.problem,'服务原则',...p.principles,'',scopeFocus(currentView),'目标池与实际面见目标：待核实、待与销售中心共识。全盘启动个性化联系与邀请。'];
  p.goals.forEach((g,i)=>{parts.push('',`子目标${i+1}：${g.title}`,g.result,g.why);g.supports.forEach(s=>parts.push(s.name,'为什么：'+s.why,'具体包含：'+s.what,'如何落地：'+s.how,'负责人：'+s.owner,'交付标准：'+s.output));});
  parts.push('','全月落地计划');p.tasks.forEach(t=>parts.push(`${t.date}｜${t.title}｜${t.status}`,'负责人：'+t.owner,'场景：'+t.where,'行动：'+t.what,'交付：'+t.output));
  parts.push('','行动物料');p.materials.forEach(m=>parts.push(m.title,m.use,m.text,''));
  parts.push('礼品候选（规划上限，报价与SKU待核验）',...p.gifts.map(r=>r.join('｜')),'','待共识事项',...p.decisions.map(r=>r.join('｜')));
  return parts.join('\n');
}
function attachProjectEvents() {
  document.getElementById('view-modes').addEventListener('click',e=>{
    const b=e.target.closest('[data-view-mode]'); if(b) setViewMode(b.dataset.viewMode);
  });
  document.getElementById('report').addEventListener('click',e=>{
    const mode=e.target.closest('[data-plan-mode]'); if(mode) setViewMode(mode.dataset.planMode);
    const copy=e.target.closest('[data-copy-material]');
    if(copy){ const m=NOVEMBER_PLAN.materials.find(m=>m.id===copy.dataset.copyMaterial); if(m)copyText(m.text,'模板已复制，请补入真实信息后使用'); }
    const role=e.target.closest('[data-task-role]');
    if(role){
      let count=0;document.querySelectorAll('[data-owner-role]').forEach(t=>{t.hidden=role.dataset.taskRole!=='全部'&&t.dataset.ownerRole!==role.dataset.taskRole;if(!t.hidden)count++;});
      document.querySelectorAll('[data-task-role]').forEach(b=>{const active=b===role;b.classList.toggle('primary',active);b.setAttribute('aria-pressed',String(active));});
      document.getElementById('task-count').textContent=count+'项安排';
    }
  });
}

