/* A store review and its scoped management data are exported as one complete PNG. */
(function(root){
 'use strict';
 const M=root.WBModel||(typeof require==='function'?require('./core.js'):null);
 const text=value=>String(value??'').trim(),houseKey=value=>text(value).replace(/[\s\u00a0]/g,'');
 const pct=(n,d)=>d>0?(n/d*100).toFixed(2)+'%':'—';
 const sourceError=()=>Error('复盘与数据明细底表版本不一致，请先更新本期底表数据');
 const font='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
 function iso(value){const s=text(value).slice(0,10);if(!/^20\d{2}-\d{2}-\d{2}$/.test(s))return '';const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s?s:'';}
 function goal(value){return value!==null&&value!==undefined&&value!==''&&Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;}
 function build({snapshot:s,businessData:b,periodGoal=null}={}){
  if(!s||!b||!Array.isArray(b.housing)||!Array.isArray(b.meetings)||!b.imports?.[0])throw Error('共享底表尚未读取完成，请稍后生成完整复盘长图');
  const source=b.imports[0],asOf=iso(source.as_of),version=text(source.created_at);
  if(!asOf||!version||s.asOf!==asOf||s.sourceVersion!==version)throw sourceError();
  const known=M.storeCatalog.find(x=>x.store===M.canonicalStore(s.store)&&x.region===s.region&&x.ownerApplicable!==false);
  if(!known)throw Error('本店复盘范围不正确，不能生成其他门店的明细');
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(s.month)||asOf.slice(0,7)!==s.month||!['weekly','monthly'].includes(s.periodType)||!iso(s.periodStart)||!iso(s.periodEnd)||s.periodStart>s.periodEnd||s.periodStart.slice(0,7)!==s.month||s.periodEnd.slice(0,7)!==s.month)throw Error('复盘周期不正确，请重新选择');
  const scope={region:known.region,store:known.store},homes=M.active(M.inScope(b.housing,scope));
  const ids=new Set(homes.map(x=>houseKey(x['房源编号']))),unique=new Map();
  for(const event of b.meetings){const id=houseKey(event['房源编号']),date=iso(event['面见时间']);if(!ids.has(id)||!date||date.slice(0,7)!==s.month||date>asOf)continue;const eventId=houseKey(event['面见id'])||JSON.stringify([id,text(event['面见时间']),text(event['面见人姓名'])]);if(!unique.has(eventId))unique.set(eventId,event);}
  const monthlyEvents=[...unique.values()],periodEvents=monthlyEvents.filter(x=>{const day=iso(x['面见时间']);return day>=s.periodStart&&day<=s.periodEnd;}),periodIds=new Set(periodEvents.map(x=>houseKey(x['房源编号']))),datedIds=new Set(monthlyEvents.map(x=>houseKey(x['房源编号'])));
  const groupOf=h=>text(h['店组'])||'未分组',personOf=h=>text(h['维护人姓名'])||'未填写';
  function aggregate(rows,level,group,name){
   const rowIds=new Set(rows.map(x=>houseKey(x['房源编号']))),m=M.metrics(rows,monthlyEvents),met=s.periodType==='monthly'?m.met:rows.filter(x=>periodIds.has(houseKey(x['房源编号']))).length,count=s.periodType==='monthly'?m.met_count:periodEvents.filter(x=>rowIds.has(houseKey(x['房源编号']))).length;
   return {level,levelLabel:level==='store'?'本店':level==='group'?'店组':'个人',region:known.region,store:known.store,group,name,stock:m.stock,periodMet:met,periodMeetingCount:count,periodRate:pct(met,m.stock),monthlyMet:m.met,monthlyMeetingCount:m.met_count,monthlyRate:m.met_rate,storeTopStock:m.store_top_stock,storeTopMet:m.store_top_met,storeTop:m.store_top_met+'/'+m.store_top_stock,storeTopRate:m.store_top_rate,unitTopStock:m.unit_top_stock,unitTopMet:m.unit_top_met,unitTop:m.unit_top_met+'/'+m.unit_top_stock,unitTopRate:m.unit_top_rate,gift:m.gift,giftRate:m.gift_rate};
  }
  const rows=[aggregate(homes,'store','全店汇总','—')];
  for(const group of M.unique(homes.map(groupOf)).sort(M.compareGroup)){
   const grouped=homes.filter(h=>groupOf(h)===group);rows.push(aggregate(grouped,'group',group,'—'));
   for(const name of M.unique(grouped.map(personOf)).sort(M.compareText))rows.push(aggregate(grouped.filter(h=>personOf(h)===name),'advisor',group,name));
  }
  const total=rows[0],expectedMonthly={stock:'stock',met:'monthlyMet',meetingCount:'monthlyMeetingCount',storeTopStock:'storeTopStock',storeTopMet:'storeTopMet',unitTopStock:'unitTopStock',unitTopMet:'unitTopMet',gift:'gift'},expectedPeriod={met:'periodMet',meetingCount:'periodMeetingCount'};
  for(const [expected,actual] of Object.entries(expectedMonthly))if(typeof s.monthly?.[expected]==='number'&&s.monthly[expected]!==total[actual])throw sourceError();
  for(const [expected,actual] of Object.entries(expectedPeriod))if(typeof s.period?.[expected]==='number'&&s.period[expected]!==total[actual])throw sourceError();
  const pending=homes.filter(h=>M.flag(h['本月是否面见'])&&!datedIds.has(houseKey(h['房源编号']))).length,conflicting=homes.filter(h=>periodIds.has(houseKey(h['房源编号']))&&!M.flag(h['本月是否面见'])).length;
  const notes=['本期套数按房源去重，次数按有效面见明细去重；个人数据归属房源维护人，不是面见人。','在售和TOP分母取当前底表；门店TOP与户型TOP可能重叠，不直接相加。月累计次数中，已面见但无有效日期明细的房源按1次保留。'];
  if(pending)notes.push(`本月${pending}套已登记面见缺少有效日期明细，保留在月累计中，不自动分配到某一周。`);
  if(conflicting)notes.push(`${conflicting}套本期面见明细与月度面见标记不一致，请核实底表。`);
  if(asOf<s.periodEnd)notes.push(`数据仅截至${asOf}，本期尚未形成完整周期结果。`);
  if(asOf>s.periodEnd)notes.push(`月累计与在售分母截至${asOf}；本期面见按所选日期统计，不代表期末在售快照。`);
  if(!homes.length)notes.push('底表未提供本店在售房源，当前为0套汇总，请BP核实数据是否完整。');
  return {title:'六、面见数据明细',store:known.store,region:known.region,month:s.month,periodType:s.periodType,periodStart:s.periodStart,periodEnd:s.periodEnd,asOf,sourceVersion:version,periodGoal:goal(periodGoal),periodLabel:s.periodType==='monthly'?'本月':'本周',rows,notes};
 }
 const columns=[
  ['levelLabel','层级',76],['group','店组',230],['name','维护人',125],['stock','在售套数',90],
  ['periodMet','面见量',98],['periodMeetingCount','面见次数',98],['periodRate','面见率',110],
  ['monthlyMet','面见量',98],['monthlyMeetingCount','面见次数',98],['monthlyRate','面见率',110],
  ['storeTop','已见／在售',136],['storeTopRate','面见率',110],['unitTop','已见／在售',136],['unitTopRate','面见率',110],['gift','送礼登记',100],['giftRate','覆盖率',110]
 ].map(([key,label,width])=>({key,label,width}));
 function wrapped(ctx,value,width,size=20,bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;const out=[];for(const part of String(value??'').split(/\r?\n/)){let line='';for(const ch of part){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line='';}line+=ch;}out.push(line);}return out;}
 function tableLayout(evidence,ctx){
  const width=2000,pad=36,tableWidth=width-pad*2,total=columns.reduce((n,c)=>n+c.width,0),cols=columns.map(c=>({...c,width:c.width/total*tableWidth})),rowLayouts=evidence.rows.map(row=>{const cells=cols.map(c=>wrapped(ctx,row[c.key],c.width-12,19,row.level!=='advisor'));return {row,cells,height:Math.max(48,...cells.map(x=>x.length*25+14))};});
  const notes=evidence.notes.flatMap(x=>wrapped(ctx,x,tableWidth-10,18)),header=248,headHeight=112,height=header+headHeight+rowLayouts.reduce((n,r)=>n+r.height,0)+34+notes.length*27+36;
  return {width,pad,tableWidth,columns:cols,rows:rowLayouts,notes,header,headHeight,height};
 }
 function drawTable(ctx,evidence,layout){
  const {width,pad,header,headHeight,columns:cols}=layout;
  ctx.fillStyle='#f8f4fc';ctx.fillRect(0,0,width,layout.height);
  function write(value,x,y,size=20,color='#4e4159',bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign='left';ctx.fillText(String(value),x,y);}
  write(evidence.title+'｜单店 · 店组 · 个人',pad,26,32,'#71408b',true);write(evidence.store+' · '+evidence.region,pad,76,23,'#71408b',true);
  write(`${evidence.periodLabel}：${evidence.periodStart}—${evidence.periodEnd}　｜　月累计截至${evidence.asOf}`,pad,118,21);
  const total=evidence.rows[0];write(`${evidence.periodLabel}目标 ${evidence.periodGoal===null?'待确认':evidence.periodGoal+'套'}　｜　本期面见 ${total.periodMet}套 / ${total.periodMeetingCount}次　｜　月累计面见 ${total.monthlyMet}套`,pad,158,23,'#71408b',true);
  write('下表完整保留本店、各店组及每位维护人的数据；各组、个人未另行分配目标。',pad,202,18,'#8d7798');
  const x=[pad];for(const col of cols)x.push(x.at(-1)+col.width);
  function cell(lines,left,top,w,h,fill,bold=false,size=19){ctx.fillStyle=fill;ctx.fillRect(left,top,w,h);ctx.strokeStyle='#ded3e5';ctx.lineWidth=.8;ctx.strokeRect(left,top,w,h);ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle='#4e4159';ctx.textAlign='center';ctx.textBaseline='middle';const lineHeight=size*1.3;lines.forEach((line,i)=>ctx.fillText(line,left+w/2,top+h/2+(i-(lines.length-1)/2)*lineHeight));}
  for(let i=0;i<4;i++)cell(wrapped(ctx,cols[i].label,cols[i].width-12,20,true),x[i],header,cols[i].width,headHeight,'#eae1f0',true,20);
  const groups=[{start:4,end:7,label:evidence.periodLabel+'（所选周期）',fill:'#ece1fa'},{start:7,end:10,label:'月累计面见',fill:'#dce8f8'},{start:10,end:12,label:'门店TOP（月累计）',fill:'#dcefe5'},{start:12,end:14,label:'户型TOP（月累计）',fill:'#edf3dc'},{start:14,end:16,label:'月度伴手礼',fill:'#f6e5ed'}];
  for(const g of groups){const w=x[g.end]-x[g.start];cell(wrapped(ctx,g.label,w-12,20,true),x[g.start],header,w,50,g.fill,true,20);for(let i=g.start;i<g.end;i++)cell(wrapped(ctx,cols[i].label,cols[i].width-12,19,true),x[i],header+50,cols[i].width,headHeight-50,g.fill,true,19);}
  let y=header+headHeight;for(const item of layout.rows){const fill=item.row.level==='store'?'#eee4f6':item.row.level==='group'?'#eef5e8':'#ffffff';item.cells.forEach((lines,i)=>cell(lines,x[i],y,cols[i].width,item.height,fill,item.row.level!=='advisor'));y+=item.height;}
  y+=24;for(const line of layout.notes){write(line,pad,y,18,'#8d7798');y+=27;}
 }
 async function decode(blob){
  if(typeof root.createImageBitmap==='function')return root.createImageBitmap(blob);
  if(typeof root.Image!=='function'||!root.URL?.createObjectURL)throw Error('当前浏览器无法合并复盘长图');
  const url=root.URL.createObjectURL(blob);try{return await new Promise((resolve,reject)=>{const img=new root.Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('复盘图像读取失败'));img.src=url;});}finally{root.URL.revokeObjectURL(url);}
 }
 function composeLayout(parts,{maxDimension=30000,maxPixels=64000000}={}){
  if(!parts.length||parts.some(p=>!(p.width>0&&p.height>0)))throw Error('复盘图片尺寸不正确');
  const width=Math.max(...parts.map(p=>p.width)),sizes=parts.map(p=>({width,height:p.height*width/p.width})),naturalHeight=sizes.reduce((n,p)=>n+p.height,0);
  const limit=Math.min(1,maxDimension/width,maxDimension/naturalHeight,Math.sqrt(maxPixels/(width*naturalHeight)));
  let outputWidth=Math.max(1,Math.floor(width*limit)),outputHeight=Math.ceil(naturalHeight*outputWidth/width);
  while(outputWidth>1&&(outputHeight>maxDimension||outputWidth*outputHeight>maxPixels)){outputWidth--;outputHeight=Math.ceil(naturalHeight*outputWidth/width);}
  if(outputHeight>maxDimension||outputWidth*outputHeight>maxPixels)throw Error('内容超出单张长图支持尺寸，请精简过长的填写内容后重试');
  const scale=outputWidth/width;
  return {width:outputWidth,height:Math.max(1,outputHeight),scale,parts:sizes.map(p=>({width:p.width*scale,height:p.height*scale}))};
 }
 async function image({report,...input}={}){
  const evidence=build(input),R=root.WBStoreReviewModel;if(!R?.images||!root.document?.createElement)throw Error('复盘长图组件尚未就绪，请刷新后重试');
  if(root.document.fonts?.ready)await root.document.fonts.ready;
  const blobs=await R.images(report),parts=[];if(!Array.isArray(blobs)||!blobs.length)throw Error('复盘正文图片尚未生成');
  try{
   for(const blob of blobs)parts.push(await decode(blob));
   const measure=root.document.createElement('canvas'),ctx=measure.getContext('2d');if(!ctx)throw Error('当前浏览器无法生成数据明细');const table=tableLayout(evidence,ctx),segments=[...parts,{width:table.width,height:table.height,table:true}];
   const layout=composeLayout(segments),canvas=root.document.createElement('canvas');canvas.width=layout.width;canvas.height=layout.height;const output=canvas.getContext('2d');if(!output)throw Error('当前浏览器无法合并复盘长图');output.fillStyle='#f8f4fc';output.fillRect(0,0,canvas.width,canvas.height);let y=0;
   segments.forEach((part,i)=>{const size=layout.parts[i];if(part.table){output.save();output.translate(0,y);output.scale(size.width/table.width,size.height/table.height);drawTable(output,evidence,table);output.restore();}else output.drawImage(part,0,y,size.width,size.height);y+=size.height;});
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('完整复盘长图生成失败，请减少单次填写内容后重试')),'image/png'));
  }finally{for(const part of parts)if(typeof part.close==='function')part.close();}
 }
 root.WBStoreReviewEvidence={build,image,composeLayout};
 if(typeof module==='object')module.exports=root.WBStoreReviewEvidence;
})(typeof window==='object'?window:globalThis);
