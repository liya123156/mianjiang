'use strict';

/* Monthly plans are separate from actual review data. Unconfirmed numbers stay null. */
const NOVEMBER_PLAN = {
  version: '20261029-plan-v2',
  title: '11月感恩月 · 全量顾客连接行动',
  theme: '感恩相连·服务有光',
  status: '目标框架已确认 · 物料10/31前完成',
  period: '2026.11.01 — 11.30',
  positioning: '11月感恩月以感恩为主题，开展全量顾客连接行动。项目覆盖客户、业主以及保安、物业、管家等服务链接对象，并按照对象关系和服务阶段，设置不同的行动深度。',
  goal: '以感恩为主题，面向全量有效顾客开展感恩连接行动。',
  through: '通过对客户、业主以及保安、物业、管家等服务链接对象进行分类，完成客户和业主有效名单100%的线上感恩表达；以在售业主为★S级重点对象，推进线下面见；针对全盘非在售业主、已成交客户和未成交客户，结合服务阶段开展个性化信息、电子贺卡、线下卡、专业服务、面见和适度伴手礼；依托店总目标共识、伙伴具体执行和房客源系统记录，持续推进感恩连接行动。',
  problem: '解决感恩停留在口号和一次性表达、顾客分类不清、行动深度不一致、服务与业绩脱节等问题，让伙伴知道对谁表达、为什么表达，以及如何把感恩落到带看、需求确认、面见、成交后维护和物业协作等真实服务场景。',
  effect: '最终形成“全量覆盖、重点深入、服务带动业务”的感恩连接机制：线上表达覆盖100%；全盘在售业主面见率达到20%以上，TOP/重点房源面见率达到40%以上，具体单店目标由店总结合10月名单、历史达成和可触达资源确定；让顾客感受到丽兹行的专业、主动和温度，进一步加深对品牌和服务伙伴的理解、信任与持续连接。',
  culture: '感恩不是额外增加的一项任务，而是“感恩利他、顾客至上”在服务中的具体表达。伙伴在目标冲刺中看见顾客的托付，用主动连接和专业服务回应每一次信任，让感恩成为丽兹行持续建立信任、共同奔赴的文化行动。',
  value: '让顾客在一次次主动、专业、持续的服务中，更了解丽兹行、更熟悉服务伙伴，并逐步建立信任。业绩是服务带来的自然结果，感恩月仍然服务于11月的目标冲刺。',
  principles: ['线上表达覆盖客户和业主有效名单100%；物业、保安、管家等对象单独纳入行动并单独记录。', '在售业主为★S级重点对象；全盘在售业主面见率目标≥20%，TOP/重点房源面见率目标≥40%。', '礼物是表达心意的辅助，不替代感谢表达、专业服务和线下面见。', '面见、送礼和面见反馈依托现有房客源系统记录，减少重复填报。', '启动保留感恩氛围与仪式感；全司正反馈和小故事按事实征集，12月月会统一兑现激励。'],
  objects: [
    ['★ S级重点', '业主—在售业主', '线上感谢、个性化邀约、专业内容面见、伴手礼、面见后跟进', '全盘面见率≥20%；TOP/重点房源面见率≥40%'],
    ['A级', '业主—全盘非在售业主', '线上感谢、资产信息分享、关系维护，结合关系和需求选择性面见', '完成线上表达，持续记录服务推进'],
    ['B级', '客户—已成交客户、未成交客户', '微信、短信、彩信、电子贺卡和真实业务场景服务', '线上表达100%；带看客户重点推进需求确认'],
    ['C级单独记录', '保安、物业、管家', '结合真实工作连接表达感谢，选择实用的秋季非食品礼品', '单独记录，不计入顾客连接目标']
  ],
  results: [
    ['行动覆盖', '客户和业主有效名单线上感恩表达覆盖率100%'],
    ['深度连接', '在售业主面见率、TOP/重点房源面见率、带看客户的需求确认、顾客反馈与服务推进'],
    ['业务结果', '委托、成交、复购、转介绍、再次合作等自然结果，作为成果观察，不作为单一考核标准']
  ],
  goals: [
    {title:'形成“感恩即服务”的全员共识', result:'让伙伴知道为什么感恩、感谢谁，以及感恩如何进入服务。', why:'通过启动视频、11月3日月会和单店共识，把文化理解转化为全员可执行的服务共识。', supports:[
      {name:'全司启动：文化与行动相连', why:'让全员理解11月为什么是感恩月，以及为什么要把感恩落到顾客服务。', what:'11月3日月会播放启动视频，完成感恩氛围与仪式引导，现场发布“丽兹行·感恩连接行动包”二维码。', how:'视频完成“为什么是感恩月—为什么感恩顾客—如何进入服务—11月马上怎么做”的认知转化。', owner:'Liya作为项目负责人，带领HRBP统一支持；销售管理者现场承接', output:'启动视频、行动包入口、全员行动共识。'},
      {name:'单店共识：从认同到行动', why:'让每家店把总目标转化为本店的顾客对象、重点场景和行动安排。', what:'店总组织单店共识，经理承接到组和伙伴。', how:'完成顾客对象清单、重点连接场景、责任人和行动节奏；店总结合10月名单和历史达成确定目标。', owner:'店总推动；经理承接；HRBP提供讨论页和口径', output:'单店共识记录与首周行动安排。'}
    ]},
    {title:'完成全量感恩表达，推动重点对象深度连接', result:'线上完成全量表达，线下把重点对象的服务连接做深。', why:'不同对象采用不同的行动深度，保证全量覆盖和重点突破同时发生。', supports:[
      {name:'全量表达：每一个有效对象都被看见', why:'感恩首先要发生在具体对象身上，而不是停留在统一通知里。', what:'针对客户和业主有效名单，使用微信、短信、彩信、电子贺卡等渠道完成个性化表达。', how:'按客户、业主、物业保安管家分类，使用不同长度和场景话术；线上表达覆盖100%。', owner:'伙伴执行；经理跟进；HRBP提供话术和贺卡', output:'全量线上表达完成，行动对象分类清晰。'},
      {name:'重点连接：把心意变成服务和面见', why:'面见是看得见的信任，也是确认需求、提供专业服务的重要场景。', what:'在售业主重点推进线下面见；带看客户重点推进需求确认和下一步服务；非在售业主持续维护。', how:'全盘在售业主面见率目标≥20%，TOP/重点房源面见率目标≥40%；具体单店目标由店总结合10月名单、历史达成和可触达资源确定。', owner:'店总定标；经理组织；伙伴执行；HRBP支持', output:'面见、送礼和面见反馈录入现有房客源系统。'}
    ]},
    {title:'形成单店可执行、可记录、可复盘的行动机制', result:'每周有动作、有反馈、有服务价值被看见。', why:'让行动不靠临时推动，而是依托现有系统和管理节奏持续发生。', supports:[
      {name:'最小化记录：沿用现有系统', why:'减少重复填报，让伙伴把时间用在顾客连接和服务上。', what:'在售业主面见、是否送礼和面见反馈依托房客源系统记录；顾客送出量单独汇总。', how:'行动包提供记录口径和使用说明，不再设计复杂的重复登记表。', owner:'销售中心录入；经理核实；HRBP汇总口径', output:'系统记录与汇总结果一致。'},
      {name:'周度复盘：看行动覆盖，也看连接变化', why:'用真实反馈帮助伙伴看到服务带来的关系变化，同时保持目标冲刺节奏。', what:'按周看行动覆盖、深度连接和业务结果，沉淀可复用的服务表达。', how:'业务结果作为成果观察，不把成交或转化简单归因于感恩月，也不作为单一考核标准。', owner:'HRBP组织；销售管理者反馈；伙伴提供真实信息', output:'周度反馈、重点支持事项和月末复盘。'}
    ]}
  ],
  tasks: [
    {date:'10/30—10/31',title:'完成目标口径与行动物料',role:'HRBP',owner:'Liya牵头；HRBP协同销售管理者',where:'项目对齐与物料工作台',what:'完成总目标、三个子目标、对象分类、行动标准、线上线下贺卡、话术和礼物库。',output:'行动包内容定稿；礼品链接按平台核验后补齐',status:'确认节点'},
    {date:'11/3',title:'全司月会发布启动视频与行动包',role:'HRBP',owner:'项目负责人、月会团队、销售管理者',where:'全司月会',what:'播放感恩月先导视频，讲清为什么是感恩月、为什么感恩顾客、11月怎么行动，并发布行动包二维码。',output:'全员知道目标、对象、行动和入口',status:'启动节点'},
    {date:'11/3—11/6',title:'单店共识与单店目标拆解',role:'销售中心',owner:'店总推动；经理承接；伙伴参与',where:'单店会议 / 文化研讨',what:'形成顾客对象清单、重点连接场景、责任人和行动节奏；组织至少1场感恩文化研讨；店总结合10月名单、历史达成和可触达资源确定在售业主面见目标。',output:'单店目标和首周行动计划',status:'首周完成'},
    {date:'11/1—11/30持续',title:'全量线上表达与重点线下面见',role:'销售中心',owner:'伙伴执行；经理跟进；店总管理结果',where:'微信、短信、彩信、面见及业务服务场景',what:'客户和业主有效名单完成线上感恩表达；在售业主重点推进面见；带看客户重点推进需求确认和下一步服务。',output:'行动完成、面见记录、送礼记录和面见反馈',status:'全月持续'},
    {date:'11/10—11/30',title:'感恩正反馈与小故事征集',role:'HRBP',owner:'HRBP发起；销售管理者推荐；伙伴提供事实素材',where:'店会 / 区域沟通 / 行动包入口',what:'征集真实的顾客回应、服务细节和伙伴小故事，形成可核验的正反馈清单；为12月月会激励兑现准备素材。',output:'正反馈与小故事清单；12月月会奖励兑现名单',status:'全月收集'},
    {date:'每周',title:'周度推动与结果反馈',role:'HRBP',owner:'HRBP汇总；大区总、店总和经理反馈',where:'现有系统 / 店会 / 区域沟通',what:'复用系统记录，查看线上表达覆盖、面见进展、顾客反馈和重点支持事项，推动停滞门店和重点对象。',output:'周度进展与支持清单',status:'每周循环'},
    {date:'月末',title:'感恩月结果复盘',role:'HRBP',owner:'项目负责人、HRBP、销售管理者',where:'月度复盘',what:'汇总行动覆盖、深度连接和业务结果，沉淀服务反馈，承接后续顾客维护。',output:'11月结果复盘与后续服务清单',status:'计划收口'}
  ],
  materials: [
    {id:'invite',title:'感恩联系与自然邀约',use:'用于已有联系的在售业主；补入真实服务场景后发送。',text:'[称呼]您好，11月是丽兹行的感恩月，也想借这个机会向您问候。[补充一件与您有关的真实服务细节或您关心的事]。近期我为您整理了[具体且有用的内容]，希望找个您方便的时间当面向您汇报，也听听您接下来的安排。您近期什么时候方便？'},
    {id:'customer',title:'带看中的客户',use:'感谢表达要和当前服务进展连接起来，继续提供具体价值。',text:'[称呼]您好，感谢您这段时间对我的信任。结合我们前面沟通的[需求/关注点]，我又帮您梳理了[具体房源或判断]。接下来我会继续帮您把[下一步服务]推进清楚，您有新的想法也可以随时告诉我。'},
    {id:'first',title:'联系较少的业主',use:'不虚构长期托付，也不把感谢作为见面的交换条件。',text:'[称呼]您好，我是负责[楼栋/责任盘]的丽兹行[姓名]。11月是我们的感恩月，我也希望借这个机会，把日常能为业主提供的服务介绍得更清楚。我准备了[与业主有关的内容]，如您方便，希望有机会当面听听您的需求。时间以您方便为准。'},
    {id:'followup',title:'面见后的服务回信',use:'当天或约定时间发送，把感谢落实为可兑现的下一步。',text:'[称呼]，感谢今天留出时间交流。您提到的[具体关注点]我已记下。我会在[时间]前为您补充[约定内容]，通过[方式]向您反馈。后续有新的想法，也欢迎随时告诉我。'},
    {id:'weekly',title:'一页周度反馈模板',use:'HRBP复用系统数据和已有管理沟通，按同一口径更新。',text:'【范围与截止时间】\n【行动覆盖】客户和业主线上表达完成情况\n【深度连接】在售业主面见、TOP/重点房源面见、带看客户服务推进\n【重点支持】门店 / 事项 / 承接人 / 完成时间\n【顾客反馈】经核实的动作与回应\n【下周】销售管理者确认的行动 / HRBP支持事项'},
    {id:'story',title:'感恩正反馈与小故事征集',use:'记录真实服务细节和顾客回应，用于月度复盘与12月月会激励。',text:'【对象与门店】\n【发生场景】\n【伙伴做了什么】\n【顾客回应或关系变化】\n【可核验信息】\n【是否建议12月月会分享/奖励】'}
  ],
  cards:[
    {title:'上海秋意版',file:'assets/gratitude-autumn.webp',use:'日常问候、初次或较少联系时使用；手写称呼和一件具体的关心。'},
    {title:'感谢信任版',file:'assets/gratitude-trust.webp',use:'用于确有沟通与服务基础的顾客或业主；补充真实细节，避免套话。'},
    {title:'面见后回信版',file:'assets/gratitude-followup.webp',use:'面见后记录对方关心的事，写清后续服务与承诺时间。'}
  ],
  gifts:[
    ['上海城市文化非食品小物 + 贺卡','适合日常问候、线上表达后的轻量心意','30元以内','优先核验京东、天猫、盒马等平台的上海配送时效'],
    ['秋季实用生活小物 + 贺卡','适合在售业主或物业、管家等面见场景','30元以内','确认材质、包装和是否适合当面递送'],
    ['高质感桌面或居家用品 + 贺卡','适合关系基础较好、需要提升表达质感的对象','30—60元','不选茶礼，不选食品类，核验三日内配送'],
    ['秋季生活方式小物 + 贺卡','适合已成交客户和持续维护对象','30—60元','以实用、克制、有品牌感为标准'],
    ['高端家居或生活方式礼品 + 贺卡','适合重点关系和高价值面见场景','60元以上','需单独核验预算、采购链接和门店执行口径'],
    ['高质感定制感谢卡','适合不送礼或线上表达场景','5元以内','重点核验纸张、印刷和品牌署名']
  ],
  giftNote:'礼品按30元以内、30—60元、60元以上分档，优先推荐上海特色、秋季、非食品类礼品；不推荐茶礼。礼品是表达心意的辅助，不替代感谢表达、专业服务和线下面见。采购链接优先京东、天猫、盒马等平台，上海三日达需在下单前核验。',
  decisions:[
    ['单店目标','结合10月名单、历史达成和可触达资源，确定本店在售业主面见目标','店总 / 经理','11月第一周','待单店共识'],
    ['行动包发布','10月31日前完成内容；11月3日月会发布二维码','Liya / HRBP','10月31日、11月3日','已确定节点'],
    ['礼品采购','三档预算、非食品、非茶礼；采购链接和上海配送时效','门店 / 小组 / 个人','下单前','待链接核验'],
    ['周度反馈','沿用房客源系统记录面见、送礼和反馈；顾客送出量单独汇总','销售中心 / HRBP','每周','待执行'],
    ['正反馈与激励','征集真实服务故事，12月月会兑现分享与奖励','HRBP / 销售管理者','11月全月、12月月会','待执行']
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
      meta:{month:'2026-11',title:NOVEMBER_PLAN.title,cutoff:'实际结果尚未录入',week:'11月全月',updated_label:'目标框架已确认 · 2026/10/29'},
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
  const url = new URL(location.href); url.searchParams.set('tab',mode); url.hash = ''; history.replaceState(null,'',url);
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
    {title:'线上表达覆盖',value:'100%',text:'客户和业主有效名单完成线上感恩表达；物业、保安、管家等对象单独纳入行动。'},
    {title:'★S级在售业主',value:'≥20%',text:'全盘在售业主线下面见率目标；具体单店目标由店总定标。'},
    {title:'TOP/重点房源',value:'≥40%',text:'重点房源线下面见率目标；以10月名单和可触达资源校准。'},
    {title:'单店目标',value:'店总定标',text:'结合10月名单、历史达成和团队资源，形成单店目标与首周计划。'}
  ];
  const total = `<div class="plan-goal"><div class="plan-overline">项目定位</div><p>${esc(p.positioning)}</p><h3>总目标</h3><p class="plan-main-goal">${esc(p.goal)}</p><div class="goal-labeled"><h4>通过做什么：</h4><p>${esc(p.through)}</p><h4>解决什么问题：</h4><p>${esc(p.problem)}</p><h4>最终达成什么效果：</h4><p>${esc(p.effect)}</p><h4>文化升华：</h4><p>${esc(p.culture)}</p></div></div>`;
  const objectMatrix = '<h3 class="block-title">顾客对象与行动优先级</h3>'+planTable(['执行优先级','对象分类','主要行动','目标与记录'],p.objects);
  const resultMatrix = '<h3 class="block-title">三层结果结构</h3>'+planTable(['结果层级','观察内容'],p.results);
  const subgoals = `<div class="plan-goal-grid">${p.goals.map((g,i)=>`<article class="plan-goal-card"><span class="plan-overline">子目标 0${i+1}</span><h3>${esc(g.title)}</h3><p class="plan-result">${esc(g.result)}</p><p>${esc(g.why)}</p><details><summary>关键支撑 · 为什么 · 怎么做</summary>${g.supports.map(s=>`<div class="plan-support"><h4>${esc(s.name)}</h4><dl>${[['为什么',s.why],['具体包含',s.what],['如何落地',s.how],['谁来负责',s.owner],['交付标准',s.output]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`).join('')}</details></article>`).join('')}</div>`;
  const goalSection = planSection('plan-goals','01','本月目标与关键支撑','先对齐要达成什么，再看支撑目标的动作。',total+objectMatrix+resultMatrix+subgoals+renderBlock({type:'cards',items:targets})+`<div class="plan-note">${esc(scopeFocus(view))}</div><details class="block details"><summary>统计口径与目标制定</summary><p>线上表达覆盖客户和业主有效名单100%；物业、保安、管家等对象单独记录。面见须实际与产权人或核心决策人当面沟通；按房源去重统计覆盖，同套多次见面另计次数。单店目标由店总结合10月名单、历史达成和可触达资源确定。关系、委托和成交变化分别观察，避免把业务结果简单归因于感恩月。</p></details>`);
  const taskControls = `<div class="plan-task-controls"><span>按主责查看</span><div class="plan-role-buttons" role="group" aria-label="落地计划主责筛选">${['全部','HRBP','销售中心'].map((r,i)=>`<button class="btn ${i?'':'primary'}" data-task-role="${r}" aria-pressed="${i===0}">${r}</button>`).join('')}</div><span id="task-count" role="status">${p.tasks.length}项安排</span></div>`;
  const tasks = `<div class="plan-tasks">${p.tasks.map((t,i)=>`<article class="plan-task" data-owner-role="${t.role}"><div class="plan-task-date">${esc(t.date)}<span>${esc(t.status)}</span></div><div class="plan-task-main"><h3>${esc(t.title)}</h3><p>${esc(t.what)}</p><dl><div><dt>主责 / 协同</dt><dd>${esc(t.owner)}</dd></div><div><dt>场景</dt><dd>${esc(t.where)}</dd></div><div><dt>交付 / 验收</dt><dd>${esc(t.output)}</dd></div></dl></div><span class="plan-role">${t.role}</span></article>`).join('')}</div>`;
  const actions = planSection('plan-actions','02','全月落地计划','启动后按周循环推进；下列为建议排期，完成情况待执行后更新。',taskControls+tasks);
  const cards = `<h3 class="block-title">感恩贺卡 · 3款可用底稿</h3><div class="plan-card-gallery">${p.cards.map(c=>`<article><a href="${c.file}" target="_blank" rel="noopener"><img src="${c.file}" alt="${esc(c.title)}感恩贺卡" width="1536" height="1024" loading="lazy"></a><div><h4>${esc(c.title)}</h4><p>${esc(c.use)}</p><a class="btn" href="${c.file}" download>下载贺卡</a></div></article>`).join('')}</div><p class="plan-note">贺卡为视觉底稿；可直接保存使用，印刷前确认公司署名、尺寸和样张。没有真实服务基础时，使用问候版表达。</p>`;
  const texts = `<h3 class="block-title">可复制的行动物料</h3><div class="plan-templates">${p.materials.map(m=>`<details><summary>${esc(m.title)}</summary><p>${esc(m.use)}</p><pre>${esc(m.text)}</pre><button class="btn" data-copy-material="${m.id}">复制模板</button></details>`).join('')}</div>`;
  const gifts = `<details class="plan-gift-details"><summary>礼品候选与预算控制</summary><p>${esc(p.giftNote)}</p>${planTable(['候选','心意与用途','预算上限','采购前确认'],p.gifts)}</details>`;
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
  document.getElementById('report').innerHTML=`<header class="hero plan-hero"><div class="eyebrow">OWNER MEETING · MONTHLY PLAN</div><div class="plan-title-line"><h1>${nov?NOVEMBER_PLAN.title:'10月在售业主面见计划'}</h1><span class="plan-badge">${nov?NOVEMBER_PLAN.status:'按已有资料归档'}</span></div><p class="plan-theme">${nov?NOVEMBER_PLAN.theme:'让每一次面见，成为持续服务的开始'}</p><div class="meta-row"><span>${esc(view.name)} · ${esc(view.role)}</span><span>${nov?NOVEMBER_PLAN.period:'数据截至2026/10/25 · 行动10/27—10/31'}</span></div></header>${nov?renderNovemberPlan(view):renderOctoberPlan(view)}<footer class="footer"><span>${nov?'上海丽兹行 · 11月感恩月顾客连接行动':'上海丽兹行 · 在售业主面见项目'}</span><span>目标框架已确认 · 2026/10/29 · 物料10/31前完成</span></footer>`;
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
  const parts=[p.title,p.theme,p.status,p.period,'查看范围：'+currentView.name,'', '项目定位',p.positioning,'总目标',p.goal,'通过做什么',p.through,'解决什么问题',p.problem,'最终达成什么效果',p.effect,'文化升华',p.culture,'服务原则',...p.principles,'',scopeFocus(currentView),'线上表达覆盖100%；在售业主面见目标与单店目标按店总共识确认。'];
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

