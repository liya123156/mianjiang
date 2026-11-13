/* Portable monthly store packages for the local WeChat sender. */
(function (root) {
  'use strict';

  const encoder = new TextEncoder();
  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    return crc >>> 0;
  });

  function checksum(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function zip(files) {
    const parts = [], directory = [], names = new Set();
    let offset = 0, directorySize = 0;
    if (files.length > 65535) throw Error('导出文件数量过多，请缩小范围');
    for (const file of files) {
      if (!file.name || /(^\/|\\|(^|\/)\.\.(\/|$))/.test(file.name) || names.has(file.name)) {
        throw Error('发送包文件名无效或重复');
      }
      names.add(file.name);
      const name = encoder.encode(file.name);
      const bytes = typeof file.data === 'string' ? encoder.encode(file.data)
        : file.data instanceof Uint8Array ? file.data : new Uint8Array(await file.data.arrayBuffer());
      if (name.length > 65535 || offset + bytes.length + name.length + 30 >= 0xffffffff) {
        throw Error('发送包过大，请缩小导出范围');
      }
      const crc = checksum(bytes);
      const local = new Uint8Array(30 + name.length), localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, bytes.length, true);
      localView.setUint32(22, bytes.length, true);
      localView.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, bytes);

      const central = new Uint8Array(46 + name.length), centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(14, 33, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, bytes.length, true);
      centralView.setUint32(24, bytes.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, offset, true);
      central.set(name, 46);
      directory.push(central);
      directorySize += central.length;
      offset += local.length + bytes.length;
    }
    const end = new Uint8Array(22), endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, directorySize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }

  const pilotKey = 'wb.wechat-pilot.v1';
  function validatePilotConfig(value) {
    const config = typeof value === 'string' ? JSON.parse(value.replace(/^\ufeff/, '')) : value;
    if (config?.version !== 1 || !Array.isArray(config.stores) || config.stores.length !== 2) throw Error('试行配置须包含两家门店');
    const stores = new Set(), groups = new Set();
    return { version: 1, stores: config.stores.map(row => {
      const known = root.WBModel.storeCatalog.find(store => store.store === row.store && store.ownerApplicable !== false);
      if (!known || stores.has(row.store)) throw Error('试行门店无效或重复');
      if (typeof row.groupName !== 'string' || !row.groupName.trim() || row.groupName !== row.groupName.trim() || row.groupName.length > 200 || /[\u0000-\u001f\u007f]/.test(row.groupName) || groups.has(row.groupName)) throw Error('请使用两个不同的微信群完整名称，保留表情和标点');
      stores.add(row.store);groups.add(row.groupName);
      return { region: known.region, store: known.store, groupName: row.groupName };
    }) };
  }
  function loadPilotConfig() {
    try { const text = root.localStorage.getItem(pilotKey); return text ? validatePilotConfig(text) : null; }
    catch { return null; }
  }
  function savePilotConfig(value) {
    const config = validatePilotConfig(value);
    root.localStorage.setItem(pilotKey, JSON.stringify(config));
    return config;
  }
  function validateProjectConfig(value) {
    const catalog = root.WBModel.storeCatalog.filter(store => store.ownerApplicable !== false);
    if (value?.version !== 2 || value.recordType !== 'wechat-send-config' || !Array.isArray(value.stores) || value.stores.length !== catalog.length) throw Error('项目群配置须包含全部在售业主门店');
    const seenStores = new Set(), seenGroups = new Set();
    const stores = value.stores.map(row => {
      const known = catalog.find(store => store.store === row?.store), name = row?.groupName;
      if (!known || seenStores.has(known.store)) throw Error('项目群配置的门店无效或重复');
      if (typeof name !== 'string' || name !== name.trim() || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name) || name && seenGroups.has(name)) throw Error('经理群完整名称无效或重复');
      seenStores.add(known.store);if (name) seenGroups.add(name);
      return { region: known.region, store: known.store, groupName: name };
    });
    const pilotStores = value.pilotStores;
    if (!Array.isArray(pilotStores) || !pilotStores.length || new Set(pilotStores).size !== pilotStores.length || pilotStores.some(store => !stores.some(row => row.store === store && row.groupName))) throw Error('试行名单须对应已配置完整群名的门店');
    return { version: 2, recordType: 'wechat-send-config', mode: value.mode === 'all' ? 'all' : 'pilot', pilotStores: [...pilotStores], stores };
  }
  function groupTemplate(stores) {
    const rows = [['大区', '门店', '微信群完整名称'], ...stores.map(store => [store.region, store.store, store.groupName || ''])];
    return '\ufeff' + rows.map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }

  async function summaryImage({ store, month, asOf, summary, labels }) {
    const canvas = document.createElement('canvas');
    canvas.width = 1500;
    canvas.height = 1050;
    const context = canvas.getContext('2d');
    if (!context) throw Error('面见质量图片生成失败');
    const font = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    const draw = (value, x, y, size, color = '#4c365e', bold = false) => {
      context.font = `${bold ? '600 ' : ''}${size}px ${font}`;
      context.fillStyle = color;
      context.textBaseline = 'middle';
      context.fillText(String(value), x, y);
    };
    context.fillStyle = '#fbf7ff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#eadcf7';
    context.fillRect(0, 0, canvas.width, 170);
    draw('面见质量分析 · 月度累计', 54, 61, 39, '#56316e', true);
    draw(`${store} · ${month} · 数据截至 ${asOf}`, 54, 122, 25);
    const percentage = value => summary.total ? (Number(value || 0) / summary.total * 100).toFixed(2) + '%' : '—';
    draw(`已面见 ${summary.total}套     有反馈 ${summary.feedback}套     反馈覆盖率 ${percentage(summary.feedback)}`, 54, 222, 29, '#684179', true);
    draw(`反馈原文待补 ${summary.missing}套`, 54, 270, 23, '#85718f');
    const left = 54, top = 320, widths = [930, 230, 232], rowHeight = 68;
    const rows = [['主要结果', '房源套数', '占已面见'], ...Object.entries(labels).map(([key, label]) => [label, summary.counts?.[key] || 0, percentage(summary.counts?.[key])])];
    rows.forEach((row, rowIndex) => {
      let x = left;
      row.forEach((value, column) => {
        const y = top + rowIndex * rowHeight;
        context.fillStyle = rowIndex === 0 ? '#eadcf7' : rowIndex % 2 ? '#ffffff' : '#f6effb';
        context.fillRect(x, y, widths[column], rowHeight);
        context.strokeStyle = '#dfd0e9';
        context.strokeRect(x, y, widths[column], rowHeight);
        draw(value, x + 18, y + rowHeight / 2, column === 0 ? 25 : 27, '#4c365e', rowIndex === 0);
        x += widths[column];
      });
    });
    draw('按房源去重，每套归入一个主要结果，沿用当前工作台的分类口径。', 54, 1000, 21, '#85718f');
    draw(`已核对 ${summary.reviewed}套；其余分类待核对，不等同于高质量率。`, 54, 1031, 18, '#85718f');
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('面见质量图片生成失败')), 'image/png'));
  }

  async function emptyMeetingImage({ store, month, asOf }) {
    const canvas = document.createElement('canvas');
    canvas.width = 1500;
    canvas.height = 430;
    const context = canvas.getContext('2d');
    if (!context) throw Error('面见明细图片生成失败');
    context.fillStyle = '#fbf7ff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#56316e';
    context.font = '600 36px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    context.fillText('本月面见房源明细', 54, 85);
    context.font = '25px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
    context.fillText(`${store} · ${month} · 数据截至 ${asOf}`, 54, 150);
    context.fillText('当前范围本月暂无已登记面见的在售房源。', 54, 270);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('面见明细图片生成失败')), 'image/png'));
  }

  async function emptyFeedbackImage({store,month,asOf}) {
    const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=430;
    const context=canvas.getContext('2d');if(!context)throw Error('真实反馈图片生成失败');
    context.fillStyle='#f8f4ff';context.fillRect(0,0,canvas.width,canvas.height);
    context.fillStyle='#7b32b4';context.fillRect(0,0,canvas.width,190);
    context.fillStyle='#fff';context.font='600 42px "Microsoft YaHei","PingFang SC",sans-serif';context.fillText('业主面见 · 真实反馈',56,85);
    context.font='23px "Microsoft YaHei","PingFang SC",sans-serif';context.fillText(`${month} | ${store} | 数据截至 ${asOf}`,56,140);
    context.fillStyle='#514363';context.font='25px "Microsoft YaHei","PingFang SC",sans-serif';context.fillText('本店本月暂无已登记面见的在售房源，暂无真实反馈。',56,275);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('真实反馈图片生成失败')),'image/png'));
  }

  const moduleLabels={progress:'面见及礼物进展',details:'未面见TOP房明细',quality:'业主面见真实反馈'};
  root.WBSendPackage = { moduleLabels, emptyFeedbackImage, zip, groupTemplate, summaryImage, emptyMeetingImage, validatePilotConfig, loadPilotConfig, savePilotConfig, validateProjectConfig };
})(typeof window === 'object' ? window : globalThis);
