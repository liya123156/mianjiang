/* One company-wide benchmark board, built from source facts and exported as one PNG. */
(function(root){
 'use strict';
 const M=root.WBModel||(typeof require==='function'?require('./core.js'):null),Q=root.WBQuality||(typeof require==='function'?require('./quality.js'):null);
 const text=v=>String(v??'').trim(),id=v=>text(v).replace(/[\s\u00a0]/g,''),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const slogans=Object.freeze(['💥多面见 多沟通 多服务💥','🔥面见打造看得见信任 提供温度和专业服务🔥']);
 const boardTitle='全司在售业主面见标杆榜',heroNote='让每一次用心服务都被看见，感恩每一位伙伴的主动与付出。';
 const font='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Noto Color Emoji",sans-serif';
 const labels={P:'获取价格信息／底价／交易条件',M:'获取业主心态／出售动机',R:'开展关系维护／客户反馈沟通',E:'获取钥匙／委托／独家',V:'明确看房方式／配合条件',C:'核实房源情况',O:'发现其他需求'};
 const outcomeOrder=Object.keys(labels);
 function iso(value){const day=text(value).slice(0,10);if(!/^20\d{2}-\d{2}-\d{2}$/.test(day))return '';const d=new Date(day+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===day?day:'';}
 function managerFor(row){return root.WBManagerDirectory?.nameFor?.(row)||(!row.group||row.group==='/'?'—':'待补充');}
 function rank(rows,limit,level){
  const effectiveLevel=level||rows[0]?.level,byRate=['store','group'].includes(effectiveLevel),rateOrder=(a,b)=>b.met*a.stock-a.met*b.stock;
  const sorted=rows.filter(r=>r.met>0&&(effectiveLevel!=='group'||r.met>=M.groupBenchmarkMinimum)&&(!byRate||Number.isFinite(r.stock)&&r.stock>0)).sort((a,b)=>(byRate?rateOrder(a,b):0)||b.met-a.met||b.meetingCount-a.meetingCount||M.compareStore(a.store,b.store)||M.compareGroup(a.group,b.group)||M.compareText(a.name,b.name));
  return sorted.map((row,i)=>({...row,rank:i>0&&(!byRate||rateOrder(row,sorted[i-1])===0)&&row.met===sorted[i-1].met&&row.meetingCount===sorted[i-1].meetingCount?null:i+1})).map((row,i,all)=>{if(row.rank===null){let prior=i-1;while(prior>=0&&all[prior].rank===null)prior--;row.rank=all[prior].rank;}return row;}).filter(r=>r.rank<=limit);
 }
 function rateText(row){return Number(row.stock)>0?(Number(row.met)/Number(row.stock)*100).toFixed(2)+'%':'—';}
 function build({businessData:b,month}={}){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))throw Error('全司标杆榜月份不正确');
  if(!b||!Array.isArray(b.housing)||!Array.isArray(b.meetings))throw Error('全司底表尚未读取完成，请刷新共享数据');
  const source=b.imports?.[0],asOf=iso(source?.as_of),sourceVersion=text(source?.created_at);
  if(!asOf||asOf.slice(0,7)!==month||!sourceVersion)throw Error('全司底表日期或版本未就绪，请同步所选月份数据');
  const catalog=M.storeCatalog.filter(s=>s.ownerApplicable!==false),known=new Map(catalog.map(s=>[s.store,s]));
  const present=new Set(b.housing.map(h=>M.canonicalStore(h['门店']))),missing=catalog.filter(s=>!present.has(s.store));
  if(missing.length)throw Error('全司标杆榜需读取18家门店完整底表，当前缺少：'+missing.map(s=>s.store).join('、'));
  const homesById=new Map();
  for(const h of M.active(b.housing)){
   const store=M.canonicalStore(h['门店']),entry=known.get(store);if(!entry)continue;
   if(text(h['大区'])!==entry.region)throw Error('底表门店与大区不匹配，请核实后生成全司标杆榜');
   const houseId=id(h['房源编号']);if(!houseId)throw Error('底表存在房源编号缺失，请核实后生成全司标杆榜');
   if(homesById.has(houseId))continue;
   homesById.set(houseId,{...h,'房源编号':houseId,'门店':store,'店组':text(h['店组'])||'未分组','维护人姓名':text(h['维护人姓名'])||'未填写'});
  }
  const homes=[...homesById.values()],events=new Map();
  for(const sourceEvent of b.meetings){const houseId=id(sourceEvent['房源编号']),day=iso(sourceEvent['面见时间']);if(!homesById.has(houseId)||!day||day.slice(0,7)!==month||day>asOf)continue;const event={...sourceEvent,'房源编号':houseId},eventId=id(event['面见id'])||JSON.stringify([houseId,text(event['面见时间']),text(event['面见人姓名'])]);events.set(eventId,event);}
  const monthlyEvents=[...events.values()],records=Q.records(homes,monthlyEvents,b.items||[],month,asOf),feedbackById=new Map(records.map(r=>[id(r.houseId),r]));
  function aggregate(rows,level,region,store,group='',name=''){
   const metric=M.metrics(rows,monthlyEvents),feedbackRecords=metric.metIds.map(houseId=>feedbackById.get(id(houseId))).filter(Boolean),summary=Q.summary(feedbackRecords);
   const outcomes=outcomeOrder.filter(code=>Number(summary.counts[code])>0).map(code=>({code,label:labels[code],count:Number(summary.counts[code])})).sort((a,b)=>b.count-a.count||outcomeOrder.indexOf(a.code)-outcomeOrder.indexOf(b.code));
   const pending=[];if(summary.missing)pending.push('原文待补'+summary.missing+'套');if(summary.unclear)pending.push('收获待核实'+summary.unclear+'套');
   const feedbackLines=outcomes.map(x=>x.label+'：'+x.count+'套');if(pending.length)feedbackLines.push(pending.join('；'));if(!feedbackLines.length)feedbackLines.push('面见收获待补充核实');
   const row={level,region,store,group,name,stock:metric.stock,rate:metric.stock>0?metric.met/metric.stock:null,met_rate:metric.met_rate,met:metric.met,meetingCount:metric.met_count,met_count:metric.met_count,feedbackCount:summary.feedback,missingFeedbackCount:summary.missing,unclearFeedbackCount:summary.unclear,outcomes,feedbackLines,feedbackText:feedbackLines.join('\n')};
   row.manager=managerFor(row);return row;
  }
  const levels={store:[],group:[],advisor:[]};
  for(const entry of catalog){const storeHomes=homes.filter(h=>h['门店']===entry.store);levels.store.push(aggregate(storeHomes,'store',entry.region,entry.store));
   for(const group of M.unique(storeHomes.map(h=>h['店组'])).sort(M.compareGroup)){const groupHomes=storeHomes.filter(h=>h['店组']===group);levels.group.push(aggregate(groupHomes,'group',entry.region,entry.store,group));
    for(const name of M.unique(groupHomes.map(h=>h['维护人姓名'])).sort(M.compareText))levels.advisor.push(aggregate(groupHomes.filter(h=>h['维护人姓名']===name),'advisor',entry.region,entry.store,group,name));
   }
  }
  const unidentified=new Set(['','—','-','/','未填写','未分配','待补充','未分组']);
  const sections=[{key:'store',title:'全司门店 TOP3',limit:3},{key:'group',title:'全司店组 TOP5',limit:5},{key:'advisor',title:'全司个人 TOP5',limit:5}].map(s=>({...s,rows:rank(levels[s.key].filter(r=>s.key==='advisor'?!unidentified.has(r.name):s.key==='group'?!unidentified.has(r.group):true),s.limit,s.key)}));
  const company=M.metrics(homes,monthlyEvents),summary=Q.summary(records);
  return {title:boardTitle,heroNote,month,asOf,sourceVersion,sections,rows:sections.flatMap(s=>s.rows),summary:{stores:catalog.length,stock:company.stock,met:company.met,meetingCount:company.met_count,feedback:summary.feedback,missing:summary.missing,unclear:summary.unclear},slogans:[...slogans],notes:['门店、店组按月度全盘面见率排序，同率按面见套数、次数；三项相同保留并列。','店组入选须月度面见至少'+M.groupBenchmarkMinimum+'套；达标不足5组时按实际数量展示。','个人按月度面见套数、次数排序；面见率以本人维护的在售房源为分母，同名伙伴按门店、店组分别计算。','面见后正反馈按已识别的主要结果逐套归类；原文待补或收获待核实，不等同于面见无价值。']};
 }
 function columnSpec(key){
  const metrics=[['meetingCount','面见次数',150],['met','面见套数',150],['met_rate','面见率',190]],feedback=['feedbackText','面见后正反馈',1000];
  return key==='store'?[['rank','排名',90],['store','门店',340],...metrics,feedback]:key==='group'?[['rank','排名',80],['store','门店',220],['group','店组',260],['manager','经理',120],...metrics,feedback]:[['rank','排名',70],['store','门店',205],['group','店组',250],['manager','经理',115],['name','姓名',120],...metrics,feedback];
 }
 function html(board){
  if(!board?.sections)throw Error('全司标杆榜数据尚未就绪');
  return '<section class="company-benchmark" aria-label="'+esc(board.title)+'"><header class="cb-hero"><p class="cb-brand">LANDZ · OWNER MEETING</p><div class="cb-honor">✦ 荣誉时刻 · 榜样同行 ✦</div><h3>'+esc(board.title)+'</h3><p class="cb-date">'+esc(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf)+'</p><div class="cb-hero-line"></div><p class="cb-hero-note">'+esc(board.heroNote||heroNote)+'</p></header>'+board.sections.map(s=>{const cols=columnSpec(s.key);return '<section class="cb-tier"><h4><span>✦</span> '+esc(s.title)+' <span>✦</span></h4>'+(s.key==='group'?'<p class="cb-date">月度面见至少'+M.groupBenchmarkMinimum+'套，达标不足5组时按实际数量展示。</p>':'')+'<div class="cb-scroll"><table aria-label="'+esc(s.title)+'"><thead><tr>'+cols.map(([,label])=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(row=>'<tr class="'+(row.rank===1?'cb-first':'')+'">'+cols.map(([key])=>'<td class="cb-'+key+'">'+(key==='feedbackText'?row.feedbackLines.map((line,i)=>'<div class="cb-feedback-line '+(i<row.outcomes.length?'':'cb-pending')+'">'+(i<row.outcomes.length?'<span aria-hidden="true">✦</span> ':'')+esc(line)+'</div>').join(''):key==='met'?'<b>'+row.met+'<small>套</small></b>':key==='meetingCount'?row.meetingCount+'次':key==='met_rate'?rateText(row):key==='rank'?'<span class="cb-rank cb-rank-'+row.rank+'">'+row.rank+'</span>':esc(row[key])).replace(/^undefined$/,'')+'</td>').join('')+'</tr>').join('')+(s.rows.length?'':'<tr><td colspan="'+cols.length+'">'+(s.key==='group'?'当前暂无月度面见达到'+M.groupBenchmarkMinimum+'套的店组，待数据更新后呈现。':'当前暂无已登记面见的上榜对象，待数据更新后呈现。')+'</td></tr>')+'</tbody></table></div></section>';}).join('')+'<footer class="cb-footer">'+board.slogans.map(line=>'<p>'+esc(line)+'</p>').join('')+'</footer><div class="cb-notes">'+board.notes.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div></section>';
 }
 function wrap(ctx,value,width,size=25,bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;const out=[];for(const p of String(value??'').split(/\r?\n/)){let line='';for(const ch of p){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line='';}line+=ch;}out.push(line);}return out;}
 // Each exported benchmark occupies one full-width table row, matching the page.
 const posterFeedbackLabels=Object.freeze({...labels});
 function posterFeedback(row){
  const outcomes=Array.isArray(row.outcomes)?row.outcomes:[],pending=(row.feedbackLines||[]).slice(outcomes.length).flatMap(line=>String(line).split(/[；\n]/)).filter(Boolean);
  return {lines:outcomes.map(outcome=>(posterFeedbackLabels[outcome.code]||outcome.label)+'：'+outcome.count+'套'),pending};
 }
 function layout(board,ctx){
  const width=2800,pad=64,contentWidth=width-pad*2,bodyFontSize=34,headerHeight=356,columnHeaderHeight=68,rowPadding=26,sectionGap=32;
  const sections=board.sections.map((section,index)=>{
   const spec=columnSpec(section.key),total=spec.reduce((n,c)=>n+c[2],0);let x=pad;
   const columns=spec.map(([key,label,weight])=>{const column={key,label,x,width:contentWidth*weight/total};column.center=x+column.width/2;x+=column.width;return column;});
   const feedbackColumn=columns.find(c=>c.key==='feedbackText');
   const cards=section.rows.map((row,rowIndex)=>{
    const cells=columns.filter(c=>!['rank','feedbackText'].includes(c.key)).map(column=>{
     const metric=['meetingCount','met','met_rate'].includes(column.key),size=metric?40:column.key==='name'?36:column.key==='manager'?30:32,bold=metric||['store','group','name'].includes(column.key);
     const value=column.key==='meetingCount'?row.meetingCount+'次':column.key==='met'?row.met+'套':column.key==='met_rate'?rateText(row):row[column.key];
     return {key:column.key,value,lines:wrap(ctx,value,column.width-24,size,bold),size,bold,lineHeight:metric?54:42,column};
    });
    const source=posterFeedback(row),feedbackLines=source.lines.flatMap(line=>wrap(ctx,line,feedbackColumn.width-64,bodyFontSize)),pendingLines=source.pending.flatMap(line=>wrap(ctx,line,feedbackColumn.width-48,29));
    const feedbackHeight=feedbackLines.length*46+pendingLines.length*39,cellHeight=Math.max(0,...cells.map(c=>c.lines.length*c.lineHeight)),height=Math.max(136,cellHeight+rowPadding*2,feedbackHeight+rowPadding*2);
    return {row,rowIndex,x:pad,width:contentWidth,cells,cellLines:Object.fromEntries(cells.map(cell=>[cell.key,cell.lines])),feedbackLines,pendingLines,feedbackHeight,height};
   });
   const titleHeight=section.key==='group'?112:84,contentHeight=cards.length?cards.reduce((n,row)=>n+row.height,0):136;
   return {...section,index,columns,cards,titleHeight,contentHeight,height:titleHeight+columnHeaderHeight+contentHeight+sectionGap};
  });
  const panelHeight=sections.reduce((n,section)=>n+section.height,0),sloganLines=board.slogans.flatMap(line=>wrap(ctx,line,contentWidth-80,38,true));
  const notes=['店组月度面见至少'+M.groupBenchmarkMinimum+'套；门店、店组按面见率优先，同率按套数、次数，三项相同保留并列。','个人按套数、次数排名；面见率为本人维护在售房源的覆盖率。正反馈按房源归类，待补充不等于无收获。'].flatMap(line=>wrap(ctx,line,contentWidth-80,26));
  const naturalHeight=headerHeight+panelHeight+20+sloganLines.length*54+24+notes.length*36+40;
  let scale=Math.min(1,30000/naturalHeight,Math.sqrt(64000000/(width*naturalHeight))),outputWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.ceil(naturalHeight*outputWidth/width);while(outputWidth>1&&(outputHeight>30000||outputWidth*outputHeight>64000000)){outputWidth--;outputHeight=Math.ceil(naturalHeight*outputWidth/width);}scale=outputWidth/width;if(scale<.35||outputHeight>30000)throw Error('全司标杆榜内容超出单张图片的可读尺寸，请核实异常反馈分类或重复对象');
  return {width,pad,contentWidth,bodyFontSize,headerHeight,columnHeaderHeight,rowPadding,sectionGap,panelHeight,sections,notes,sloganLines,naturalHeight,scale,outputWidth,outputHeight};
 }
 function star(ctx,x,y,r,color='#ebbf59'){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.44:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
 function rounded(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else{ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();}ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
 async function image(board){
  if(!board?.sections||!root.document?.createElement)throw Error('全司标杆榜图片组件尚未就绪');if(root.document.fonts?.ready)await root.document.fonts.ready;
  const measure=root.document.createElement('canvas').getContext('2d');if(!measure)throw Error('当前环境不支持生成标杆榜图片');const p=layout(board,measure),canvas=root.document.createElement('canvas');canvas.width=p.outputWidth;canvas.height=p.outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前环境不支持生成标杆榜图片');ctx.scale(p.scale,p.scale);
  function write(value,x,y,size=34,color='#65447a',bold=false,align='center'){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillText(String(value??''),x,y);}
  function rule(x,y,w,color='#e9ddf1'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
  ctx.fillStyle='#faf6ff';ctx.fillRect(0,0,p.width,p.naturalHeight);
  const background=ctx.createLinearGradient(0,0,p.width,p.headerHeight);background.addColorStop(0,'#efe4fb');background.addColorStop(.5,'#fcf8ff');background.addColorStop(1,'#eee2f8');ctx.fillStyle=background;ctx.fillRect(0,0,p.width,p.headerHeight-22);
  rounded(ctx,22,18,p.width-44,p.naturalHeight-36,30,'rgba(255,255,255,0)','#e5d5ef');
  write('LANDZ · OWNER MEETING',p.width/2,36,22,'#a18ab1',true);
  rounded(ctx,p.width/2-235,80,470,50,25,'#f7e8bd');write('荣誉时刻 · 榜样同行',p.width/2,88,30,'#956c26',true);
  write(board.title,p.width/2,155,72,'#7533a4',true);
  write(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf,p.width/2,244,28,'#92709f');
  rule(p.width/2-90,292,180,'#d8b76a');write(board.heroNote||heroNote,p.width/2,310,28,'#8c709c');
  star(ctx,230,190,17,'#d8b76a');star(ctx,p.width-230,190,17,'#d8b76a');
  let tierY=p.headerHeight;
  for(const section of p.sections){
   rounded(ctx,p.pad,tierY,p.contentWidth,section.height-p.sectionGap,22,'#ffffff','#e7dbef');
   ctx.fillStyle='#f6effb';ctx.fillRect(p.pad+1,tierY+1,p.contentWidth-2,section.titleHeight-1);
   write(section.title,p.width/2,tierY+20,42,'#7b3c9e',true);star(ctx,p.width/2-260,tierY+45,10);star(ctx,p.width/2+260,tierY+45,10);
   if(section.key==='group')write('月度面见至少'+M.groupBenchmarkMinimum+'套 · 达标不足5组时按实际数量展示',p.width/2,tierY+74,25,'#a18bad');
   const columnY=tierY+section.titleHeight;ctx.fillStyle='#faf6fd';ctx.fillRect(p.pad+1,columnY,p.contentWidth-2,p.columnHeaderHeight);
   for(const column of section.columns)write(column.label,column.center,columnY+20,28,'#9d83ad',true);
   let y=columnY+p.columnHeaderHeight;
   if(!section.cards.length){const empty=section.key==='group'?'当前暂无月度面见达到'+M.groupBenchmarkMinimum+'套的店组，待数据更新后呈现。':'当前暂无已登记面见的上榜对象，待数据更新后呈现。';write(empty,p.width/2,y+48,32,'#a28baf');}
   for(const item of section.cards){
    const row=item.row,first=row.rank===1,fill=first?'#fff9ea':item.rowIndex%2?'#fcf9ff':'#ffffff';ctx.fillStyle=fill;ctx.fillRect(p.pad+1,y,p.contentWidth-2,item.height);rule(p.pad,y,p.contentWidth,'#e9dff0');
    const rankColumn=section.columns[0],badge=first?'#efce7e':row.rank===2?'#e7deef':row.rank===3?'#efd6bd':'#eee4f6';rounded(ctx,rankColumn.center-29,y+item.height/2-29,58,58,29,badge);write(row.rank,rankColumn.center,y+item.height/2-23,38,first?'#8b5f17':'#815895',true);
    for(const cell of item.cells){let cy=y+(item.height-cell.lines.length*cell.lineHeight)/2;const metric=['meetingCount','met','met_rate'].includes(cell.key),color=cell.key==='meetingCount'?'#a17b38':metric?'#8b43b3':cell.bold?'#75448f':'#7b6589';for(const line of cell.lines){write(line,cell.column.center,cy,cell.size,color,cell.bold);cy+=cell.lineHeight;}}
    const feedbackColumn=section.columns.find(c=>c.key==='feedbackText'),fx=feedbackColumn.x+28;let fy=y+(item.height-item.feedbackHeight)/2;
    for(const line of item.feedbackLines){star(ctx,fx+7,fy+18,6,'#c8a34e');write(line,fx+28,fy,p.bodyFontSize,'#715b7f',false,'left');fy+=46;}
    for(const line of item.pendingLines){write(line,fx,fy,29,'#a18bad',false,'left');fy+=39;}
    y+=item.height;
   }
   tierY+=section.height;
  }
  let y=p.headerHeight+p.panelHeight+20;rule(p.pad+180,y-12,p.contentWidth-360,'#d9bc6e');
  for(const line of p.sloganLines){write(line,p.width/2,y,38,'#7d379f',true);y+=54;}y+=24;
  for(const line of p.notes){write(line,p.width/2,y,26,'#a38bb2');y+=36;}
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('全司标杆榜图片生成失败')),'image/png'));
 }
 root.WBCompanyBenchmark={build,html,image,rank,rateText,labels,slogans,title:boardTitle,heroNote,posterLayout:layout,posterFeedbackLabels,posterTemplate:'full-width-honor-rows-v3'};if(typeof module==='object')module.exports=root.WBCompanyBenchmark;
})(typeof window==='object'?window:globalThis);
