(function(){
'use strict';
const VERSION='1.0.0';
const KEY='ahda_state_v1';
const $=id=>document.getElementById(id);
const base=new URL('.',location.href).href;

// ---------- state ----------
let state={reports:[],settings:{dateFmt:'d-m-yyyy',lastTitle:'',lastCat:'مستلزمات تشغيل'}};
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Array.isArray(s.reports))state=Object.assign(state,s,{settings:Object.assign(state.settings,s.settings||{})})}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){alert('ڈیٹا محفوظ نہیں ہو سکا: '+e.message)}}
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
let curRep=null,editItem=null,formSource='manual';

// ---------- numbers and dates ----------
const r2=n=>{n=Number(n)||0;return Math.sign(n)*Math.round((Math.abs(n)+Number.EPSILON)*100)/100};
const money=n=>r2(n).toFixed(2);
function parseNum(v){v=String(v??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g,'.').replace(/[,\s]/g,'');if(v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function fmtDate(iso){if(!iso)return '';const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return iso;const d=+m[3],mo=+m[2],y=m[1];switch(state.settings.dateFmt){case 'd/m/yyyy':return `${d}/${mo}/${y}`;case 'dd/mm/yyyy':return `${m[3]}/${m[2]}/${y}`;default:return `${d}-${mo}-${y}`}}
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function totals(rep){let before=0,tax=0,after=0;for(const it of rep.items){before+=Number(it.before)||0;tax+=Number(it.tax)||0;after+=Number(it.after)||0}before=r2(before);tax=r2(tax);after=r2(after);return {before,tax,after,custody:r2(rep.custody),left:r2((Number(rep.custody)||0)-after)}}
const rateOf=it=>(Number(it.tax)>0?(Number(it.before)>0?Math.round(Number(it.tax)/Number(it.before)*100):15):0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------- ui helpers ----------
let toastTimer;
function toast(msg,ms=2600){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.add('hidden'),ms)}
function busy(msg){if(msg===false){$('busy').classList.add('hidden');return}$('busyTxt').textContent=msg;$('busy').classList.remove('hidden')}
function show(id){$(id).classList.remove('hidden')}
function hide(id){$(id).classList.add('hidden')}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{const s=b.closest('section');s.classList.add('hidden');if(s.id==='formSheet')resetForm()}));
function beep(){try{const c=beep.ctx||(beep.ctx=new (window.AudioContext||window.webkitAudioContext)()),o=c.createOscillator(),g=c.createGain();o.frequency.value=1040;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.2,c.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.18)}catch(e){}}

// ---------- home ----------
function renderHome(){
  const list=$('repList');
  if(!state.reports.length){list.innerHTML='<div class="empty">ابھی کوئی عہدہ نہیں۔<br>نیچے "+ نیا عہدہ" دبائیں۔</div>';return}
  list.innerHTML=state.reports.map(rep=>{const t=totals(rep);return `<div class="card rep" data-id="${rep.id}">
    <input type="checkbox" data-pick="${rep.id}" ${rep.pick!==false?'checked':''} aria-label="PDF میں شامل">
    <div style="flex:1;min-width:0"><div class="t">${esc(rep.title||'بغیر عنوان')}</div>
    <div class="muted">${rep.items.length} رسیدیں</div>
    <div class="nums"><div><span>العهده</span><b>${money(t.custody)}</b></div><div><span>تنزيل العهده</span><b>${money(t.after)}</b></div><div><span>المتبقي</span><b class="${t.left<0?'neg':''}">${money(t.left)}</b></div></div></div></div>`}).join('');
}
$('repList').addEventListener('click',e=>{
  const pick=e.target.closest('[data-pick]');
  if(pick){const rep=state.reports.find(r=>r.id===pick.dataset.pick);rep.pick=pick.checked;save();return}
  const card=e.target.closest('.rep');if(card)openReport(card.dataset.id);
});
$('newRepBtn').addEventListener('click',()=>{const rep={id:uid(),title:state.settings.lastTitle||'',custody:0,category:state.settings.lastCat||'مستلزمات تشغيل',items:[],pick:true,created:Date.now()};state.reports.push(rep);save();openReport(rep.id);openRepSheet()});

// ---------- report ----------
function openReport(id){curRep=state.reports.find(r=>r.id===id);if(!curRep)return;hide('home');show('report');renderReport();window.scrollTo(0,0)}
function renderReport(){
  const rep=curRep,t=totals(rep);
  $('repTitle').textContent=rep.title||'بغیر عنوان';
  $('sCustody').textContent=money(t.custody);$('sSpent').textContent=money(t.after);$('sLeft').textContent=money(t.left);$('sLeft').className=t.left<0?'neg':'';
  $('sCount').textContent=`${rep.items.length} رسیدیں · قبل الضريبة ${money(t.before)} · الضريبة ${money(t.tax)}`;
  $('itemList').innerHTML=rep.items.length?rep.items.map((it,i)=>`<div class="item ${it.highlight?'hl':''}" data-i="${i}">
    <div class="n">${i+1}</div>
    <div class="m"><div>${esc(it.name||'—')}${!it.invNo?'<span class="flag">نمبر نہیں</span>':''}</div><div class="muted d">${esc(fmtDate(it.date))} · ${esc(it.invNo||'0')} · ${esc(it.desc||'')}</div></div>
    <div class="a">${money(it.after)}</div></div>`).join(''):'<div class="empty">ابھی کوئی رسید نہیں۔ نیچے سے QR اسکین کریں یا ہاتھ سے لکھیں۔</div>';
}
$('itemList').addEventListener('click',e=>{const row=e.target.closest('.item');if(row)openForm(curRep.items[+row.dataset.i])});
$('backBtn').addEventListener('click',()=>{hide('report');show('home');curRep=null;renderHome()});
function openRepSheet(){const rep=curRep;$('rTitle').value=rep.title||'';$('rCustody').value=rep.custody?money(rep.custody):'';$('rCat').value=rep.category||'';show('repSheet')}
$('repEditBtn').addEventListener('click',openRepSheet);
$('rSave').addEventListener('click',()=>{const rep=curRep;rep.title=$('rTitle').value.trim();rep.custody=r2(parseNum($('rCustody').value)||0);rep.category=$('rCat').value.trim();if(rep.title)state.settings.lastTitle=rep.title;if(rep.category)state.settings.lastCat=rep.category;save();hide('repSheet');renderReport();toast('محفوظ ہو گیا')});
$('rUp').addEventListener('click',()=>{const i=state.reports.indexOf(curRep);if(i>0){state.reports.splice(i,1);state.reports.splice(i-1,0,curRep);save();toast('عہدہ اوپر چلا گیا')}else toast('یہ پہلے ہی سب سے اوپر ہے')});
$('rDelete').addEventListener('click',()=>{if(!confirm(`یہ عہدہ اور اس کی ${curRep.items.length} رسیدیں ڈیلیٹ ہو جائیں گی۔ پکا؟`))return;state.reports=state.reports.filter(r=>r!==curRep);save();hide('repSheet');hide('report');show('home');curRep=null;renderHome()});

// ---------- invoice form ----------
const F={date:'fDate',invNo:'fInvNo',name:'fName',desc:'fDesc',vatNo:'fVatNo',after:'fAfter',before:'fBefore',tax:'fTax'};
function setFlag(k,kind,text){const l=document.querySelector(`label.f[data-k="${k}"]`);if(!l)return;l.classList.remove('sure','unsure');const em=l.querySelector('em');em.className='';em.textContent='';if(kind){l.classList.add(kind);em.className='tag '+(kind==='sure'?'ok':'warn');em.textContent=text}}
function clearFlags(){Object.keys(F).forEach(k=>setFlag(k,null))}
function status(msg,kind){const s=$('fStatus');if(!msg){s.classList.add('hidden');return}s.textContent=msg;s.className='status '+(kind||'');}
function resetForm(){editItem=null;$('fPreview').classList.add('hidden');$('fPreview').src='';hide('fOcrWrap');status('')}
function fillForm(v){for(const [k,id] of Object.entries(F)){let val=v[k];if(['after','before','tax'].includes(k))val=(val===null||val===undefined||val==='')?'':money(val);$(id).value=val??''}$('fRate').value=String(v.rate??15);$('fHl').checked=!!v.highlight;checkSum()}
function openForm(item,preset){
  resetForm();clearFlags();editItem=item||null;
  const rep=curRep;
  if(item){fillForm(Object.assign({},item,{rate:rateOf(item)===0?0:15}));$('fHead').textContent='رسید ایڈٹ کریں';show('fDelete');hide('fSaveNext');$('fPos').value=rep.items.indexOf(item)+1}
  else{fillForm(Object.assign({date:today(),rate:15},preset||{}));$('fHead').textContent='نئی رسید';hide('fDelete');show('fSaveNext');$('fPos').value=rep.items.length+1}
  $('fPos').max=rep.items.length+(item?0:1);
  show('formSheet');$('formSheet').scrollTop=0;
}
function recalc(from){
  const rate=Number($('fRate').value),after=parseNum($('fAfter').value),before=parseNum($('fBefore').value),tax=parseNum($('fTax').value);
  if(from==='after'||from==='rate'){if(after!==null){const b=rate?r2(after/(1+rate/100)):after;$('fBefore').value=money(b);$('fTax').value=money(r2(after-b))}}
  else if(from==='before'){if(before!==null){const t=r2(before*rate/100);$('fTax').value=money(t);$('fAfter').value=money(before+t)}}
  else if(from==='tax'){if(before!==null&&tax!==null)$('fAfter').value=money(before+tax)}
  checkSum();
}
function checkSum(){const a=parseNum($('fAfter').value),b=parseNum($('fBefore').value),t=parseNum($('fTax').value),el=$('fCheck');if(a===null||b===null||t===null){el.textContent='';return}if(Math.abs(r2(b+t)-r2(a))<0.006){el.textContent='✓ قبل الضريبة + الضريبة = بعد الضريبة';el.style.color='var(--ok)'}else{el.textContent=`⚠ ${money(b)} + ${money(t)} = ${money(b+t)} ، بعد الضريبة ${money(a)} ہے`;el.style.color='var(--bad)'}}
$('fAfter').addEventListener('input',()=>recalc('after'));
$('fBefore').addEventListener('input',()=>recalc('before'));
$('fTax').addEventListener('input',()=>recalc('tax'));
$('fRate').addEventListener('change',()=>recalc('rate'));
Object.entries(F).forEach(([k,id])=>$(id).addEventListener('input',()=>{const l=document.querySelector(`label.f[data-k="${k}"]`);if(l&&l.classList.contains('unsure'))setFlag(k,'sure','آپ نے چیک کیا')}));
function readForm(){return {date:$('fDate').value,invNo:$('fInvNo').value.trim(),name:$('fName').value.trim(),desc:$('fDesc').value.trim(),vatNo:$('fVatNo').value.trim(),after:r2(parseNum($('fAfter').value)||0),before:r2(parseNum($('fBefore').value)||0),tax:r2(parseNum($('fTax').value)||0),highlight:$('fHl').checked}}
function findDuplicate(v,skip){for(const rep of state.reports)for(const it of rep.items){if(it===skip)continue;const sameAmt=Math.abs((it.after||0)-v.after)<0.006;if(!sameAmt)continue;if(v.invNo&&v.invNo!=='0'&&it.invNo===v.invNo&&(it.vatNo||'')===(v.vatNo||''))return {rep,it};if(v.vatNo&&v.vatNo!=='0'&&it.vatNo===v.vatNo&&it.date===v.date&&Math.abs((it.tax||0)-v.tax)<0.006)return {rep,it}}return null}
function saveForm(next){
  const v=readForm();
  if(!v.date){alert('تاریخ لکھیں');$('fDate').focus();return}
  if(!(v.after>0)){alert('الاجمالي بعد الضريبة لکھیں');$('fAfter').focus();return}
  if(Math.abs(r2(v.before+v.tax)-v.after)>0.006&&!confirm('قبل الضريبة + الضريبة، بعد الضريبة کے برابر نہیں۔ پھر بھی محفوظ کریں؟'))return;
  const dup=findDuplicate(v,editItem);
  if(dup&&!confirm(`یہ رسید پہلے سے موجود لگتی ہے:\n${dup.it.name} · ${fmtDate(dup.it.date)} · ${money(dup.it.after)}\n(${dup.rep.title||'عہدہ'})\n\nپھر بھی شامل کریں؟`))return;
  const rep=curRep;let item=editItem;
  if(item){Object.assign(item,v);rep.items.splice(rep.items.indexOf(item),1)}else item=Object.assign({id:uid(),source:formSource,added:Date.now()},v);
  let pos=parseInt($('fPos').value,10);if(!(pos>=1))pos=rep.items.length+1;pos=Math.min(pos,rep.items.length+1);
  rep.items.splice(pos-1,0,item);
  save();hide('formSheet');resetForm();renderReport();toast('رسید محفوظ ہو گئی ✓');
  if(next)startScanner();
}
$('fSave').addEventListener('click',()=>saveForm(false));
$('fSaveNext').addEventListener('click',()=>saveForm(true));
$('fDelete').addEventListener('click',()=>{if(!editItem||!confirm('یہ رسید ڈیلیٹ کریں؟'))return;curRep.items.splice(curRep.items.indexOf(editItem),1);save();hide('formSheet');resetForm();renderReport();toast('ڈیلیٹ ہو گئی')});

// Remember how the user wrote a supplier last time (short name and description) by VAT number.
function memoryFor(vatNo){if(!vatNo||vatNo==='0')return null;let best=null;for(const rep of state.reports)for(const it of rep.items)if(it.vatNo===vatNo&&(!best||(it.added||0)>(best.added||0)))best=it;return best}

// Build the form from a QR and/or OCR result. QR values are exact; OCR values are marked for checking.
function openFromRead(qr,ocr,photoUrl,ocrText){
  const v={date:'',invNo:'',name:'',desc:'',vatNo:'',after:null,before:null,tax:null,rate:15};const flags={};
  if(qr){Object.assign(v,{name:qr.name,vatNo:qr.vatNo,date:qr.date,after:qr.after,tax:qr.tax,before:qr.before,rate:qr.tax>0?15:0});['name','vatNo','date','after','tax','before'].forEach(k=>{if(v[k]!==''&&v[k]!==null)flags[k]=['sure','QR ✓']});if(!qr.date)flags.date=['unsure','چیک کریں']}
  if(ocr){for(const k of ['date','invNo','name','desc','vatNo','after','before','tax']){const val=ocr[k];if(val===null||val===undefined||val==='')continue;if(v[k]===''||v[k]===null){v[k]=val;flags[k]=['unsure','تصویر سے ؟']}}if(!qr&&v.after!==null){if(v.tax===null||v.before===null){v.rate=15}else v.rate=v.tax>0?15:0}}
  const mem=memoryFor(v.vatNo);
  if(mem){if(mem.name){v.name=mem.name;flags.name=['sure','پچھلی رسید والا نام']}if(!v.desc&&mem.desc){v.desc=mem.desc;flags.desc=['unsure','پچھلی رسید سے ؟']}}
  formSource=qr?'qr':(ocr?'photo':'manual');
  openForm(null,v);
  if(v.after!==null&&(v.before===null||v.tax===null))recalc('after');
  for(const [k,[kind,txt]] of Object.entries(flags))setFlag(k,kind,txt);
  if(!v.invNo)setFlag('invNo','unsure','لکھیں');if(!v.desc)setFlag('desc','unsure','لکھیں');
  if(photoUrl){$('fPreview').src=photoUrl;show('fPreview')}
  if(ocrText){$('fOcr').textContent=ocrText;show('fOcrWrap')}
  if(qr)status('QR سے نام، ٹیکس نمبر، تاریخ اور رقم درست آ گئے۔ نارنجی خانے چیک کر کے محفوظ کریں۔','ok');
  else if(ocr)status('QR نہیں ملا۔ تصویر سے پڑھا ہے، ہر نارنجی خانہ رسید سے ملا کر چیک کریں۔','warn');
  else status('رسید سے کچھ نہیں پڑھا جا سکا۔ ہاتھ سے لکھ دیں۔','bad');
}
$('manualBtn').addEventListener('click',()=>{formSource='manual';openForm(null)});

// ---------- photo reading ----------
$('photoBtn').addEventListener('click',()=>{$('photoInput').value='';$('photoInput').click()});
$('photoInput').addEventListener('change',async()=>{
  const file=$('photoInput').files[0];if(!file)return;
  busy('رسید پڑھی جا رہی ہے…');
  try{
    const res=await Scan.readPhoto(file,p=>busy(`رسید پڑھی جا رہی ہے… ${p}%`));
    let url='';try{const img=await Scan.imageFromFile(file);url=Scan.canvasFromImage(img,1400).toDataURL('image/jpeg',.8)}catch(e){}
    busy(false);openFromRead(res.qr,res.ocr,url,res.text);
  }catch(e){console.error(e);busy(false);alert('تصویر نہیں پڑھی جا سکی۔ ہاتھ سے لکھ دیں۔');openForm(null)}
});

// ---------- live QR camera ----------
let stream=null,raf=0,scanBusy=false,lastAt=0,frames=0,torch=false,lastRaw='';
function frameCanvas(center,max){const v=$('video');if(!v.videoWidth)return null;const vw=v.videoWidth,vh=v.videoHeight;let sx=0,sy=0,sw=vw,sh=vh;if(center){const side=Math.min(vw,vh)*.7;sx=(vw-side)/2;sy=(vh-side)/2;sw=sh=side}const sc=Math.min(1,max/Math.max(sw,sh)),c=document.createElement('canvas');c.width=Math.round(sw*sc);c.height=Math.round(sh*sc);c.getContext('2d',{willReadFrequently:true}).drawImage(v,sx,sy,sw,sh,0,0,c.width,c.height);return c}
async function startScanner(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){alert('لائیو کیمرا اس لنک پر نہیں چل سکتا۔ "رسید کی تصویر" استعمال کریں۔');return}
  show('scanner');$('scanMsg').textContent='کیمرا کھل رہا ہے…';frames=0;lastRaw='';
  try{
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})}
    catch(e){stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false})}
    const v=$('video');v.srcObject=stream;await v.play();
    $('scanMsg').textContent='رسید کا QR سبز چوکور میں لائیں — خود اسکین ہو جائے گا';
    try{const tr=stream.getVideoTracks()[0],caps=tr.getCapabilities?.()||{};if('torch' in caps)show('torchBtn');const adv=[];if(caps.focusMode?.includes('continuous'))adv.push({focusMode:'continuous'});if(adv.length)await tr.applyConstraints({advanced:adv})}catch(e){}
    const tick=async now=>{
      if(!stream)return;
      if(!scanBusy&&now-lastAt>250){scanBusy=true;lastAt=now;frames++;
        try{
          const c=frameCanvas(true,1100);let raw='';
          if(c){raw=await Scan.tryDecode(c);
            if(!raw&&frames%3===0)raw=await Scan.tryDecode(Scan.enhanceCanvas(c,'contrast'));
            if(!raw&&frames%4===0)raw=await Scan.zxingWasmDecode(Scan.fixedThresholdCanvas(c,frames%8===0?190:170));
            if(!raw&&frames%5===0){const full=frameCanvas(false,1400);if(full)raw=await Scan.tryDecode(full)}}
          if(raw){const qr=Scan.zatcaFields(raw);
            if(qr){const shot=frameCanvas(false,1400);const url=shot?shot.toDataURL('image/jpeg',.8):'';beep();try{navigator.vibrate&&navigator.vibrate([100,50,100])}catch(e){}stopScanner();openFromRead(qr,null,url,'');return}
            else if(raw!==lastRaw){lastRaw=raw;$('scanMsg').textContent='یہ QR سعودی ZATCA والا نہیں۔ "تصویر سے پڑھیں" یا "بغیر QR" دبائیں۔'}}
        }catch(e){console.warn(e)}finally{scanBusy=false}}
      raf=requestAnimationFrame(tick)};
    raf=requestAnimationFrame(tick);
  }catch(e){console.error(e);stopScanner();const n=String(e?.name||'');alert(n==='NotAllowedError'?'کیمرے کی اجازت نہیں ملی۔ فون کی Settings میں اس ایپ/براؤزر کو کیمرا Allow کریں۔':'کیمرا نہیں کھل سکا۔ "رسید کی تصویر" استعمال کریں۔')}
}
function stopScanner(){cancelAnimationFrame(raf);raf=0;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}torch=false;hide('torchBtn');const v=$('video');try{v.pause()}catch(e){}v.srcObject=null;hide('scanner')}
$('scanBtn').addEventListener('click',startScanner);
$('scanClose').addEventListener('click',stopScanner);
$('scanPhotoBtn').addEventListener('click',()=>{stopScanner();$('photoBtn').click()});
$('scanManualBtn').addEventListener('click',()=>{stopScanner();formSource='manual';openForm(null)});
$('torchBtn').addEventListener('click',async()=>{try{torch=!torch;await stream.getVideoTracks()[0].applyConstraints({advanced:[{torch}]})}catch(e){torch=false}});

// ---------- PDF ----------
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error(src));document.head.appendChild(s)})}
function sheetHtml(rep){
  const t=totals(rep);
  const rows=rep.items.map((it,i)=>`<tr><td>${i+1}</td><td class="num">${esc(fmtDate(it.date))}</td><td class="num">${esc(it.invNo||'0')}</td><td>${esc(it.name)}</td><td class="${it.highlight?'y':''}">${esc(it.desc)}</td><td class="num">${esc(it.vatNo||'0')}</td><td class="num">${rateOf(it)}%</td><td class="num">${money(it.before)}</td><td class="num">${money(it.tax)}</td><td class="num">${money(it.after)}</td></tr>`).join('');
  return `<div class="sheetx"><table>
<colgroup><col style="width:3.25%"><col style="width:8.13%"><col style="width:9.11%"><col style="width:15.04%"><col style="width:24.63%"><col style="width:12.2%"><col style="width:5.69%"><col style="width:8.54%"><col style="width:4.88%"><col style="width:8.54%"></colgroup>
<tr class="g"><td colspan="10"></td></tr>
<tr class="ti"><td colspan="10">${esc(rep.title)}</td></tr>
<tr class="hd"><td>م</td><td>التاريخ</td><td>رقم الفاتورة</td><td>الاسم</td><td>بيان</td><td>الرقم الضريبي</td><td>النسبة</td><td>الاجمالي قبل الضريبة</td><td>الضريبة</td><td>الاجمالي بعد الضريبة</td></tr>
<tr class="cat"><td colspan="10">${esc(rep.category||'')}</td></tr>
${rows}
<tr class="tot"><td class="lb" colspan="7">الإجمالي</td><td class="v num">${money(t.before)}</td><td class="v num">${money(t.tax)}</td><td class="v num">${money(t.after)}</td></tr>
<tr class="ft"><td colspan="9">العهده</td><td class="num">${money(t.custody)}</td></tr>
<tr class="ft"><td colspan="9">تنزيل العهده</td><td class="num">${money(t.after)}</td></tr>
<tr class="ft"><td colspan="9">المتبقي</td><td class="num">${money(t.left)}</td></tr>
</table></div>`;
}
let pdfBlob=null,pdfName='';
async function makePdf(reps){
  if(!reps.length){alert('کوئی عہدہ منتخب نہیں');return}
  busy('PDF بن رہی ہے…');
  try{
    await loadScript(base+'vendor/js/html2canvas-1.4.1.min.js');await loadScript(base+'vendor/js/jspdf-2.5.1.umd.min.js');
    try{await document.fonts?.ready}catch(e){}
    const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});
    const PW=210,PH=297,M=10,CW=PW-2*M;let y=M,first=true;
    // Page previews mirror exactly what goes into the PDF (5 px per mm).
    const K=5,pages=[];const newPreview=()=>{const c=document.createElement('canvas');c.width=PW*K;c.height=PH*K;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);pages.push(c)};newPreview();
    const addPage=()=>{doc.addPage();newPreview()};
    const stage=$('pdfStage');
    for(const rep of reps){
      stage.innerHTML=sheetHtml(rep);const el=stage.firstElementChild;
      const scale=2.5,canvas=await html2canvas(el,{scale,backgroundColor:'#ffffff',logging:false,useCORS:false});
      const pxPerMm=canvas.width/CW,top=el.getBoundingClientRect().top;
      const breaks=[...el.querySelectorAll('tr')].map(tr=>Math.round((tr.getBoundingClientRect().bottom-top)*scale));breaks.push(canvas.height);
      let start=0;
      while(start<canvas.height-1){
        let avail=(PH-M-y)*pxPerMm;const rest=canvas.height-start;
        if(rest>avail&&!first&&y>M&&rest<=(PH-2*M)*pxPerMm){addPage();y=M;continue}
        let end=canvas.height;if(rest>avail){end=start;for(const b of breaks)if(b>start&&b-start<=avail)end=b;if(end===start){if(y>M){addPage();y=M;continue}end=Math.min(canvas.height,start+Math.floor(avail))}}
        const part=document.createElement('canvas');part.width=canvas.width;part.height=end-start;part.getContext('2d').drawImage(canvas,0,start,canvas.width,end-start,0,0,canvas.width,end-start);
        const hmm=(end-start)/pxPerMm;doc.addImage(part.toDataURL('image/jpeg',.93),'JPEG',M,y,CW,hmm);
        pages[pages.length-1].getContext('2d').drawImage(part,M*K,y*K,CW*K,hmm*K);
        y+=hmm;start=end;first=false;
        if(start<canvas.height-1){addPage();y=M}
      }
      y+=6;
    }
    stage.innerHTML='';
    pdfBlob=doc.output('blob');
    const names=reps.map(r=>(r.title||'').replace(/[\\/:*?"<>|()]/g,'').trim().split(/\s+/).slice(0,3).join(' ')).filter(Boolean);
    pdfName=(names[0]||'عهدة')+' '+today()+'.pdf';
    $('pdfPages').innerHTML=pages.map(c=>c.toDataURL('image/jpeg',.85)).map(src=>`<img src="${src}" alt="">`).join('');
    busy(false);show('pdfSheet');$('pdfSheet').scrollTop=0;
  }catch(e){console.error(e);busy(false);alert('PDF نہیں بن سکی: '+e.message)}
}
$('repPdfBtn').addEventListener('click',()=>makePdf([curRep]));
$('homePdfBtn').addEventListener('click',()=>makePdf(state.reports.filter(r=>r.pick!==false)));
async function shareOrSave(blob,name,type,shareFirst){
  const file=new File([blob],name,{type});
  if(shareFirst&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('pdfShare').addEventListener('click',()=>pdfBlob&&shareOrSave(pdfBlob,pdfName,'application/pdf',true));
$('pdfSave').addEventListener('click',()=>pdfBlob&&shareOrSave(pdfBlob,pdfName,'application/pdf',false));

// ---------- backup / settings ----------
$('menuBtn').addEventListener('click',()=>{$('dateFmt').value=state.settings.dateFmt;$('verTxt').textContent='ورژن '+VERSION;show('setSheet')});
$('backupBtn').addEventListener('click',()=>$('menuBtn').click());
$('dateFmt').addEventListener('change',()=>{state.settings.dateFmt=$('dateFmt').value;save();toast('محفوظ ہو گیا')});
$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,1)],{type:'application/json'});shareOrSave(blob,`عهدة-بیک-اپ-${today()}.json`,'application/json',true)});
$('importBtn').addEventListener('click',()=>{$('importInput').value='';$('importInput').click()});
$('importInput').addEventListener('change',async()=>{
  const file=$('importInput').files[0];if(!file)return;
  try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.reports))throw new Error('format');
    const n=data.reports.reduce((s,r)=>s+(r.items?.length||0),0);
    if(!confirm(`بیک اپ میں ${data.reports.length} عہدے اور ${n} رسیدیں ہیں۔ فون کا موجودہ ڈیٹا ان سے بدل دیا جائے؟`))return;
    state={reports:data.reports,settings:Object.assign(state.settings,data.settings||{})};save();renderHome();hide('setSheet');toast('بیک اپ واپس آ گیا ✓')
  }catch(e){alert('یہ درست بیک اپ فائل نہیں')}
});

// ---------- start ----------
renderHome();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__app={state:()=>state,pdf:()=>pdfBlob,openFromRead,sheetHtml,makePdf,save,renderHome,openReport};
})();
