/* XLSX/CSV reader using browser ZIP decompression and XML; no remote parser dependency. */
(function(root){
  'use strict';
  const decoder=new TextDecoder('utf-8');
  async function zipEntries(buffer){
    const bytes=new Uint8Array(buffer),v=new DataView(buffer);let e=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){e=i;break;}
    if(e<0)throw Error('不是可识别的XLSX文件，请重新导出');
    const count=v.getUint16(e+10,true);let offset=v.getUint32(e+16,true);const entries=new Map();
    if(count>3000)throw Error('文件内部条目过多');
    for(let i=0;i<count;i++){
      if(offset+46>bytes.length||v.getUint32(offset,true)!==0x02014b50)throw Error('XLSX目录损坏');
      const flags=v.getUint16(offset+8,true),method=v.getUint16(offset+10,true),compressed=v.getUint32(offset+20,true),size=v.getUint32(offset+24,true),n=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true),local=v.getUint32(offset+42,true),name=decoder.decode(bytes.subarray(offset+46,offset+46+n));
      if(flags&1)throw Error('请上传未加密的Excel文件');
      if(size>30*1024*1024)throw Error('单个工作表过大，请拆分文件');
      entries.set(name,async()=>{
        if(local+30>bytes.length||v.getUint32(local,true)!==0x04034b50)throw Error('XLSX数据损坏');
        const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
        if(start+compressed>bytes.length)throw Error('XLSX数据不完整');
        let data=bytes.slice(start,start+compressed);
        if(method===8){let stream;try{stream=new DecompressionStream('deflate-raw');}catch{throw Error('当前浏览器不支持读取XLSX，请使用最新版Chrome或导出CSV');}data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());}
        else if(method!==0)throw Error('暂不支持此Excel压缩格式');
        if(data.length!==size)throw Error('XLSX解压后长度不符');
        return decoder.decode(data);
      });
      offset+=46+n+extra+comment;
    }
    return entries;
  }
  function xml(s){const doc=new DOMParser().parseFromString(s,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('Excel XML格式不完整');return doc;}
  const nodes=(doc,name)=>Array.from(doc.getElementsByTagName(name));
  function csv(s){
    s=s.replace(/^\uFEFF/,'');const delimiter=s.split(/\r?\n/,1)[0].includes('\t')?'\t':',';const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'){if(quoted&&s[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(field);field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&s[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=ch;}
    if(quoted)throw Error('CSV引号未闭合');if(field||row.length){row.push(field);rows.push(row);}return rows;
  }
  function objects(rows){if(!rows.length)return [];const headers=rows[0].map(x=>String(x??'').trim());if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw Error('表头存在重复字段');return rows.slice(1).filter(r=>r.some(x=>x!==''&&x!=null)).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']).filter(([h])=>h)));}
  async function xlsx(buffer){
    const z=await zipEntries(buffer),get=async name=>z.has(name)?await z.get(name)():null;
    const workbook=xml(await get('xl/workbook.xml')||''),rels=xml(await get('xl/_rels/workbook.xml.rels')||''),relation=new Map(nodes(rels,'Relationship').map(n=>[n.getAttribute('Id'),n.getAttribute('Target')]));
    const ss=await get('xl/sharedStrings.xml'),strings=ss?nodes(xml(ss),'si').map(n=>nodes(n,'t').map(t=>t.textContent).join('')):[];
    const is1904=nodes(workbook,'workbookPr')[0]?.getAttribute('date1904')==='1';
    const out=[];
    for(const sheet of nodes(workbook,'sheet')){
      let target=relation.get(sheet.getAttribute('r:id'));if(!target)continue;target=target.startsWith('/')?target.slice(1):'xl/'+target;target=target.replace(/\/\.\//g,'/');
      const source=await get(target);if(!source)continue;const rows=[];
      for(const r of nodes(xml(source),'row')){
        const row=[];for(const c of nodes(r,'c')){const letters=(c.getAttribute('r')||'A').match(/^[A-Z]+/)?.[0]||'A';let index=0;for(const ch of letters)index=index*26+ch.charCodeAt(0)-64;const value=nodes(c,'v')[0]?.textContent??'',type=c.getAttribute('t');row[index-1]=type==='s'?strings[Number(value)]??'':type==='inlineStr'?nodes(c,'t').map(n=>n.textContent).join(''):type==='b'?Number(value):value!==''&&type!=='str'?Number(value):value;}
        rows.push(row);
      }
      const data=objects(rows);
      for(const row of data)for(const [key,value] of Object.entries(row))if(/时间|日期/.test(key)&&typeof value==='number'&&value>20000&&value<100000){row[key]=new Date(Math.round((value-25569+(is1904?1462:0))*86400000)).toISOString().slice(0,19).replace('T',' ');}
      if(data.length)out.push({sheet:sheet.getAttribute('name'),rows:data});
    }
    return out;
  }
  async function read(file){if(file.size>25*1024*1024)throw Error('单个文件不能超过25MB');if(/\.xlsx$/i.test(file.name))return xlsx(await file.arrayBuffer());if(/\.csv$|\.tsv$/i.test(file.name))return [{sheet:file.name,rows:objects(csv(await file.text()))}];if(/\.json$/i.test(file.name)){const x=JSON.parse(await file.text());if(!Array.isArray(x))throw Error('JSON底表须为记录数组');return [{sheet:file.name,rows:x}];}throw Error('请上传XLSX、CSV或JSON文件');}
  root.WBFiles={read,csv,objects,zipEntries,xlsx};
  if(typeof module==='object')module.exports=root.WBFiles;
})(typeof window==='object'?window:globalThis);
