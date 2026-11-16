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
  return '<section class="company-benchmark" aria-label="全司面见标杆榜"><header class="cb-hero"><p>LANDZ · OWNER MEETING</p><h3>🌟 '+esc(board.title)+'</h3><p>'+esc(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf)+'</p></header>'+board.sections.map(s=>{const cols=columnSpec(s.key);return '<section class="cb-tier"><h4>'+esc(s.title)+'</h4><div class="cb-scroll"><table aria-label="'+esc(s.title)+'"><thead><tr>'+cols.map(([,label])=>'<th scope="col">'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(row=>'<tr class="'+(row.rank===1?'cb-first':'')+'">'+cols.map(([key])=>'<td class="cb-'+key+'">'+(key==='feedbackText'?row.feedbackLines.map((line,i)=>'<div class="cb-feedback-line">'+(i<row.outcomes.length?'✅ ':'')+esc(line)+'</div>').join(''):key==='met'?'<b>'+row.met+'套</b>':key==='meetingCount'?row.meetingCount+'次':key==='rank'?'<span class="cb-rank cb-rank-'+row.rank+'">'+row.rank+'</span>':esc(row[key])).replace(/^undefined$/,'')+'</td>').join('')+'</tr>').join('')+(s.rows.length?'':'<tr><td colspan="'+cols.length+'">当前暂无已登记面见的上榜对象，待数据更新后呈现。</td></tr>')+'</tbody></table></div></section>';}).join('')+'<footer class="cb-footer">'+board.slogans.map(line=>'<p>'+esc(line)+'</p>').join('')+'</footer><div class="cb-notes">'+board.notes.map(line=>'<p>'+esc(line)+'</p>').join('')+'</div></section>';
 }
 function wrap(ctx,value,width,size=25,bold=false){ctx.font=`${bold?'600 ':''}${size}px ${font}`;const out=[];for(const p of String(value??'').split(/\r?\n/)){let line='';for(const ch of p){if(line&&ctx.measureText(line+ch).width>width){out.push(line);line='';}line+=ch;}out.push(line);}return out;}
 function layout(board,ctx){
  const width=2000,pad=48,contentWidth=width-pad*2,sections=board.sections.map(s=>{const raw=columnSpec(s.key),total=raw.reduce((n,c)=>n+c[2],0),columns=raw.map(([key,label,w])=>({key,label,width:w/total*contentWidth}));const rows=s.rows.map(row=>{const cells=columns.map(c=>wrap(ctx,c.key==='met'?row.met+'套':c.key==='meetingCount'?row.meetingCount+'次':row[c.key],c.width-28,c.key==='met'?34:25,c.key==='met'||row.rank===1));return {row,cells,height:Math.max(88,...cells.map(lines=>lines.length*36+28))};});if(!rows.length)rows.push({row:null,cells:[wrap(ctx,'当前暂无已登记面见的上榜对象，待数据更新后呈现。',contentWidth-28,25)],height:88});return {...s,columns,rows,height:74+60+rows.reduce((n,r)=>n+r.height,0)+30};});
  const notes=board.notes.flatMap(line=>wrap(ctx,line,contentWidth,21)),sloganLines=board.slogans.flatMap(line=>wrap(ctx,line,contentWidth-40,37,true)),naturalHeight=245+sections.reduce((n,s)=>n+s.height,0)+40+sloganLines.length*56+40+notes.length*32+40;
  let scale=Math.min(1,30000/naturalHeight,Math.sqrt(64000000/(width*naturalHeight))),outputWidth=Math.max(1,Math.floor(width*scale)),outputHeight=Math.ceil(naturalHeight*outputWidth/width);while(outputWidth>1&&(outputHeight>30000||outputWidth*outputHeight>64000000)){outputWidth--;outputHeight=Math.ceil(naturalHeight*outputWidth/width);}scale=outputWidth/width;if(scale<.35||outputHeight>30000)throw Error('全司标杆榜内容超出单张图片的可读尺寸，请核实异常反馈分类或重复对象');return {width,pad,contentWidth,sections,notes,sloganLines,naturalHeight,scale,outputWidth,outputHeight};
 }
 function star(ctx,x,y,r){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle='#e6b246';ctx.fill();ctx.strokeStyle='#c68b22';ctx.lineWidth=2;ctx.stroke();}
 async function image(board){
  if(!board?.sections||!root.document?.createElement)throw Error('全司标杆榜图片组件尚未就绪');if(root.document.fonts?.ready)await root.document.fonts.ready;
  const measure=root.document.createElement('canvas').getContext('2d');if(!measure)throw Error('当前环境不支持生成标杆榜图片');const p=layout(board,measure),canvas=root.document.createElement('canvas');canvas.width=p.outputWidth;canvas.height=p.outputHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前环境不支持生成标杆榜图片');ctx.scale(p.scale,p.scale);ctx.fillStyle='#fbf7ff';ctx.fillRect(0,0,p.width,p.naturalHeight);
  function write(value,x,y,size=25,color='#4e3d61',bold=false,align='left'){ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;ctx.fillText(String(value??''),x,y);}
  const gradient=ctx.createLinearGradient(0,0,p.width,210);gradient.addColorStop(0,'#eee0fb');gradient.addColorStop(1,'#f9f0ff');ctx.fillStyle=gradient;ctx.fillRect(0,0,p.width,210);write('LANDZ · OWNER MEETING',p.pad,25,23,'#8a50b1',true);star(ctx,p.pad+28,106,27);write(board.title,p.pad+77,71,53,'#6d3098',true);write(Number(board.month.slice(5))+'月｜月度累计 · 数据截至'+board.asOf,p.pad,158,26,'#8957a5');
  let y=235;for(const section of p.sections){
   ctx.fillStyle='#eee3f7';ctx.fillRect(p.pad,y,p.contentWidth,64);star(ctx,p.pad+30,y+30,16);write(section.title,p.pad+65,y+13,32,'#71408e',true);y+=74;
   const xs=[p.pad];for(const c of section.columns)xs.push(xs.at(-1)+c.width);ctx.fillStyle='#eae0f2';ctx.fillRect(p.pad,y,p.contentWidth,60);section.columns.forEach((c,i)=>{ctx.strokeStyle='#d9cbe5';ctx.lineWidth=1;ctx.strokeRect(xs[i],y,c.width,60);write(c.label,xs[i]+14,y+17,24,'#64417e',true);});y+=60;
   for(const item of section.rows){const row=item.row;ctx.fillStyle=row?.rank===1?'#fff2ce':p.sections.indexOf(section)%2?'#fcf9ff':'#ffffff';ctx.fillRect(p.pad,y,p.contentWidth,item.height);if(!row){write(item.cells[0].join(''),p.pad+14,y+24,25);y+=item.height;continue;}
    section.columns.forEach((c,i)=>{ctx.strokeStyle='#e2d8eb';ctx.lineWidth=.8;ctx.strokeRect(xs[i],y,c.width,item.height);const lines=item.cells[i],size=c.key==='met'?34:25,bold=c.key==='met'||row.rank===1,color=c.key==='met'?'#8836b6':c.key==='feedbackText'?'#59446a':'#4e3d61';if(c.key==='rank'){const center=xs[i]+c.width/2;if(row.rank<=3&&ctx.arc){ctx.beginPath();ctx.arc(center,y+37,25,0,Math.PI*2);ctx.fillStyle=row.rank===1?'#efcb72':row.rank===2?'#dedbe7':'#edc7a7';ctx.fill();}write(row.rank,center,y+20,30,'#6a3787',true,'center');}else lines.forEach((line,j)=>write(line,xs[i]+14,y+15+j*36,size,color,bold));});y+=item.height;
   }y+=30;
  }
  y+=35;for(const line of p.sloganLines){write(line,p.width/2,y,37,'#753498',true,'center');y+=56;}y+=35;for(const line of p.notes){write(line,p.pad,y,21,'#8a769b');y+=32;}
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('全司标杆榜图片生成失败')),'image/png'));
 }
 root.WBCompanyBenchmark={build,html,image,rank,labels,slogans};if(typeof module==='object')module.exports=root.WBCompanyBenchmark;
})(typeof window==='object'?window:globalThis);
