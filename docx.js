// Word (.docx) export in the same Arabic custody layout and colours as the PDF.
(function(){
'use strict';
const PCT=[3,8.3,8.8,13.5,22.4,13.6,5.3,8.4,7,9.7],TW=10772;
const W=PCT.map(p=>Math.round(TW*p/100));
const x=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const span=(a,n)=>W.slice(a,a+n).reduce((s,v)=>s+v,0);
// One table cell. opt: {span, start, fill, bold, color, num, size}
function cell(text,o={}){
  const n=o.span||1,w=span(o.start||0,n),sz=o.size||16;
  const rpr=`<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/>${o.bold?'<w:b/><w:bCs/>':''}${o.color?`<w:color w:val="${o.color}"/>`:''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${o.num?'':'<w:rtl/>'}</w:rPr>`;
  const lines=String(text??'').split('\n');
  const runs=lines.map((l,i)=>`${i?'<w:r><w:br/></w:r>':''}<w:r>${rpr}<w:t xml:space="preserve">${x(l)}</w:t></w:r>`).join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${n>1?`<w:gridSpan w:val="${n}"/>`:''}${o.fill?`<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`:''}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr>${runs}</w:p></w:tc>`;
}
const row=(cells,h)=>`<w:tr>${h?`<w:trPr><w:trHeight w:val="${h}" w:hRule="exact"/></w:trPr>`:''}${cells.join('')}</w:tr>`;
function table(rep,h){
  const s=h.totals(rep),rows=[];
  rows.push(row([cell('',{span:10,fill:'C6E0B4',size:8})],150));
  rows.push(row([cell(rep.title,{span:10,fill:'D9D9D9',bold:true,size:22})]));
  const heads=['م','التاريخ','رقم الفاتورة','الاسم','بيان','الرقم الضريبي','النسبة','الاجمالي قبل الضريبة','الضريبة','الاجمالي بعد الضريبة'];
  rows.push(row(heads.map((t,i)=>cell(t,{start:i,fill:'44546A',color:'FFFFFF',bold:true}))));
  rows.push(row([cell(rep.category||'',{span:10,fill:'8EA9DB',bold:true})]));
  rep.items.forEach((it,i)=>{
    const v=[String(i+1),h.fmtDate(it.date),it.invNo||'0',it.name,it.desc,it.vatNo||'0',h.rateOf(it)+'%',h.money(it.before),h.money(it.tax),h.money(it.after)];
    rows.push(row(v.map((t,c)=>cell(t,{start:c,num:[0,1,2,5,6,7,8,9].includes(c),fill:c===4&&it.highlight?'FFFF00':''}))));
  });
  rows.push(row([cell('الإجمالي',{span:7,fill:'9BC2E6',bold:true}),cell(h.money(s.before),{start:7,fill:'8EA9DB',num:true}),cell(h.money(s.tax),{start:8,fill:'8EA9DB',num:true}),cell(h.money(s.after),{start:9,fill:'8EA9DB',num:true})]));
  for(const [label,val] of [['العهده',s.custody],['تنزيل العهده',s.after],['المتبقي',s.left]])rows.push(row([cell(label,{span:9,bold:true}),cell(h.money(val),{start:9,bold:true,num:true})]));
  const b='w:val="single" w:sz="4" w:space="0" w:color="000000"';
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${TW}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top ${b}/><w:left ${b}/><w:bottom ${b}/><w:right ${b}/><w:insideH ${b}/><w:insideV ${b}/></w:tblBorders><w:tblCellMar><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${W.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
}
async function buildDocx(reports,helpers){
  const body=reports.map(r=>table(r,helpers)).join('<w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p>');
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="567" w:header="0" w:footer="0" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
  const zip=new JSZip(),opt={createFolders:false};
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',opt);
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',opt);
  zip.file('word/document.xml',doc,opt);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}
window.buildDocx=buildDocx;
})();
