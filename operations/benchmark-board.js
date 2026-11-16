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
 function layout(board,ctx){
  const width=1800,pad=64,contentWidth=width-pad*2,gap=26;
  const sections=board.sections.map(section=>{
   const columns=section.key==='store'?3:2,cardWidth=(contentWidth-gap*(columns-1))/columns;
   const cards=section.rows.map(row=>{
    const store=section.key==='store',main=store?row.store:section.key==='group'?row.group:row.name,mainSize=store?39:section.key==='group'?34:42;
    const mainLines=wrap(ctx,main,cardWidth-60,mainSize,true);
    const meta=store?[row.region]:section.key==='group'?[row.region,'经理：'+row.manager]:[row.group,'经理：'+row.manager];
    const metaLines=meta.flatMap(line=>wrap(ctx,line,cardWidth-58,24));
    const identityHeight=76+mainLines.length*(mainSize+10)+metaLines.length*34+16;
    const feedbackWidth=store?cardWidth-62:cardWidth-246,feedbackSize=store?23:24;
    const feedback=row.feedbackLines.map((line,i)=>({lines:wrap(ctx,line,feedbackWidth,feedbackSize),pending:i>=row.outcomes.length}));
    const feedbackHeight=feedback.reduce((n,f)=>n+f.lines.length*33+8,0);
    const bodyHeight=store?130+48+feedbackHeight:Math.max(148,46+feedbackHeight);
    return {row,store,mainSize,mainLines,metaLines,identityHeight,feedback,feedbackSize,height:identityHeight+bodyHeight+30};
   });
   const bands=[];for(let i=0;i<cards.length;i+=columns){const band=cards.slice(i,i+columns);bands.push({cards:band,height:Math.max(...band.map(c=>c.height))});}
   return {...section,columns,cardWidth,bands,height:118+(bands.length?bands.reduce((n,b)=>n+b.height+gap,0):110)};
  });
  const notes=board.notes.flatMap(line=>wrap(ctx,line,contentWidth-32,20)),sloganLines=board.slogans.flatMap(line=>wrap(ctx,line,contentWidth-70,34,true)),naturalHeight=350+sections.reduce((n,s)=>n+s.height,0)+55+sloganLines.length*54+52+notes.length*30+64;
  let scale=Math.min(1,30000/naturalHeight,Math.sqrt(64000000/(width*naturalHeight))),outputWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.ceil(naturalHeight*outputWidth/width);while(outputWidth>1&&(outputHeight>30000||outputWidth*outputHeight>64000000)){outputWidth--;outputHeight=Math.ceil(naturalHeight*outputWidth/width);}scale=outputWidth/width;if(scale<.35||outputHeight>30000)throw Error('全司标杆榜内容超出单张图片的可读尺寸，请核实异常反馈分类或重复对象');
  return {width,pad,contentWidth,gap,sections,notes,sloganLines,naturalHeight,scale,outputWidth,outputHeight};
 }
 function star(ctx,x,y,r,color='#ebbf59'){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.44:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=color;ctx.fill();}
 function rounded(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else{ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();}ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}}
 async function image(board){
  if(!board?.sections||!root.document?.createElement)throw Error('全司标杆榜图片组件尚未就绪');if(root.document.fonts?.ready)await root.document.fonts.ready;
  const measure=root.document.createElement('canvas').getContext('2d');if(!measure)throw Error('当前环境不支持生成标杆榜图片');const p=layout(board,measure),canvas=root.document.createElement('canvas');canvas.width=p.outputWidth;canvas.height=p.outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前环境不支持生成标杆榜图片');ctx.scale(p.scale,p.scale);
  function write(value,x,y,size=25,color='#65447a',bold=false,align='center'){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillText(String(value??''),x,y);}
  function rule(x,y,w,color='#e9ddf1'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
  ctx.fillStyle='#faf5ff';ctx.fillRect(0,0,p.width,p.naturalHeight);
  const background=ctx.createLinearGradient(0,0,p.width,330);background.addColorStop(0,'#f0e3ff');background.addColorStop(.5,'#f8f1ff');background.addColorStop(1,'#ead7fa');ctx.fillStyle=background;ctx.fillRect(0,0,p.width,330);
  rounded(ctx,22,20,p.width-44,p.naturalHeight-42,30,'rgba(255,255,255,0)','#e5d5ef');
  for(const [sx,sy,sr] of [[132,100,17],[260,252,10],[p.width-132,100,17],[p.width-260,252,10],[375,43,7],[p.width-375,43,7]])star(ctx,sx,sy,sr,'#dcb969');
  write('LANDZ · OWNER MEETING',p.width/2,32,22,'#9b7bad',true);
  rounded(ctx,p.width/2-204,76,408,40,20,'#f7e5b8');write('荣誉时刻 · 榜样同行',p.width/2,83,25,'#956c26',true);
  write(board.title,p.width/2,137,67,'#7533a4',true);
  write(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf,p.width/2,226,26,'#92709f');
  rule(p.width/2-90,277,180,'#d9b65a');write('让每一次主动走近，都被看见',p.width/2,295,25,'#9873a8');
  let y=360;
  function card(item,x,y,w,h){
   const row=item.row,cx=x+w/2,first=row.rank===1;
   ctx.shadowColor='rgba(121,65,154,.08)';ctx.shadowBlur=18;ctx.shadowOffsetY=7;rounded(ctx,x,y,w,h,26,first?'#fffaf0':'#ffffff',first?'#e8c97c':'#e7daf1');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
   const badgeColor=first?'#f2d18a':row.rank===2?'#e7deef':row.rank===3?'#efd6bd':'#eee2f7';
   rounded(ctx,cx-71,y+20,142,38,19,badgeColor);write('NO. '+String(row.rank).padStart(2,'0'),cx,y+25,24,first?'#90631d':'#815895',true);
   let cy=y+77;for(const line of item.mainLines){write(line,cx,cy,item.mainSize,first?'#7d4b22':'#6f3b8b',true);cy+=item.mainSize+10;}
   for(const line of item.metaLines){write(line,cx,cy,24,'#9c83aa');cy+=34;}
   const bodyY=y+item.identityHeight;
   if(item.store){
    const centers=[x+w*.32,x+w*.72];write(row.met+'套',centers[0],bodyY,57,'#913fc0',true);write(row.meetingCount+'次',centers[1],bodyY+9,43,'#a17b38',true);
    write('面见量',centers[0],bodyY+70,22,'#a48bb0');write('面见次数',centers[1],bodyY+70,22,'#a48bb0');rule(x+30,bodyY+112,w-60,first?'#ead9ac':'#ede2f3');
    write('面见后正反馈',cx,bodyY+133,23,'#967347',true);
    let fy=bodyY+176;for(const group of item.feedback){for(const line of group.lines){write(line,x+31,fy,item.feedbackSize,group.pending?'#b09eb9':'#6e577c',false,'left');fy+=33;}fy+=8;}
   }else{
    const metricX=x+111;write(row.met+'套',metricX,bodyY+8,55,'#913fc0',true);write('面见量',metricX,bodyY+74,22,'#a48bb0');write(row.meetingCount+'次面见',metricX,bodyY+111,25,'#a17b38',true);
    const fx=x+218,fw=w-246;rule(fx,bodyY-7,fw,first?'#ead9ac':'#ede2f3');write('面见后正反馈',fx+fw/2,bodyY+9,23,'#967347',true);
    let fy=bodyY+51;for(const group of item.feedback){for(const line of group.lines){write(line,fx,fy,item.feedbackSize,group.pending?'#b09eb9':'#6e577c',false,'left');fy+=33;}fy+=8;}
   }
  }
  for(const section of p.sections){
   rule(p.pad+100,y+30,p.contentWidth/2-320,'#dfc77e');rule(p.width/2+220,y+30,p.contentWidth/2-320,'#dfc77e');star(ctx,p.width/2-238,y+28,12);star(ctx,p.width/2+238,y+28,12);write(section.title,p.width/2,y+6,41,'#7b3c9e',true);y+=92;
   if(!section.bands.length){rounded(ctx,p.pad,y,p.contentWidth,100,24,'#fff','#e7daf1');write('当前暂无已登记面见的上榜对象，待数据更新后呈现。',p.width/2,y+32,26,'#a28baf');y+=110;}
   for(const band of section.bands){const totalWidth=band.cards.length*section.cardWidth+(band.cards.length-1)*p.gap,startX=(p.width-totalWidth)/2;band.cards.forEach((item,i)=>card(item,startX+i*(section.cardWidth+p.gap),y,section.cardWidth,band.height));y+=band.height+p.gap;}
   y+=26;
  }
  y+=22;rounded(ctx,p.pad,y,p.contentWidth,p.sloganLines.length*54+58,28,'#f1e3fb','#e5d2ee');y+=28;for(const line of p.sloganLines){write(line,p.width/2,y,34,'#7d379f',true);y+=54;}y+=64;
  for(const line of p.notes){write(line,p.width/2,y,20,'#a38bb2');y+=30;}
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('全司标杆榜图片生成失败')),'image/png'));
 }
 root.WBCompanyBenchmark={build,html,image,rank,labels,slogans};if(typeof module==='object')module.exports=root.WBCompanyBenchmark;
})(typeof window==='object'?window:globalThis);
