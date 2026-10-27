/* Local receipt selection. Upload occurs only when the existing form is saved. */
(function(root){
 'use strict';
 const pending=new WeakMap(),previews=new Map(),allowed=new Set(['image/png','image/jpeg','image/webp','application/pdf']);
 const fileFor=form=>pending.get(form)||form?.elements.proof?.files?.[0];
 function clear(form){pending.delete(form);const input=form?.elements.proof;if(input)input.value='';render(form);}
 function render(form){
  const zone=form?.querySelector('[data-proof-preview]');if(!zone)return;
  if(previews.has(zone)){URL.revokeObjectURL(previews.get(zone));previews.delete(zone);}zone.replaceChildren();
  const file=fileFor(form);if(!file)return;
  const name=document.createElement('span');name.textContent=file.name+' · '+(file.size/1024).toFixed(0)+'KB · 保存表单后上传';zone.append(name);
  if(file.type.startsWith('image/')){const u=URL.createObjectURL(file);previews.set(zone,u);const img=document.createElement('img');img.src=u;img.alt='待保存付款截图预览';zone.append(img);}
  const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='移除此截图／文件';button.dataset.proofRemove='true';zone.append(button);
 }
 function choose(form,file){
  if(!allowed.has(file.type)||!file.size||file.size>2*1024*1024){root.WBProofs.onError?.('凭证支持PNG、JPG、WEBP或PDF，每份不超过2MB');return false;}
  pending.set(form,file);if(form.elements.existingProof)form.elements.existingProof.value='';render(form);return true;
 }
 function field(label,existing=''){
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="wide ops-proof-field"><label>${escape(label)}<input name="proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label><div class="ops-paste-zone" tabindex="0" role="group" aria-label="粘贴付款截图">点击这里，按 Ctrl+V 粘贴付款截图（Mac：⌘V）<span>也可选择文件；图片或PDF，每份不超过2MB。保存后上传共享。</span></div><div data-proof-preview aria-live="polite"></div>${existing?'<p class="ops-muted">当前已保存凭证：'+escape(existing)+'；选择新截图后将替换本条关联。</p>':''}</div>`;
 }
 function boot(){
  document.addEventListener('paste',event=>{
   const items=Array.from(event.clipboardData?.items||[]),image=items.find(x=>x.kind==='file'&&x.type.startsWith('image/'));if(!image)return;
   const target=event.target instanceof Element?event.target:null;
   const form=target?.closest('form')||document.querySelector('dialog[open] form');if(!form?.querySelector('[data-proof-preview]'))return;
   const blob=image.getAsFile();if(!blob)return;event.preventDefault();
   const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';choose(form,new File([blob],'付款截图_'+Date.now()+'.'+ext,{type:blob.type}));
  });
  document.addEventListener('change',event=>{const input=event.target,form=input.form;if(!form)return;
   if(input.name==='proof'&&input.files?.[0]){const file=input.files[0];pending.delete(form);if(!choose(form,file)){input.value='';render(form);}}
   if(input.name==='existingProof'&&input.value)clear(form);
  });
  document.addEventListener('click',event=>{const button=event.target.closest('[data-proof-remove]');if(button)clear(button.closest('form'));});
  new MutationObserver(()=>{for(const [zone,u] of previews)if(!zone.isConnected){URL.revokeObjectURL(u);previews.delete(zone);}}).observe(document.body,{subtree:true,childList:true});
 }
 root.WBProofs={field,file:fileFor,clear,boot,onError:null};
})(window);
