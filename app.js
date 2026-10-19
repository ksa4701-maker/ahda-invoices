(function(){
'use strict';
const VERSION='1.2.0';
const KEY='ahda_state_v1';
const $=id=>document.getElementById(id);
const base=new URL('.',location.href).href;

// ---------- state ----------
let state={reports:[],settings:{dateFmt:'d-m-yyyy',lastTitle:'',lastCat:'مستلزمات تشغيل',lang:''}};
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Array.isArray(s.reports))state=Object.assign(state,s,{settings:Object.assign(state.settings,s.settings||{})})}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){alert(t('saveFail')+e.message)}}
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
let curRep=null,editItem=null,formSource='manual',formToken=0,qrTime='';

// ---------- language ----------
let lang=state.settings.lang||(/^ar/i.test(navigator.language||'')?'ar':'en');
function t(k,vars){let s=(I18N[lang]&&I18N[lang][k])??I18N.en[k]??k;if(vars)s=s.replace(/\{(\w+)\}/g,(m,v)=>vars[v]??m);return s}
function applyLang(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  $('langBtn').textContent=lang==='ar'?'EN':'ع';$('langSel').value=lang;
  document.title=lang==='ar'?'عهدة فواتير':'Custody Invoices';
  renderHome();if(curRep)renderReport();if(typeof renderSaved==='function'&&state.saved)renderSaved();
}
function setLang(l){lang=l;state.settings.lang=l;save();applyLang()}
$('langBtn').addEventListener('click',()=>setLang(lang==='ar'?'en':'ar'));
$('langSel').addEventListener('change',()=>setLang($('langSel').value));

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
function toast(msg,ms=2600){const el=$('toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),ms)}
function busy(msg){if(msg===false){$('busy').classList.add('hidden');return}$('busyTxt').textContent=msg;$('busy').classList.remove('hidden')}
function show(id){$(id).classList.remove('hidden')}
function hide(id){$(id).classList.add('hidden')}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{const s=b.closest('section');s.classList.add('hidden');if(s.id==='formSheet')resetForm()}));
function beep(){try{const c=beep.ctx||(beep.ctx=new (window.AudioContext||window.webkitAudioContext)()),o=c.createOscillator(),g=c.createGain();o.frequency.value=1040;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.2,c.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.18)}catch(e){}}

// ---------- home ----------
function renderHome(){
  const list=$('repList');
  if(!state.reports.length){list.innerHTML=`<div class="empty">${t('noReports')}</div>`;return}
  list.innerHTML=state.reports.map(rep=>{const s=totals(rep);return `<div class="card rep" data-id="${rep.id}">
    <input type="checkbox" data-pick="${rep.id}" ${rep.pick!==false?'checked':''} aria-label="PDF">
    <div style="flex:1;min-width:0"><div class="t" dir="auto">${esc(rep.title||t('untitled'))}</div>
    <div class="muted">${t('invoices',{n:rep.items.length})}</div>
    <div class="nums"><div><span>${t('custody')}</span><b>${money(s.custody)}</b></div><div><span>${t('spent')}</span><b>${money(s.after)}</b></div><div><span>${t('left')}</span><b class="${s.left<0?'neg':''}">${money(s.left)}</b></div></div></div></div>`}).join('');
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
  const rep=curRep,s=totals(rep);
  $('repTitle').textContent=rep.title||t('untitled');
  $('sCustody').textContent=money(s.custody);$('sSpent').textContent=money(s.after);$('sLeft').textContent=money(s.left);$('sLeft').className=s.left<0?'neg':'';
  $('sCount').textContent=t('countLine',{n:rep.items.length,b:money(s.before),t:money(s.tax)});
  $('itemList').innerHTML=rep.items.length?rep.items.map((it,i)=>`<div class="item ${it.highlight?'hl':''}" data-i="${i}">
    <div class="n">${i+1}</div>
    <div class="m"><div dir="auto">${esc(it.name||'—')}${!it.invNo||it.invNo==='0'?`<span class="flag">${t('noInvNo')}</span>`:''}</div><div class="muted d" dir="auto">${esc(fmtDate(it.date))} · ${esc(it.invNo||'0')} · ${esc(it.desc||'')}</div></div>
    <div class="a">${money(it.after)}</div></div>`).join(''):`<div class="empty">${t('noItems')}</div>`;
}
$('itemList').addEventListener('click',e=>{const row=e.target.closest('.item');if(row)openForm(curRep.items[+row.dataset.i])});
$('backBtn').addEventListener('click',()=>{hide('report');show('home');curRep=null;renderHome()});
function openRepSheet(){const rep=curRep;$('rTitle').value=rep.title||'';$('rCustody').value=rep.custody?money(rep.custody):'';$('rCat').value=rep.category||'';show('repSheet')}
$('repEditBtn').addEventListener('click',openRepSheet);
$('rSave').addEventListener('click',()=>{const rep=curRep;rep.title=$('rTitle').value.trim();rep.custody=r2(parseNum($('rCustody').value)||0);rep.category=$('rCat').value.trim();if(rep.title)state.settings.lastTitle=rep.title;if(rep.category)state.settings.lastCat=rep.category;save();hide('repSheet');renderReport();toast(t('saved'))});
$('rUp').addEventListener('click',()=>{const i=state.reports.indexOf(curRep);if(i>0){state.reports.splice(i,1);state.reports.splice(i-1,0,curRep);save();toast(t('movedUp'))}else toast(t('alreadyTop'))});
$('rDelete').addEventListener('click',()=>{if(!confirm(t('confirmDelRep',{n:curRep.items.length})))return;state.reports=state.reports.filter(r=>r!==curRep);save();hide('repSheet');hide('report');show('home');curRep=null;renderHome()});

// ---------- invoice form ----------
const F={date:'fDate',invNo:'fInvNo',name:'fName',desc:'fDesc',vatNo:'fVatNo',after:'fAfter',before:'fBefore',tax:'fTax'};
function setFlag(k,kind,text){const l=document.querySelector(`label.f[data-k="${k}"]`);if(!l)return;l.classList.remove('sure','unsure');const em=l.querySelector('em');em.className='';em.textContent='';if(kind){l.classList.add(kind);em.className='tag '+(kind==='sure'?'ok':'warn');em.textContent=text}}
function clearFlags(){Object.keys(F).forEach(k=>setFlag(k,null))}
function status(msg,kind,spin){const s=$('fStatus');if(!msg){s.classList.add('hidden');return}s.innerHTML=(spin?'<span class="spin sm"></span>':'')+esc(msg);s.className='status '+(kind||'');}
function resetForm(){editItem=null;formToken++;$('fPreview').classList.add('hidden');$('fPreview').src='';hide('fOcrWrap');status('')}
function fillForm(v){for(const [k,id] of Object.entries(F)){let val=v[k];if(['after','before','tax'].includes(k))val=(val===null||val===undefined||val==='')?'':money(val);$(id).value=val??''}$('fRate').value=String(v.rate??15);$('fHl').checked=!!v.highlight;checkSum()}
function openForm(item,preset){
  resetForm();clearFlags();editItem=item||null;
  const rep=curRep;
  if(item){fillForm(Object.assign({},item,{rate:rateOf(item)===0?0:15}));$('fHead').textContent=t('editInvoice');show('fDelete');hide('fSaveNext');$('fPos').value=rep.items.indexOf(item)+1}
  else{fillForm(Object.assign({date:today(),rate:15},preset||{}));$('fHead').textContent=t('newInvoice');hide('fDelete');show('fSaveNext');$('fPos').value=rep.items.length+1}
  $('fPos').max=rep.items.length+(item?0:1);
  show('formSheet');$('formSheet').scrollTop=0;
  return formToken;
}
function recalc(from){
  const rate=Number($('fRate').value),after=parseNum($('fAfter').value),before=parseNum($('fBefore').value),tax=parseNum($('fTax').value);
  if(from==='after'||from==='rate'){if(after!==null){const b=rate?r2(after/(1+rate/100)):after;$('fBefore').value=money(b);$('fTax').value=money(r2(after-b))}}
  else if(from==='before'){if(before!==null){const x=r2(before*rate/100);$('fTax').value=money(x);$('fAfter').value=money(before+x)}}
  else if(from==='tax'){if(before!==null&&tax!==null)$('fAfter').value=money(before+tax)}
  checkSum();
}
function checkSum(){const a=parseNum($('fAfter').value),b=parseNum($('fBefore').value),x=parseNum($('fTax').value),el=$('fCheck');if(a===null||b===null||x===null){el.textContent='';return}if(Math.abs(r2(b+x)-r2(a))<0.006){el.textContent=t('sumOk');el.style.color='var(--ok)'}else{el.textContent=t('sumBad',{b:money(b),t:money(x),s:money(b+x),a:money(a)});el.style.color='var(--bad)'}}
$('fAfter').addEventListener('input',()=>recalc('after'));
$('fBefore').addEventListener('input',()=>recalc('before'));
$('fTax').addEventListener('input',()=>recalc('tax'));
$('fRate').addEventListener('change',()=>recalc('rate'));
const touched=new Set();
Object.entries(F).forEach(([k,id])=>$(id).addEventListener('input',()=>{touched.add(k);const l=document.querySelector(`label.f[data-k="${k}"]`);if(l&&l.classList.contains('unsure'))setFlag(k,'sure',t('tagChecked'))}));
function readForm(){return {date:$('fDate').value,invNo:$('fInvNo').value.trim(),name:$('fName').value.trim(),desc:$('fDesc').value.trim(),vatNo:$('fVatNo').value.trim(),after:r2(parseNum($('fAfter').value)||0),before:r2(parseNum($('fBefore').value)||0),tax:r2(parseNum($('fTax').value)||0),highlight:$('fHl').checked}}
// The same invoice may never be added twice (in any custody).
const realNo=s=>{s=String(s||'').trim();return s&&s.replace(/0/g,'')!==''?s.replace(/\s/g,'').toUpperCase():''};
function isSameInvoice(a,b){
  const va=realNo(a.vatNo),vb=realNo(b.vatNo),ia=realNo(a.invNo),ib=realNo(b.invNo),amt=Math.abs((a.after||0)-(b.after||0))<0.006;
  if(ia&&ib)return ia===ib&&va===vb;                                   // same seller + same invoice number
  if(a.qrTime&&b.qrTime)return va===vb&&a.qrTime===b.qrTime&&amt;      // same QR (seller + exact time + total)
  if(va&&va===vb)return a.date===b.date&&amt&&Math.abs((a.tax||0)-(b.tax||0))<0.006;
  return !va&&!vb&&!ia&&!ib&&a.date===b.date&&amt&&(a.name||'')===(b.name||'')&&(a.desc||'')===(b.desc||'');
}
function findDuplicate(v,skip){for(const rep of state.reports)for(const it of rep.items){if(it===skip)continue;if(isSameInvoice(v,it))return {rep,it}}return null}
function saveForm(next){
  const v=readForm();
  if(!v.date){alert(t('needDate'));$('fDate').focus();return}
  if(!(v.after>0)){alert(t('needTotal'));$('fAfter').focus();return}
  if(Math.abs(r2(v.before+v.tax)-v.after)>0.006&&!confirm(t('confirmSum')))return;
  v.qrTime=editItem?(editItem.qrTime||''):qrTime;
  const dup=findDuplicate(v,editItem);
  if(dup){const n=dup.rep.items.indexOf(dup.it)+1;alert(t('dupBlocked',{d:`${dup.it.name} · ${dup.it.invNo||'0'} · ${fmtDate(dup.it.date)} · ${money(dup.it.after)}`,r:dup.rep.title||t('untitled'),n}));return}
  const rep=curRep;let item=editItem;
  if(item){Object.assign(item,v);rep.items.splice(rep.items.indexOf(item),1)}else item=Object.assign({id:uid(),source:formSource,added:Date.now()},v);
  let pos=parseInt($('fPos').value,10);if(!(pos>=1))pos=rep.items.length+1;pos=Math.min(pos,rep.items.length+1);
  rep.items.splice(pos-1,0,item);
  save();hide('formSheet');resetForm();renderReport();toast(t('invSaved'));
  if(next)startScanner();
}
$('fSave').addEventListener('click',()=>saveForm(false));
$('fSaveNext').addEventListener('click',()=>saveForm(true));
$('fDelete').addEventListener('click',()=>{if(!editItem||!confirm(t('confirmDelInv')))return;curRep.items.splice(curRep.items.indexOf(editItem),1);save();hide('formSheet');resetForm();renderReport();toast(t('deleted'))});

// Remember how the user wrote a supplier last time (short name and description) by VAT number.
function memoryFor(vatNo){if(!vatNo||vatNo==='0')return null;let best=null;for(const rep of state.reports)for(const it of rep.items)if(it.vatNo===vatNo&&(!best||(it.added||0)>(best.added||0)))best=it;return best}

// Build the form from a QR and/or OCR result. QR values are exact; OCR values are marked for checking.
function openFromRead(qr,ocr,photoUrl,ocrText){
  const v={date:'',invNo:'',name:'',desc:'',vatNo:'',after:null,before:null,tax:null,rate:15};const flags={};
  if(qr){const exact=qr.kind==='zatca';
    for(const k of ['name','vatNo','date','after','tax','before','invNo']){const val=qr[k];if(val===null||val===undefined||val==='')continue;v[k]=val;flags[k]=exact?['sure',t('tagQr')]:['unsure',t('tagQrOther')]}
    if(v.tax!==null)v.rate=v.tax>0?15:0;
    if(exact&&!qr.date)flags.date=['unsure',t('tagCheck')];
    if(!v.date)v.date=today()}
  if(ocr){for(const k of ['date','invNo','name','desc','vatNo','after','before','tax']){const val=ocr[k];if(val===null||val===undefined||val==='')continue;if(v[k]===''||v[k]===null){v[k]=val;flags[k]=['unsure',t('tagPhoto')]}}if(!qr&&v.after!==null){if(v.tax===null||v.before===null){v.rate=15}else v.rate=v.tax>0?15:0}}
  const mem=memoryFor(v.vatNo);
  if(mem){if(mem.name){v.name=mem.name;flags.name=['sure',t('tagSavedName')]}if(!v.desc&&mem.desc){v.desc=mem.desc;flags.desc=['unsure',t('tagLast')]}}
  formSource=qr?'qr':(ocr?'photo':'manual');
  touched.clear();qrTime=qr?.kind==='zatca'?(qr.rawDate||''):'';
  const token=openForm(null,v);
  if(v.after!==null&&(v.before===null||v.tax===null))recalc('after');
  for(const [k,[kind,txt]] of Object.entries(flags))setFlag(k,kind,txt);
  if(!v.invNo)setFlag('invNo','unsure',t('tagEnter'));if(!v.desc)setFlag('desc','unsure',t('tagEnter'));
  if(photoUrl){$('fPreview').src=photoUrl;show('fPreview')}
  if(ocrText){$('fOcr').textContent=ocrText;show('fOcrWrap')}
  if(qr&&qr.kind!=='zatca')status(ocr?t('stOtherQrDone'):t('stOtherQr'),'warn');
  else if(qr&&ocr)status(v.invNo?t('stQrInvFound'):t('stQrInvMissing'),v.invNo?'ok':'warn');
  else if(qr)status(t('stQr'),'ok');
  else if(ocr)status(t('stOcr'),'warn');
  else status(t('stNone'),'bad');
  return token;
}
// After a live QR scan: the QR never contains the invoice number, so read it from the picture in the background.
async function fillFromPicture(token,canvas){
  status(t('stQrReading'),'ok',true);
  try{
    const {ocr,text}=await Scan.readText(canvas);
    if(token!==formToken)return; // the form was closed or another invoice was opened
    if(text){$('fOcr').textContent=text;show('fOcrWrap')}
    // Fill every field that is still empty and that the user has not typed in.
    for(const k of ['invNo','desc','name','vatNo','date']){const val=ocr[k];if(!val||touched.has(k)||$(F[k]).value.trim())continue;$(F[k]).value=val;setFlag(k,'unsure',t('tagPhoto'))}
    if(ocr.after!==null&&!touched.has('after')&&!$('fAfter').value.trim()){
      $('fAfter').value=money(ocr.after);setFlag('after','unsure',t('tagPhoto'));
      if(ocr.tax!==null&&ocr.before!==null){$('fRate').value=ocr.tax>0?'15':'0';$('fTax').value=money(ocr.tax);$('fBefore').value=money(ocr.before);setFlag('tax','unsure',t('tagPhoto'));setFlag('before','unsure',t('tagPhoto'));checkSum()}else recalc('after')}
    const mem=memoryFor($('fVatNo').value.trim());if(mem&&!touched.has('desc')&&!$('fDesc').value.trim()&&mem.desc){$('fDesc').value=mem.desc;setFlag('desc','unsure',t('tagLast'))}
    const hasInv=!!$('fInvNo').value.trim();
    status(hasInv?t('stQrInvFound'):t('stQrInvMissing'),hasInv?'ok':'warn');
  }catch(e){console.error(e);if(token===formToken)status(t('stQrInvMissing'),'warn')}
}
$('manualBtn').addEventListener('click',()=>{formSource='manual';qrTime='';touched.clear();openForm(null)});

// ---------- photo reading ----------
$('photoBtn').addEventListener('click',()=>{$('photoInput').value='';$('photoInput').click()});
$('photoInput').addEventListener('change',async()=>{
  const file=$('photoInput').files[0];if(!file)return;
  busy(t('reading'));
  try{
    const res=await Scan.readPhoto(file,p=>busy(t('readingPct',{p})));
    let url='';try{const img=await Scan.imageFromFile(file);url=Scan.canvasFromImage(img,1400).toDataURL('image/jpeg',.8)}catch(e){}
    busy(false);openFromRead(res.qr,res.ocr,url,res.text);
  }catch(e){console.error(e);busy(false);alert(t('photoFail'));openForm(null)}
});

// ---------- live QR camera ----------
let stream=null,raf=0,scanBusy=false,lastAt=0,frames=0,torch=false,lastRaw='';
function frameCanvas(center,max){const v=$('video');if(!v.videoWidth)return null;const vw=v.videoWidth,vh=v.videoHeight;let sx=0,sy=0,sw=vw,sh=vh;if(center){const side=Math.min(vw,vh)*.7;sx=(vw-side)/2;sy=(vh-side)/2;sw=sh=side}const sc=Math.min(1,max/Math.max(sw,sh)),c=document.createElement('canvas');c.width=Math.round(sw*sc);c.height=Math.round(sh*sc);c.getContext('2d',{willReadFrequently:true}).drawImage(v,sx,sy,sw,sh,0,0,c.width,c.height);return c}
// Best still picture for reading text: a real photo when the phone supports it, otherwise the sharpest video frame.
async function captureStill(){
  const fallback=frameCanvas(false,4000);
  try{
    if(!('ImageCapture' in window)||!stream)return fallback;
    const ic=new ImageCapture(stream.getVideoTracks()[0]);
    const blob=await Promise.race([ic.takePhoto(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),2500))]);
    const img=await Scan.imageFromFile(blob);return Scan.canvasFromImage(img,3600);
  }catch(e){return fallback}
}
async function startScanner(){
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){alert(t('camNoSecure'));return}
  show('scanner');$('scanMsg').textContent=t('camOpening');frames=0;lastRaw='';
  try{
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{exact:'environment'},width:{ideal:2560},height:{ideal:1440}},audio:false})}
    catch(e){stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1440}},audio:false})}
    const v=$('video');v.srcObject=stream;await v.play();
    $('scanMsg').textContent=t('camAim');
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
          if(raw){const qr=Scan.qrFields(raw);
            if(qr&&raw!==lastRaw){lastRaw=raw;beep();try{navigator.vibrate&&navigator.vibrate([100,50,100])}catch(e){}
              const still=await captureStill();stopScanner();
              const url=still?Scan.canvasFromImage(still,1400).toDataURL('image/jpeg',.8):'';
              const token=openFromRead(qr,null,url,'');
              if(still)fillFromPicture(token,still);
              return}}
        }catch(e){console.warn(e)}finally{scanBusy=false}}
      raf=requestAnimationFrame(tick)};
    raf=requestAnimationFrame(tick);
  }catch(e){console.error(e);stopScanner();alert(String(e?.name||'')==='NotAllowedError'?t('camDenied'):t('camFail'))}
}
function stopScanner(){cancelAnimationFrame(raf);raf=0;if(stream){stream.getTracks().forEach(x=>x.stop());stream=null}torch=false;hide('torchBtn');const v=$('video');try{v.pause()}catch(e){}v.srcObject=null;hide('scanner')}
$('scanBtn').addEventListener('click',startScanner);
$('scanClose').addEventListener('click',stopScanner);
$('scanPhotoBtn').addEventListener('click',()=>{stopScanner();$('photoBtn').click()});
$('scanManualBtn').addEventListener('click',()=>{stopScanner();formSource='manual';qrTime='';touched.clear();openForm(null)});
$('torchBtn').addEventListener('click',async()=>{try{torch=!torch;await stream.getVideoTracks()[0].applyConstraints({advanced:[{torch}]})}catch(e){torch=false}});

// ---------- PDF (always the Arabic custody format) ----------
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error(src));document.head.appendChild(s)})}
function sheetHtml(rep){
  const s=totals(rep);
  const rows=rep.items.map((it,i)=>`<tr><td>${i+1}</td><td class="num">${esc(fmtDate(it.date))}</td><td class="num">${esc(it.invNo||'0')}</td><td>${esc(it.name)}</td><td class="${it.highlight?'y':''}">${esc(it.desc)}</td><td class="num">${esc(it.vatNo||'0')}</td><td class="num">${rateOf(it)}%</td><td class="num">${money(it.before)}</td><td class="num">${money(it.tax)}</td><td class="num">${money(it.after)}</td></tr>`).join('');
  return `<div class="sheetx"><table>
<colgroup><col style="width:3.25%"><col style="width:8.13%"><col style="width:9.11%"><col style="width:15.04%"><col style="width:24.63%"><col style="width:12.2%"><col style="width:5.69%"><col style="width:8.54%"><col style="width:4.88%"><col style="width:8.54%"></colgroup>
<tr class="g"><td colspan="10"></td></tr>
<tr class="ti"><td colspan="10">${esc(rep.title)}</td></tr>
<tr class="hd"><td>م</td><td>التاريخ</td><td>رقم الفاتورة</td><td>الاسم</td><td>بيان</td><td>الرقم الضريبي</td><td>النسبة</td><td>الاجمالي قبل الضريبة</td><td>الضريبة</td><td>الاجمالي بعد الضريبة</td></tr>
<tr class="cat"><td colspan="10">${esc(rep.category||'')}</td></tr>
${rows}
<tr class="tot"><td class="lb" colspan="7">الإجمالي</td><td class="v num">${money(s.before)}</td><td class="v num">${money(s.tax)}</td><td class="v num">${money(s.after)}</td></tr>
<tr class="ft"><td colspan="9">العهده</td><td class="num">${money(s.custody)}</td></tr>
<tr class="ft"><td colspan="9">تنزيل العهده</td><td class="num">${money(s.after)}</td></tr>
<tr class="ft"><td colspan="9">المتبقي</td><td class="num">${money(s.left)}</td></tr>
</table></div>`;
}
// Builds the PDF (same layout as the original custody sheet) and returns it with page previews.
async function buildPdf(reps){
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
    return {pdf:doc.output('blob'),pages:pages.map(c=>c.toDataURL('image/jpeg',.85))};
}
async function buildWord(reps){await loadScript(base+'vendor/js/jszip-3.10.1.min.js');return buildDocx(reps,{money,fmtDate,totals,rateOf})}

// ---------- saved files (PDF + Word, kept with their data so they can be edited and rebuilt) ----------
const FDB='ahda-files';
function idb(mode,fn){return new Promise((res,rej)=>{const open=indexedDB.open(FDB,1);open.onupgradeneeded=()=>open.result.createObjectStore('files');open.onerror=()=>rej(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('files',mode),req=fn(tx.objectStore('files'));tx.oncomplete=()=>{db.close();res(req&&req.result)};tx.onerror=()=>{db.close();rej(tx.error)}}})}
const putFiles=(id,files)=>idb('readwrite',st=>st.put(files,id));
const getFiles=id=>idb('readonly',st=>st.get(id)).catch(()=>null);
const delFiles=id=>idb('readwrite',st=>st.delete(id)).catch(()=>{});
if(!Array.isArray(state.saved))state.saved=[];
const clone=o=>JSON.parse(JSON.stringify(o));
function fileBase(reps){const names=reps.map(r=>(r.title||'').replace(/[\\/:*?"<>|()]/g,'').trim().split(/\s+/).slice(0,3).join(' ')).filter(Boolean);return (names[0]||'عهدة')+' '+today()}
let cur={entry:null,pdf:null,docx:null};
// Make PDF + Word for these custodies and keep them in Saved files (savedId = rebuild an existing entry).
async function makeFiles(reps,savedId){
  if(!reps.length){alert(t('noSelection'));return}
  busy(t('pdfMaking'));
  try{
    const {pdf,pages}=await buildPdf(reps);const docx=await buildWord(reps);
    let entry=savedId&&state.saved.find(s=>s.id===savedId);
    if(entry){entry.updated=Date.now();entry.snapshot=clone(reps);entry.reportIds=reps.map(r=>r.id);entry.name=fileBase(reps)}
    else{entry={id:uid(),name:fileBase(reps),created:Date.now(),updated:Date.now(),reportIds:reps.map(r=>r.id),snapshot:clone(reps)};state.saved.unshift(entry)}
    entry.count=reps.reduce((s,r)=>s+r.items.length,0);entry.total=r2(reps.reduce((s,r)=>s+totals(r).after,0));
    save();try{await putFiles(entry.id,{pdf,docx})}catch(e){console.warn('file store',e)}
    cur={entry,pdf,docx};
    $('pdfPages').innerHTML=pages.map(src=>`<img src="${src}" alt="">`).join('');
    busy(false);show('pdfSheet');$('pdfSheet').scrollTop=0;toast(t('fileSaved'));renderSaved();
  }catch(e){console.error(e);busy(false);alert(t('pdfFail')+e.message)}
}
// Get the stored files of a saved entry; rebuild them from its saved data when missing (e.g. after a backup restore).
async function filesOf(entry){
  let f=await getFiles(entry.id);
  if(!f||!f.pdf||!f.docx){busy(t('pdfMaking'));try{f={pdf:(await buildPdf(entry.snapshot)).pdf,docx:await buildWord(entry.snapshot)};await putFiles(entry.id,f).catch(()=>{})}finally{busy(false)}}
  return f;
}
function renderSaved(){
  const list=$('savedList');if(!list)return;
  if(!state.saved.length){list.innerHTML=`<div class="empty">${t('noSaved')}</div>`;return}
  list.innerHTML=state.saved.map(s=>{const d=new Date(s.updated||s.created);return `<div class="card" data-sid="${s.id}">
    <div class="t" dir="auto" style="font-weight:600">${esc(s.name)}</div>
    <div class="muted">${d.toLocaleDateString(lang==='ar'?'ar-SA-u-ca-gregory':'en-GB')} ${d.toLocaleTimeString(lang==='ar'?'ar-SA':'en-GB',{hour:'2-digit',minute:'2-digit'})} · ${t('invoices',{n:s.count||0})} · ${money(s.total||0)}</div>
    <div class="acts">
      <button class="btn" data-act="pdf">PDF</button><button class="btn" data-act="docx">Word</button>
      <button class="btn" data-act="edit">${t('edit')}</button><button class="btn" data-act="rebuild">${t('rebuild')}</button>
      <button class="btn danger" data-act="del">${t('delete')}</button></div></div>`}).join('');
}
$('savedList').addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const entry=state.saved.find(s=>s.id===b.closest('[data-sid]').dataset.sid);if(!entry)return;
  const act=b.dataset.act;
  if(act==='pdf'||act==='docx'){const f=await filesOf(entry);if(act==='pdf')shareOrSave(f.pdf,entry.name+'.pdf','application/pdf',true);else shareOrSave(f.docx,entry.name+'.docx',DOCX,true)}
  else if(act==='edit'){const reps=restoreReports(entry);hide('savedSheet');if(reps.length===1)openReport(reps[0].id);else{hide('report');show('home');renderHome()}toast(t('editHint'),5000)}
  else if(act==='rebuild'){if(!confirm(t('rebuildAsk')))return;hide('savedSheet');await makeFiles(restoreReports(entry),entry.id)}
  else if(act==='del'){if(!confirm(t('delFileAsk',{n:entry.name})))return;state.saved=state.saved.filter(s=>s!==entry);save();await delFiles(entry.id);renderSaved();toast(t('deleted'))}
});
// The custodies a saved file was made from; if one was deleted meanwhile it is brought back from the file's data.
function restoreReports(entry){
  return entry.reportIds.map((id,i)=>{let r=state.reports.find(x=>x.id===id);if(!r){r=clone(entry.snapshot[i]);r.id=id;state.reports.push(r);save()}return r});
}
$('savedBtn').addEventListener('click',()=>{renderSaved();show('savedSheet')});
$('repPdfBtn').addEventListener('click',()=>makeFiles([curRep]));
$('homePdfBtn').addEventListener('click',()=>makeFiles(state.reports.filter(r=>r.pick!==false)));
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function shareOrSave(blob,name,type,shareFirst){
  const file=new File([blob],name,{type});
  if(shareFirst&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('pdfShare').addEventListener('click',()=>cur.pdf&&shareOrSave(cur.pdf,cur.entry.name+'.pdf','application/pdf',true));
$('docxShare').addEventListener('click',()=>cur.docx&&shareOrSave(cur.docx,cur.entry.name+'.docx',DOCX,true));
$('pdfSave').addEventListener('click',()=>cur.pdf&&shareOrSave(cur.pdf,cur.entry.name+'.pdf','application/pdf',false));
$('docxSave').addEventListener('click',()=>cur.docx&&shareOrSave(cur.docx,cur.entry.name+'.docx',DOCX,false));

// ---------- backup / settings ----------
$('menuBtn').addEventListener('click',()=>{$('dateFmt').value=state.settings.dateFmt;$('langSel').value=lang;$('verTxt').textContent=t('version')+' '+VERSION;show('setSheet')});
$('backupBtn').addEventListener('click',()=>$('menuBtn').click());
$('dateFmt').addEventListener('change',()=>{state.settings.dateFmt=$('dateFmt').value;save();toast(t('saved'))});
$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,1)],{type:'application/json'});shareOrSave(blob,`custody-backup-${today()}.json`,'application/json',true)});
$('importBtn').addEventListener('click',()=>{$('importInput').value='';$('importInput').click()});
$('importInput').addEventListener('change',async()=>{
  const file=$('importInput').files[0];if(!file)return;
  try{const data=JSON.parse(await file.text());if(!data||!Array.isArray(data.reports))throw new Error('format');
    const n=data.reports.reduce((s,r)=>s+(r.items?.length||0),0);
    if(!confirm(t('restoreAsk',{r:data.reports.length,n})))return;
    state={reports:data.reports,saved:Array.isArray(data.saved)?data.saved:[],settings:Object.assign(state.settings,data.settings||{},{lang})};save();renderHome();renderSaved();hide('setSheet');toast(t('restored'))
  }catch(e){alert(t('badBackup'))}
});

// ---------- start ----------
applyLang();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__app={state:()=>state,files:()=>cur,openFromRead,fillFromPicture,sheetHtml,makeFiles,buildWord,getFiles,save,renderHome,openReport,setLang};
})();
