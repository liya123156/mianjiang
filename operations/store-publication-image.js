/* One complete store publication PNG: progress first, then every unmet-TOP page. */
(function(root){
 'use strict';
 const MAX_EDGE=30000,MAX_PIXELS=64000000;
 const positiveInt=value=>Number.isSafeInteger(value)&&value>0;
 function imageSize(image){return {width:Number(image?.naturalWidth||image?.width),height:Number(image?.naturalHeight||image?.height)};}
 function layout({progress,unmet=[]}={}){
  if(!progress||!Array.isArray(unmet))throw Error('请提供单店进展图及完整的未面见TOP房明细图片');
  const sizes=[progress,...unmet].map(imageSize);
  if(sizes.some(s=>!positiveInt(s.width)||!positiveInt(s.height)||s.width>MAX_EDGE||s.height>MAX_EDGE))throw Error('单店公示图片尺寸无效，请重新生成');
  const width=Math.max(...sizes.map(s=>s.width)),gap=Math.max(24,Math.round(width*.016));
  const source=unmet.length?sizes:[...sizes,{width,height:Math.max(240,Math.round(width*.1)),empty:true}];
  let y=0;
  const panels=source.map((size,index)=>{
   const height=Math.ceil(size.height*width/size.width),panel={index,x:0,y,width,height,nativeWidth:size.width,nativeHeight:size.height,empty:!!size.empty};
   y+=height+(index<source.length-1?gap:0);return panel;
  });
  if(y>MAX_EDGE||width*y>MAX_PIXELS)throw Error('完整单店公示图超过单张图片尺寸上限，未生成截断图片；请缩小明细范围后重试');
  return {width,height:y,gap,panels};
 }
 async function decode(blob,label){
  if(!blob||typeof blob.arrayBuffer!=='function'||(blob.type&&blob.type!=='image/png'))throw Error(label+'不是有效的PNG图片，请重新生成');
  if(typeof root.createImageBitmap==='function'){
   try{return await root.createImageBitmap(blob);}catch(error){if(typeof root.Image!=='function')throw Error(label+'读取失败，请重新生成');}
  }
  if(typeof root.Image!=='function'||!root.URL?.createObjectURL)throw Error('当前浏览器不支持合并图片，请使用新版浏览器');
  const url=root.URL.createObjectURL(blob);
  try{return await new Promise((resolve,reject)=>{const image=new root.Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error(label+'读取失败，请重新生成'));image.src=url;});}
  finally{root.URL.revokeObjectURL(url);}
 }
 function emptyTop(ctx,panel){
  const x=panel.x,y=panel.y,w=panel.width,h=panel.height,scale=w/2000;
  ctx.fillStyle='#fffefa';ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#5d3973';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='600 '+Math.round(30*scale)+'px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  ctx.fillText('本月未面见TOP房明细',x+w/2,y+h*.34);
  ctx.fillStyle='#766781';ctx.font=Math.round(23*scale)+'px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  ctx.fillText('当前范围暂无本月未面见TOP房。',x+w/2,y+h*.66);
 }
 async function combine({progress,unmet=[]}={}){
  if(!progress||!Array.isArray(unmet))throw Error('请提供单店进展图及完整的未面见TOP房明细图片');
  const images=[];
  try{
   images.push(await decode(progress,'面见及礼物进展图'));
   for(let i=0;i<unmet.length;i++)images.push(await decode(unmet[i],'未面见TOP房第'+(i+1)+'页'));
   const plan=layout({progress:images[0],unmet:images.slice(1)});
   if(root.document?.fonts?.ready)await root.document.fonts.ready;
   const canvas=root.document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器暂时无法合并图片，请重试');
   ctx.fillStyle='#f5effb';ctx.fillRect(0,0,plan.width,plan.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   for(const panel of plan.panels){if(panel.empty)emptyTop(ctx,panel);else ctx.drawImage(images[panel.index],panel.x,panel.y,panel.width,panel.height);}
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('单店进展与未面见TOP房合并图片生成失败')),'image/png'));
  }finally{for(const image of images)if(typeof image.close==='function')image.close();}
 }
 const api={combine,layout,limits:Object.freeze({maxEdge:MAX_EDGE,maxPixels:MAX_PIXELS})};
 root.WBStorePublicationImage=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
