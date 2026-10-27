/* Extractive organization: preserve source claims; never invent owners, dates or causes. */
(function(root){
 'use strict';
 const labels={progress:'现场进展',actions:'已做／计划动作',issues:'当前卡点',support:'需要支持',other:'其他现场信息'};
 function analyze(raw){
  const source=String(raw??'').trim(),parts=source.split(/(?:[。！？!?；;\n]+)/).map(x=>x.trim()).filter(Boolean);
  const groups=Object.fromEntries(Object.keys(labels).map(k=>[k,[]]));
  for(const text of [...new Set(parts)]){
   let kind='other';
   if(/需要.*(?:支持|协调|帮助|陪同|亲邀)|希望.*(?:支持|协调|帮助)|请.*(?:支持|协调|帮)|缺.*(?:礼物|物料|报告)/.test(text))kind='support';
   else if(/拒绝|约不到|没约|未约|没有|未能|尚未|不愿|不接|不回|不在沪|出差|卡点|困难|问题|不足|缺少|未完成|没完成|无法/.test(text))kind='issues';
   else if(/邀约|亲邀|陪同|准备|跟进|联系|核实|核对|确认|安排|计划|复盘|沟通|拜访|推动|碰房|带教|明天|今天|本周/.test(text))kind='actions';
   else if(/已见|面见|完成|新增|达成|已约|同意|愿意|答应|提升|突破|标杆/.test(text))kind='progress';
   groups[kind].push(text);
  }
  const text=Object.entries(labels).filter(([key])=>groups[key].length).map(([key,label])=>label+'：\n'+groups[key].map(t=>'• '+t).join('\n')).join('\n\n');
  const checks=[];
  if(groups.issues.length&&!groups.actions.length)checks.push('原文有卡点，尚未写清对应处理动作。');
  if(groups.actions.length&&!/(?:经理|店总|顾问|BP|维护人|负责人|大区总|负责|由.{1,8})/.test(source))checks.push('原文尚未明确动作负责人。');
  if(groups.actions.length&&!/(今天|明天|后天|本周|周[一二三四五六日天]|\d{1,2}[月日号点]|\d{1,2}[:：]\d{2}|截止)/.test(source))checks.push('原文尚未明确动作完成时间。');
  return {source,text,groups,checks,method:'extractive-rules-v1'};
 }
 root.WBScene={analyze};if(typeof module==='object')module.exports=root.WBScene;
})(typeof window==='object'?window:globalThis);
