/* One company-wide benchmark board, built from source facts and exported as one PNG. */
(function(root){
 'use strict';
 const M=root.WBModel||(typeof require==='function'?require('./core.js'):null),Q=root.WBQuality||(typeof require==='function'?require('./quality.js'):null);
 const text=v=>String(v??'').trim(),id=v=>text(v).replace(/[\s\u00a0]/g,''),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const slogans=Object.freeze(['💥多面见 多沟通 多服务💥','🔥面见打造看得见信任 提供温度和专业服务🔥']);
 const font='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Noto Color Emoji",sans-serif';
 const labels={P:'获取价格信息／底价／交易条件',M:'获取业主心态／出售动机',R:'开展关系维护／客户反馈沟通',E:'获取钥匙／委托／独家',V:'明确看房方式／配合条件',C:'核实房源情况',O:'发现其他需求'};
 const outcomeOrder=Object.keys(labels);
 function iso(value){const day=text(value).slice(0,10);if(!/^20\d{2}-\d{2}-\d{2}$/.test(day))return '';const d=new Date(day+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===day?day:'';}
 function managerFor(row){return root.WBManagerDirectory?.nameFor?.(row)||(!row.group||row.group==='/'?'—':'待补充');}
 function rank(rows,limit){
  const sorted=rows.filter(r=>r.met>0).sort((a,b)=>b.met-a.met||b.meetingCount-a.meetingCount||M.compareStore(a.store,b.store)||M.compareGroup(a.group,b.group)||M.compareText(a.name,b.name));
  return sorted.map((row,i)=>({...row,rank:i>0&&row.met===sorted[i-1].met&&row.meetingCount===sorted[i-1].meetingCount?null:i+1})).map((row,i,all)=>{if(row.rank===null){let prior=i-1;while(prior>=0&&all[prior].rank===null)prior--;row.rank=all[prior].rank;}return row;}).filter(r=>r.rank<=limit);
 }
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
   const row={level,region,store,group,name,met:metric.met,meetingCount:metric.met_count,met_count:metric.met_count,feedbackCount:summary.feedback,missingFeedbackCount:summary.missing,unclearFeedbackCount:summary.unclear,outcomes,feedbackLines,feedbackText:feedbackLines.join('\n')};
   row.manager=managerFor(row);return row;
  }
  const levels={store:[],group:[],advisor:[]};
  for(const entry of catalog){const storeHomes=homes.filter(h=>h['门店']===entry.store);levels.store.push(aggregate(storeHomes,'store',entry.region,entry.store));
   for(const group of M.unique(storeHomes.map(h=>h['店组'])).sort(M.compareGroup)){const groupHomes=storeHomes.filter(h=>h['店组']===group);levels.group.push(aggregate(groupHomes,'group',entry.region,entry.store,group));
    for(const name of M.unique(groupHomes.map(h=>h['维护人姓名'])).sort(M.compareText))levels.advisor.push(aggregate(groupHomes.filter(h=>h['维护人姓名']===name),'advisor',entry.region,entry.store,group,name));
   }
  }
  const unidentified=new Set(['','—','-','/','未填写','未分配','待补充','未分组']);
  const sections=[{key:'store',title:'全司门店 TOP3',limit:3},{key:'group',title:'全司店组 TOP5',limit:5},{key:'advisor',title:'全司个人 TOP5',limit:5}].map(s=>({...s,rows:rank(levels[s.key].filter(r=>s.key==='advisor'?!unidentified.has(r.name):s.key==='group'?!unidentified.has(r.group):true),s.limit)}));
  const company=M.metrics(homes,monthlyEvents),summary=Q.summary(records);
  return {title:'全司面见标杆榜',month,asOf,sourceVersion,sections,rows:sections.flatMap(s=>s.rows),summary:{stores:catalog.length,stock:company.stock,met:company.met,meetingCount:company.met_count,feedback:summary.feedback,missing:summary.missing,unclear:summary.unclear},slogans:[...slogans],notes:['按月度面见套数排序，同套数按面见次数排序；两项相同保留并列。','个人按房源维护人归属统计；同名伙伴按门店、店组分别计算。','面见后正反馈按已识别的主要结果逐套归类；原文待补或收获待核实，不等同于面见无价值。']};
 }
 function columnSpec(key){
  return key==='store'?[['rank','排名',95],['store','门店',370],['met','面见量',155],['meetingCount','面见次数',165],['feedbackText','面见后正反馈',1119]]:key==='group'?[['rank','排名',80],['store','门店',220],['group','店组',270],['manager','经理',120],['met','面见量',120],['meetingCount','面见次数',140],['feedbackText','面见后正反馈',954]]:[['rank','排名',70],['store','门店',205],['group','店组',250],['manager','经理',115],['name','姓名',120],['met','面见量',115],['meetingCount','面见次数',125],['feedbackText','面见后正反馈',904]];
 }
 function html(board){
  if(!board?.sections)throw Error('全司标杆榜数据尚未就绪');
  return '<section class="company-benchmark" aria-label="全司面见标杆榜"><header class="cb-hero"><p class="cb-brand">LANDZ · OWNER MEETING</p><div class="cb-honor">✦ 荣誉时刻 · 榜样同行 ✦</div><h3>'+esc(board.title)+'</h3><p class="cb-date">'+esc(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf)+'</p><div class="cb-hero-line"></div><p class="cb-hero-note">让每一次主动走近，都被看见</p></header>'+board.sections.map(s=>{const cols=columnSpec(s.key);return '<section class="cb-tier"><h4><span>✦</span> '+esc(s.title)+' <span>✦</span></h4><div class="cb-scroll"><table aria-label="'+esc(s.title)+'"><thead><tr>'+cols.map(([,label])=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(row=>'<tr class="'+(row.rank===1?'cb-first':'')+'">'+cols.map(([key])=>'<td class="cb-'+key+'">'+(key==='feedbackText'?row.feedbackLines.map((line,i)=>'<div class="cb-feedback-line '+(i<row.outcomes.length?'':'cb-pending')+'">'+(i<row.outcomes.length?'<span aria-hidden="true">✦</span> ':'')+esc(line)+'</div>').join(''):key==='met'?'<b>'+row.met+'<small>套</small></b>':key==='meetingCount'?row.meetingCount+'次':key==='rank'?'<span class="cb-rank cb-rank-'+row.rank+'">'+row.rank+'</span>':esc(row[key])).replace(/^undefined$/,'')+'</td>').join('')+'</tr>').join('')+(s.rows.length?'':'<tr><td colspan="'+cols.length+'">当前暂无已登记面见的上榜对象，待数据更新后呈现。</td></tr>')+'</tbody></table></div></section>';}).join('')+'<footer class="cb-footer">'+board.slogans.map(line=>'<p>'+esc(line)+'</p>').join('')+'</footer><div class="cb-notes">'+board.notes.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div></section>';
 }
 function wrap(ctx,value,width,size=25,bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;const out=[];for(const p of String(value??'').split(/\r?\n/)){let line='';for(const ch of p){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line='';}line+=ch;}out.push(line);}return out;}
 // Export uses compact honor rows so the same company board stays readable in WeChat.
 const posterFeedbackLabels=Object.freeze({P:'价格／底价／交易条件',M:'业主心态／出售动机',R:'关系维护／客户反馈',E:'钥匙／委托／独家',V:'看房方式／配合条件',C:'房源情况核实',O:'其他需求'});
 function posterFeedback(row){
  const outcomes=Array.isArray(row.outcomes)?row.outcomes:[],pending=(row.feedbackLines||[]).slice(outcomes.length);
  const tokens=outcomes.map(outcome=>(posterFeedbackLabels[outcome.code]||outcome.label)+' '+outcome.count+'套');
  return {text:tokens.join('  ·  '),pending:pending.join('；')};
 }
 function wrapWidth(ctx,value,size){ctx.font=size+'px '+font;return ctx.measureText(value).width;}
 function layout(board,ctx){
  const width=1800,pad=56,contentWidth=width-pad*2,gap=8;
  const identityX=178,identityWidth=462,metricX=750,feedbackX=897,feedbackWidth=width-pad-feedbackX-24,bodyFontSize=34;
  const sections=board.sections.map(section=>{
   const cards=section.rows.map(row=>{
    const store=section.key==='store',main=store?row.store:section.key==='group'?row.group:row.name,mainSize=section.key==='advisor'?44:38;
    const managerText=section.key==='advisor'?'经理 '+row.manager:'';
    const managerWidth=managerText?Math.ceil(wrapWidth(ctx,managerText,32)):0;
    const mainLines=wrap(ctx,main,managerText?identityWidth-managerWidth-18:identityWidth,mainSize,true);
    const meta=store?[row.region]:section.key==='group'?['经理 '+row.manager]:[row.group];
    const metaLines=meta.flatMap(line=>wrap(ctx,line,identityWidth,32));
    const identityHeight=mainLines.length*(mainSize+5)+metaLines.length*38+6;
    const source=posterFeedback(row),feedbackText=[source.text,source.pending].filter(Boolean).join('；'),feedbackLines=feedbackText?wrap(ctx,feedbackText,feedbackWidth,bodyFontSize):[],pendingLines=[];
    const feedbackHeight=feedbackLines.length*42;
    return {row,mainLines,mainSize,managerText,metaLines,identityHeight,feedbackLines,pendingLines,feedbackHeight,height:Math.max(94,identityHeight,feedbackHeight)+20};
   });
   return {...section,cards,height:76+(cards.length?cards.reduce((n,c)=>n+c.height+gap,0):112)+12};
  });
  const sloganLines=board.slogans.flatMap(line=>wrap(ctx,line,contentWidth-36,38,true));
  const notes=['月度面见套数优先，同套数按次数；两项相同保留并列。','个人按房源维护人统计；正反馈按房源归类，待补充不等于无收获。'].flatMap(line=>wrap(ctx,line,contentWidth-32,27));
  const naturalHeight=220+sections.reduce((n,s)=>n+s.height,0)+22+sloganLines.length*52+28+notes.length*36+42;
  let scale=Math.min(1,30000/naturalHeight,Math.sqrt(64000000/(width*naturalHeight))),outputWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.ceil(naturalHeight*outputWidth/width);while(outputWidth>1&&(outputHeight>30000||outputWidth*outputHeight>64000000)){outputWidth--;outputHeight=Math.ceil(naturalHeight*outputWidth/width);}scale=outputWidth/width;if(scale<.35||outputHeight>30000)throw Error('全司标杆榜内容超出单张图片的可读尺寸，请核实异常反馈分类或重复对象');
  return {width,pad,contentWidth,gap,identityX,identityWidth,metricX,feedbackX,feedbackWidth,bodyFontSize,sections,notes,sloganLines,naturalHeight,scale,outputWidth,outputHeight};
 }
 function star(ctx,x,y,r,color='#ebbf59'){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.44:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
 function rounded(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else{ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();}ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
 async function image(board){
  if(!board?.sections||!root.document?.createElement)throw Error('全司标杆榜图片组件尚未就绪');if(root.document.fonts?.ready)await root.document.fonts.ready;
  const measure=root.document.createElement('canvas').getContext('2d');if(!measure)throw Error('当前环境不支持生成标杆榜图片');const p=layout(board,measure),canvas=root.document.createElement('canvas');canvas.width=p.outputWidth;canvas.height=p.outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前环境不支持生成标杆榜图片');ctx.scale(p.scale,p.scale);
  function write(value,x,y,size=34,color='#65447a',bold=false,align='center'){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillText(String(value??''),x,y);}
  function rule(x,y,w,color='#e9ddf1'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
  ctx.fillStyle='#faf5ff';ctx.fillRect(0,0,p.width,p.naturalHeight);
  const background=ctx.createLinearGradient(0,0,p.width,220);background.addColorStop(0,'#f0e3ff');background.addColorStop(.5,'#fbf6ff');background.addColorStop(1,'#ead7fa');ctx.fillStyle=background;ctx.fillRect(0,0,p.width,220);
  rounded(ctx,20,18,p.width-40,p.naturalHeight-38,28,'rgba(255,255,255,0)','#e5d5ef');
  for(const [sx,sy,sr] of [[132,98,16],[265,196,9],[p.width-132,98,16],[p.width-265,196,9]])star(ctx,sx,sy,sr,'#dcb969');
  rounded(ctx,p.width/2-196,30,392,39,20,'#f7e5b8');write('荣誉时刻 · 榜样同行',p.width/2,35,28,'#956c26',true);
  write(board.title,p.width/2,84,73,'#7533a4',true);
  write(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf,p.width/2,176,32,'#92709f');
  let y=220;
  function honorRow(item,rowY){
   const row=item.row,first=row.rank===1,fill=first?'#fff7e4':'#fff',border=first?'#e5bf63':'#e7daf1';
   rounded(ctx,p.pad,rowY,p.contentWidth,item.height,19,fill,border);
   const cy=rowY+item.height/2,rankX=112,badge=first?'#efce7e':row.rank===2?'#e7deef':row.rank===3?'#efd6bd':'#eee2f7';
   rounded(ctx,rankX-35,cy-35,70,70,22,badge);write(String(row.rank).padStart(2,'0'),rankX,cy-22,39,first?'#8b5f17':'#815895',true);
   let iy=rowY+(item.height-item.identityHeight)/2;
   if(item.managerText)write(item.managerText,p.identityX+p.identityWidth,iy+10,32,'#9375a1',false,'right');
   for(const line of item.mainLines){write(line,p.identityX,iy,item.mainSize,first?'#7d4b22':'#6f3b8b',true,'left');iy+=item.mainSize+5;}
   iy+=6;for(const line of item.metaLines){write(line,p.identityX,iy,32,'#9375a1',false,'left');iy+=38;}
   write(row.met+'套',p.metricX,cy-47,56,'#913fc0',true);write(row.meetingCount+'次',p.metricX,cy+18,33,'#9d7835',true);
   let fy=rowY+(item.height-item.feedbackHeight)/2;
   for(const line of item.feedbackLines){write(line,p.feedbackX,fy,p.bodyFontSize,'#6e577c',false,'left');fy+=42;}
   for(const line of item.pendingLines){write(line,p.feedbackX,fy,32,'#a692b0',false,'left');fy+=40;}
  }
  for(const section of p.sections){
   star(ctx,p.width/2-242,y+22,11);star(ctx,p.width/2+242,y+22,11);write(section.title,p.width/2,y,40,'#7b3c9e',true);
   write('榜样与团队',p.identityX,y+44,28,'#a38ab0',false,'left');write('面见量／次数',p.metricX,y+44,27,'#a38ab0');write('面见后正反馈',p.feedbackX+p.feedbackWidth/2,y+44,28,'#967347',true);y+=76;
   if(!section.cards.length){rounded(ctx,p.pad,y,p.contentWidth,100,20,'#fff','#e7daf1');write('当前暂无已登记面见的上榜对象，待数据更新后呈现。',p.width/2,y+33,32,'#a28baf');y+=112;}
   for(const item of section.cards){honorRow(item,y);y+=item.height+p.gap;}y+=12;
  }
  y+=22;rule(p.pad+60,y-8,p.contentWidth-120,'#e1c36e');
  for(const line of p.sloganLines){write(line,p.width/2,y,38,'#7d379f',true);y+=52;}y+=28;
  for(const line of p.notes){write(line,p.width/2,y,27,'#a38bb2');y+=36;}
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('全司标杆榜图片生成失败')),'image/png'));
 }
 root.WBCompanyBenchmark={build,html,image,rank,labels,slogans,posterLayout:layout,posterFeedbackLabels,posterTemplate:'compact-honor-rows-v1'};if(typeof module==='object')module.exports=root.WBCompanyBenchmark;
})(typeof window==='object'?window:globalThis);
