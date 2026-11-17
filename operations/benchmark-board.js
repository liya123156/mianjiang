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
  const metrics=[['meetingCount','面见次数',150],['met','面见套数',150],['met_rate','面见率',160]],feedback=['feedbackText','面见后正反馈',1000];
  return key==='store'?[['rank','排名',90],['store','门店',340],...metrics,feedback]:key==='group'?[['rank','排名',80],['store','门店',220],['group','店组',260],['manager','经理',120],...metrics,feedback]:[['rank','排名',70],['store','门店',205],['group','店组',250],['manager','经理',115],['name','姓名',120],...metrics,feedback];
 }
 function html(board){
  if(!board?.sections)throw Error('全司标杆榜数据尚未就绪');
  return '<section class="company-benchmark" aria-label="'+esc(board.title)+'"><header class="cb-hero"><p class="cb-brand">LANDZ · OWNER MEETING</p><div class="cb-honor">✦ 荣誉时刻 · 榜样同行 ✦</div><h3>'+esc(board.title)+'</h3><p class="cb-date">'+esc(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf)+'</p><div class="cb-hero-line"></div><p class="cb-hero-note">'+esc(board.heroNote||heroNote)+'</p></header>'+board.sections.map(s=>{const cols=columnSpec(s.key);return '<section class="cb-tier"><h4><span>✦</span> '+esc(s.title)+' <span>✦</span></h4>'+(s.key==='group'?'<p class="cb-date">月度面见至少'+M.groupBenchmarkMinimum+'套，达标不足5组时按实际数量展示。</p>':'')+'<div class="cb-scroll"><table aria-label="'+esc(s.title)+'"><thead><tr>'+cols.map(([,label])=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(row=>'<tr class="'+(row.rank===1?'cb-first':'')+'">'+cols.map(([key])=>'<td class="cb-'+key+'">'+(key==='feedbackText'?row.feedbackLines.map((line,i)=>'<div class="cb-feedback-line '+(i<row.outcomes.length?'':'cb-pending')+'">'+(i<row.outcomes.length?'<span aria-hidden="true">✦</span> ':'')+esc(line)+'</div>').join(''):key==='met'?'<b>'+row.met+'<small>套</small></b>':key==='meetingCount'?row.meetingCount+'次':key==='met_rate'?rateText(row):key==='rank'?'<span class="cb-rank cb-rank-'+row.rank+'">'+row.rank+'</span>':esc(row[key])).replace(/^undefined$/,'')+'</td>').join('')+'</tr>').join('')+(s.rows.length?'':'<tr><td colspan="'+cols.length+'">'+(s.key==='group'?'当前暂无月度面见达到'+M.groupBenchmarkMinimum+'套的店组，待数据更新后呈现。':'当前暂无已登记面见的上榜对象，待数据更新后呈现。')+'</td></tr>')+'</tbody></table></div></section>';}).join('')+'<footer class="cb-footer">'+board.slogans.map(line=>'<p>'+esc(line)+'</p>').join('')+'</footer><div class="cb-notes">'+board.notes.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div></section>';
 }
 function wrap(ctx,value,width,size=25,bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;const out=[];for(const p of String(value??'').split(/\r?\n/)){let line='';for(const ch of p){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line='';}line+=ch;}out.push(line);}return out;}
 // The exported poster uses tiered three-column honor cards with one feedback type per line.
 const posterFeedbackLabels=Object.freeze({P:'价格／底价／交易条件',M:'业主心态／出售动机',R:'关系维护／客户反馈',E:'钥匙／委托／独家',V:'看房方式／配合条件',C:'房源情况核实',O:'其他需求'});
 function posterFeedback(row){
  const outcomes=Array.isArray(row.outcomes)?row.outcomes:[],pending=(row.feedbackLines||[]).slice(outcomes.length).flatMap(line=>String(line).split(/[；\n]/)).filter(Boolean);
  return {lines:outcomes.map(outcome=>(posterFeedbackLabels[outcome.code]||outcome.label)+'  '+outcome.count+'套'),pending};
 }
 function layout(board,ctx){
  const width=3600,pad=76,gap=30,contentWidth=width-pad*2,panelWidth=(contentWidth-gap*2)/3,panelInset=0,cardInset=34;
  const cardWidth=panelWidth,innerWidth=cardWidth-cardInset*2,bodyFontSize=44,headerHeight=330,panelHeaderHeight=88,cardGap=20;
  const sections=board.sections.map((section,index)=>{
   const cards=section.rows.map((row,cardIndex)=>{
    const main=section.key==='store'?row.store:section.key==='group'?row.group:row.name,mainSize=44,managerText=section.key==='advisor'?'经理 '+row.manager:'';
    ctx.font='30px '+font;const managerWidth=managerText?ctx.measureText(managerText).width+26:0;
    const mainLines=wrap(ctx,main,innerWidth-106-managerWidth,mainSize,true);
    const meta=section.key==='store'?[row.region]:section.key==='group'?[row.region+' · 经理 '+row.manager]:[row.group];
    const metaLines=meta.flatMap(line=>wrap(ctx,line,innerWidth-106,32));
    const identityHeight=mainLines.length*50+metaLines.length*34+2;
    const source=posterFeedback(row),feedbackLines=source.lines.flatMap(line=>wrap(ctx,line,innerWidth-30,bodyFontSize)),pendingLines=source.pending.flatMap(line=>wrap(ctx,line,innerWidth,34));
    const feedbackHeight=feedbackLines.length*52+pendingLines.length*42;
    const height=18+identityHeight+8+76+12+30+feedbackHeight+18;
    return {row,cardIndex,x:pad+(cardIndex%3)*(cardWidth+gap),mainLines,mainSize,managerText,metaLines,identityHeight,feedbackLines,pendingLines,feedbackHeight,height};
   });
   const gridRows=[];for(let i=0;i<cards.length;i+=3){const items=cards.slice(i,i+3);gridRows.push({cards:items,height:Math.max(...items.map(item=>item.height))});}
   const contentHeight=cards.length?gridRows.reduce((n,row)=>n+row.height,0)+Math.max(0,gridRows.length-1)*cardGap:150;
   return {...section,index,cards,gridRows,contentHeight,height:panelHeaderHeight+contentHeight+32};
  });
  const panelHeight=sections.reduce((n,section)=>n+section.height,0),sloganLines=board.slogans.flatMap(line=>wrap(ctx,line,contentWidth-80,44,true));
  const notes=['店组月度面见至少'+M.groupBenchmarkMinimum+'套；门店、店组按面见率优先，同率按套数、次数，三项相同保留并列。','个人按套数、次数排名；面见率为本人维护在售房源的覆盖率。正反馈按房源归类，待补充不等于无收获。'].flatMap(line=>wrap(ctx,line,contentWidth-80,30));
  const naturalHeight=headerHeight+panelHeight+38+sloganLines.length*64+20+notes.length*42+46;
  let scale=Math.min(1,30000/naturalHeight,Math.sqrt(64000000/(width*naturalHeight))),outputWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.ceil(naturalHeight*outputWidth/width);while(outputWidth>1&&(outputHeight>30000||outputWidth*outputHeight>64000000)){outputWidth--;outputHeight=Math.ceil(naturalHeight*outputWidth/width);}scale=outputWidth/width;if(scale<.35||outputHeight>30000)throw Error('全司标杆榜内容超出单张图片的可读尺寸，请核实异常反馈分类或重复对象');
  return {width,pad,gap,contentWidth,panelWidth,panelInset,cardInset,cardWidth,innerWidth,bodyFontSize,headerHeight,panelHeaderHeight,cardGap,panelHeight,sections,notes,sloganLines,naturalHeight,scale,outputWidth,outputHeight};
 }
 function star(ctx,x,y,r,color='#ebbf59'){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.44:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
 function rounded(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else{ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();}ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
 async function image(board){
  if(!board?.sections||!root.document?.createElement)throw Error('全司标杆榜图片组件尚未就绪');if(root.document.fonts?.ready)await root.document.fonts.ready;
  const measure=root.document.createElement('canvas').getContext('2d');if(!measure)throw Error('当前环境不支持生成标杆榜图片');const p=layout(board,measure),canvas=root.document.createElement('canvas');canvas.width=p.outputWidth;canvas.height=p.outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前环境不支持生成标杆榜图片');ctx.scale(p.scale,p.scale);
  function write(value,x,y,size=36,color='#65447a',bold=false,align='center'){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillText(String(value??''),x,y);}
  function rule(x,y,w,color='#e9ddf1'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
  ctx.fillStyle='#faf6ff';ctx.fillRect(0,0,p.width,p.naturalHeight);
  const background=ctx.createLinearGradient(0,0,p.width,p.headerHeight);background.addColorStop(0,'#f1e7fb');background.addColorStop(.5,'#fdfaff');background.addColorStop(1,'#eee1f8');ctx.fillStyle=background;ctx.fillRect(0,0,p.width,p.headerHeight-28);
  rounded(ctx,24,22,p.width-48,p.naturalHeight-44,34,'rgba(255,255,255,0)','#e5d5ef');
  rounded(ctx,p.width/2-258,28,516,50,25,'#f7e8bd');write('荣誉时刻 · 榜样同行',p.width/2,35,34,'#956c26',true);
  write(board.title,p.width/2,102,88,'#7533a4',true);
  write(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf,p.width/2,204,33,'#92709f');
  write(board.heroNote||heroNote,p.width/2,256,34,'#8c709c');
  star(ctx,p.width/2-1090,149,18,'#d8b76a');star(ctx,p.width/2+1090,149,18,'#d8b76a');
  function honorCard(section,item,rowY,rowHeight){
   const row=item.row,first=row.rank===1,rowX=item.x,innerX=rowX+p.cardInset,identityX=innerX+106,fill=first?'#fff9ea':'#ffffff',border=first?'#e3c576':'#e9dff0';
   rounded(ctx,rowX,rowY,p.cardWidth,rowHeight,24,fill,border);
   const rankX=innerX+36,badge=first?'#efce7e':row.rank===2?'#e7deef':row.rank===3?'#efd6bd':'#eee4f6';
   rounded(ctx,rankX-36,rowY+34,72,72,24,badge);write(String(row.rank).padStart(2,'0'),rankX,rowY+48,39,first?'#8b5f17':'#815895',true);
   let iy=rowY+18;
   if(item.managerText)write(item.managerText,innerX+p.innerWidth,iy+9,30,'#9375a1',false,'right');
   for(const line of item.mainLines){write(line,identityX,iy,item.mainSize,first?'#7d4b22':'#6f3b8b',true,'left');iy+=50;}
   iy+=2;for(const line of item.metaLines){write(line,identityX,iy,32,'#9375a1',false,'left');iy+=34;}
   const metricY=rowY+18+item.identityHeight+8,metricWidth=p.innerWidth/3;
   rounded(ctx,innerX,metricY-4,p.innerWidth,80,15,first?'#fcf1d4':'#faf6fd');
   const metrics=[{label:'面见次数',value:row.meetingCount+'次'},{label:'面见套数',value:row.met+'套'},{label:'面见率',value:rateText(row)}];
   for(let index=0;index<metrics.length;index++){const mx=innerX+metricWidth*(index+.5),metric=metrics[index];write(metric.label,mx,metricY+1,25,'#9a84a7');write(metric.value,mx,metricY+32,index===2?41:43,'#8b43b3',true);}
   let fy=metricY+76+12;rule(innerX,fy-9,p.innerWidth,first?'#ead7a8':'#eadff0');write('面见后正反馈',innerX,fy,25,'#a07b3d',true,'left');fy+=30;
   for(const line of item.feedbackLines){star(ctx,innerX+10,fy+22,7,'#c8a34e');write(line,innerX+30,fy,p.bodyFontSize,'#6f587d',false,'left');fy+=52;}
   for(const line of item.pendingLines){write(line,innerX,fy,34,'#9983a9',false,'left');fy+=42;}
  }
  let tierY=p.headerHeight;
  for(const section of p.sections){
   write(section.title,p.width/2,tierY+3,42,'#7b3c9e',true);star(ctx,p.width/2-268,tierY+29,11);star(ctx,p.width/2+268,tierY+29,11);
   const tierNote=section.key==='store'?'全盘面见率领先的门店':section.key==='group'?'月度面见至少'+M.groupBenchmarkMinimum+'套 · 面见率优先':'主动服务业主的榜样伙伴';
   write(tierNote,p.width/2,tierY+56,27,'#a28bad');
   let y=tierY+p.panelHeaderHeight;
   if(!section.cards.length){rounded(ctx,p.pad,y,p.contentWidth,150,24,'#fff','#e9dff0');const empty=section.key==='group'?'当前暂无月度面见达到'+M.groupBenchmarkMinimum+'套的店组，待数据更新后呈现。':'当前暂无已登记面见的上榜对象，待数据更新后呈现。';write(empty,p.width/2,y+55,34,'#a28baf');}
   for(const gridRow of section.gridRows){for(const item of gridRow.cards)honorCard(section,item,y,gridRow.height);y+=gridRow.height+p.cardGap;}
   tierY+=section.height;
  }
  let y=p.headerHeight+p.panelHeight+38;rule(p.pad+240,y-18,p.contentWidth-480,'#d9bc6e');
  for(const line of p.sloganLines){write(line,p.width/2,y,44,'#7d379f',true);y+=64;}y+=20;
  for(const line of p.notes){write(line,p.width/2,y,30,'#a38bb2');y+=42;}
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('全司标杆榜图片生成失败')),'image/png'));
 }
 root.WBCompanyBenchmark={build,html,image,rank,rateText,labels,slogans,title:boardTitle,heroNote,posterLayout:layout,posterFeedbackLabels,posterTemplate:'landscape-honor-grid-v2'};if(typeof module==='object')module.exports=root.WBCompanyBenchmark;
})(typeof window==='object'?window:globalThis);
