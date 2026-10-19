// QR (ZATCA) and OCR reading. Adapted from Invoice Manager V8.7 (tested decoders and parsers).
(function(){
'use strict';
const base=new URL('.',location.href).href;
const barcodeDetector=('BarcodeDetector' in window)?(()=>{try{return new BarcodeDetector({formats:['qr_code']})}catch(e){return null}})():null;
let zxingWasmPromise=null,ocrWorkerPromise=null,ocrLogger=null;

function imageFromFile(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=reject;img.src=url})}
function canvasFromImage(img,max=4096){const canvas=document.createElement('canvas'),iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,scale=Math.min(1,max/Math.max(iw,ih));canvas.width=Math.max(1,Math.round(iw*scale));canvas.height=Math.max(1,Math.round(ih*scale));canvas.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,canvas.width,canvas.height);return canvas}
function detectDocumentBounds(data,width,height){
  const size=width*height,mask=new Uint8Array(size),queue=new Int32Array(size);for(let index=0,pixel=0;index<size;index++,pixel+=4){const r=data[pixel],g=data[pixel+1],b=data[pixel+2],light=.299*r+.587*g+.114*b,chroma=Math.max(r,g,b)-Math.min(r,g,b);if(light>135&&chroma<105)mask[index]=1}
  let best=null;for(let start=0;start<size;start++){if(mask[start]!==1)continue;let head=0,tail=1,area=0,minX=width,maxX=0,minY=height,maxY=0;queue[0]=start;mask[start]=2;while(head<tail){const current=queue[head++],x=current%width,y=(current/width)|0;area++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;let next;if(x){next=current-1;if(mask[next]===1){mask[next]=2;queue[tail++]=next}}if(x<width-1){next=current+1;if(mask[next]===1){mask[next]=2;queue[tail++]=next}}if(y){next=current-width;if(mask[next]===1){mask[next]=2;queue[tail++]=next}}if(y<height-1){next=current+width;if(mask[next]===1){mask[next]=2;queue[tail++]=next}}}const boxArea=(maxX-minX+1)*(maxY-minY+1),fill=area/Math.max(1,boxArea);if(area>size*.008&&fill>.18&&(!best||area>best.area))best={x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,area}}
  if(!best||best.width*best.height>size*.94)return null;return best
}
function autoCropDocument(image){
  const source=canvasFromImage(image,4096),analysis=fitCanvas(source,700),ctx=analysis.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,analysis.width,analysis.height),bounds=detectDocumentBounds(pixels.data,analysis.width,analysis.height);if(!bounds)return source;
  const scaleX=source.width/analysis.width,scaleY=source.height/analysis.height,padX=bounds.width*.035,padY=bounds.height*.025;return crop(source,(bounds.x-padX)*scaleX,(bounds.y-padY)*scaleY,(bounds.width+padX*2)*scaleX,(bounds.height+padY*2)*scaleY,3800)
}
function qrFromCanvas(canvas){
  if(!window.jsQR)return '';
  try{const ctx=canvas.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,canvas.width,canvas.height),result=jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'});return result?.data||''}catch(error){return ''}
}
function crop(source,x,y,w,h,target=3000){
  x=Math.max(0,Math.round(x));y=Math.max(0,Math.round(y));w=Math.max(1,Math.min(source.width-x,Math.round(w)));h=Math.max(1,Math.min(source.height-y,Math.round(h)));
  const canvas=document.createElement('canvas'),scale=Math.min(4,target/Math.max(w,h));
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(source,x,y,w,h,0,0,canvas.width,canvas.height);
  return canvas
}
function fitCanvas(source,max=3000){if(Math.max(source.width,source.height)<=max)return source;return crop(source,0,0,source.width,source.height,max)}
function rotateCanvas(source,degrees){
  const swap=Math.abs(degrees)%180===90,canvas=document.createElement('canvas');
  canvas.width=swap?source.height:source.width;canvas.height=swap?source.width:source.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(degrees*Math.PI/180);ctx.drawImage(source,-source.width/2,-source.height/2);
  return canvas
}
function enhanceCanvas(source,mode){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
  const img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data;
  if(mode==='contrast'){
    for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=Math.max(0,Math.min(255,(y-128)*2.15+128));d[i]=d[i+1]=d[i+2]=v}
  }else if(mode==='threshold'){
    let total=0,count=0;for(let i=0;i<d.length;i+=32){total+=.299*d[i]+.587*d[i+1]+.114*d[i+2];count++}const th=Math.max(80,Math.min(185,total/Math.max(1,count)));
    for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y>th?255:0;d[i]=d[i+1]=d[i+2]=v}
  }
  ctx.putImageData(img,0,0);return canvas
}
async function nativeDecode(canvas){
  if(!barcodeDetector)return '';
  try{const codes=await barcodeDetector.detect(canvas);return codes?.find(c=>c.rawValue)?.rawValue||''}catch(error){return ''}
}
function zxingDecode(canvas){
  if(!window.ZXing)return '';
  try{
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const rgba=img.data,luminance=new Uint8ClampedArray(canvas.width*canvas.height);
    for(let src=0,dst=0;dst<luminance.length;src+=4,dst++)luminance[dst]=(rgba[src]+2*rgba[src+1]+rgba[src+2])>>2;
    const source=new ZXing.RGBLuminanceSource(luminance,canvas.width,canvas.height);
    const hints=new Map();hints.set(ZXing.DecodeHintType.TRY_HARDER,true);hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.QR_CODE]);
    const reader=new ZXing.QRCodeReader();
    try{return reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source)),hints).getText()||''}catch(error){}
    return reader.decode(new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(source)),hints).getText()||'';
  }catch(error){return ''}
}
function fixedThresholdCanvas(source,threshold){const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data;for(let index=0;index<data.length;index+=4){const light=.299*data[index]+.587*data[index+1]+.114*data[index+2],value=light>threshold?255:0;data[index]=data[index+1]=data[index+2]=value}ctx.putImageData(image,0,0);return canvas}
async function zxingWasmDecode(canvas){
  if(!window.ZXingWASM?.readBarcodes)return '';try{if(!zxingWasmPromise)zxingWasmPromise=Promise.resolve(ZXingWASM.prepareZXingModule({overrides:{locateFile:(path,prefix)=>path.endsWith('.wasm')?base+'vendor/qrwasm/zxing_reader.wasm':prefix+path}}));await zxingWasmPromise;const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.getImageData(0,0,canvas.width,canvas.height),results=await ZXingWASM.readBarcodes(image,{formats:['QRCode'],tryHarder:true,tryRotate:true,tryDownscale:true,maxNumberOfSymbols:1});return results?.find(result=>result.text)?.text||''}catch(error){console.warn('ZXing-C++ QR fallback failed',error);zxingWasmPromise=null;return ''}
}
async function tryDecode(canvas){return (await nativeDecode(canvas))||qrFromCanvas(canvas)||zxingDecode(canvas)||(await zxingWasmDecode(canvas))}
async function decodeReceiptQr(source){
  const width=source.width,height=source.height,regions=[[width*.02,height*.64,width*.88,height*.29],[0,height*.58,width,height*.37],[0,height*.45,width,height*.5]];
  for(const region of regions){const candidate=crop(source,...region,1600);for(const threshold of [170,190,150]){const raw=await zxingWasmDecode(fixedThresholdCanvas(candidate,threshold));if(raw)return raw}const raw=await zxingWasmDecode(candidate);if(raw)return raw}
  return ''
}
async function decodeQr(source){
  if(!source||!source.width||!source.height)return '';
  const base=fitCanvas(source,3000);let raw=await tryDecode(base);if(raw)return raw;
  const W=source.width,H=source.height;
  const regions=[
    [W*.07,H*.07,W*.86,H*.86],[0,H*.25,W,H*.75],[0,0,W,H*.75],
    [0,0,W*.72,H*.72],[W*.28,0,W*.72,H*.72],[0,H*.28,W*.72,H*.72],[W*.28,H*.28,W*.72,H*.72],
    [W*.15,H*.15,W*.70,H*.70],[W*.24,H*.24,W*.52,H*.52],
    [0,H*.45,W,H*.55],[0,H*.58,W,H*.42],[W*.10,H*.38,W*.80,H*.60]
  ];
  for(let gy=0;gy<3;gy++)for(let gx=0;gx<3;gx++)regions.push([W*(gx*.24),H*(gy*.24),W*.52,H*.52]);
  for(const r of regions){
    const c=crop(source,...r,3200);raw=await tryDecode(c);if(raw)return raw;
    const contrast=enhanceCanvas(c,'contrast');raw=await tryDecode(contrast);if(raw)return raw;
  }
  for(const degrees of [90,180,270]){const c=rotateCanvas(base,degrees);raw=await tryDecode(c);if(raw)return raw}
  const threshold=enhanceCanvas(base,'threshold');raw=await tryDecode(threshold);if(raw)return raw;
  return await decodeReceiptQr(source)
}

// ---- ZATCA TLV ----
function b64bytes(value){value=String(value||'').replace(/^\uFEFF/,'').trim();value=value.replace(/^zatca:\/\//i,'').replace(/^data:[^,]+,/i,'').replace(/^base64,/i,'');if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);try{value=decodeURIComponent(value)}catch(error){}value=value.replace(/\s/g,'').replace(/-/g,'+').replace(/_/g,'/');if(!value||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('Invalid Base64');while(value.length%4)value+='=';const binary=atob(value),output=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)output[index]=binary.charCodeAt(index);return output}
function parseTlv(raw){
  let bytes;try{bytes=b64bytes(raw)}catch{return null}
  const fields={};let index=0,guard=0;
  const result=()=>fields[1]&&fields[2]&&fields[3]&&fields[4]&&fields[5]?fields:null;
  while(index<bytes.length&&guard++<64){
    const tag=bytes[index++];if(index>=bytes.length)return result();
    const length=bytes[index++];
    if(index+length>bytes.length)return result();
    const chunk=bytes.slice(index,index+length);index+=length;
    if(tag>=1&&tag<=5){try{fields[tag]=new TextDecoder('utf-8',{fatal:false}).decode(chunk).replace(/\0/g,'').trim()}catch{fields[tag]=''}}
  }
  return result()
}
function num(value){const number=Number(normalizeOcrText(value).replace(/[^0-9.\-]/g,''));return Number.isFinite(number)?number:0}
function qrDate(value){
  value=normalizeOcrText(value);
  let m=value.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);if(m)return validOcrDate(m[1],m[2],m[3]);
  m=value.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})/);if(m)return validOcrDate(m[3],m[2],m[1]);
  m=value.match(/(20\d{2})(\d{2})(\d{2})/);if(m)return validOcrDate(m[1],m[2],m[3]);
  return ''
}
// Returns invoice fields from a ZATCA QR string, or null when it is not a ZATCA code.
function zatcaFields(raw){
  const f=parseTlv(raw);if(!f)return null;
  const total=num(f[4]),tax=num(f[5]);
  return {name:f[1]||'',vatNo:(f[2]||'').replace(/\D/g,'')||f[2]||'',date:qrDate(f[3]),after:total,tax:tax,before:Math.round((total-tax)*100)/100,rawDate:f[3]}
}

// ---- OCR ----
function normalizeOcrText(value){
  const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
  return String(value||'').replace(/[٠-٩]/g,ch=>String(arabic.indexOf(ch))).replace(/[۰-۹]/g,ch=>String(persian.indexOf(ch))).replace(/٫/g,'.').replace(/٬/g,',').replace(/[\u200e\u200f\u202a-\u202e]/g,'')
}
function ocrLines(text){return normalizeOcrText(text).split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean)}
function amountCandidates(line){
  const values=[],pattern=/-?\d[\d ,.]*\d|-?\d/g;let match;
  while((match=pattern.exec(line))){
    const raw=match[0].trim().replace(/[\s.,]+$/,''),digits=raw.replace(/\D/g,'');if(!digits||digits.length>12)continue;
    if(/^20\d{2}$/.test(raw)&&/[\/\-]/.test(line))continue;
    let cleaned=raw.replace(/\s/g,''),dot=cleaned.lastIndexOf('.'),comma=cleaned.lastIndexOf(',');
    if(dot>=0&&comma>=0){const decimal=dot>comma?'.':',';cleaned=cleaned.replace(decimal==='.'?/,/g:/\./g,'').replace(decimal,'.')}
    else if(dot>=0||comma>=0){const separator=dot>=0?'.':',',parts=cleaned.split(separator);cleaned=parts.length===2&&parts[1].length<=2?parts.join('.'):parts.join('')}
    const value=Number(cleaned);if(Number.isFinite(value)&&value>=0&&value<100000000)values.push(value)
  }
  return values
}
function findLabeledAmount(lines,label){
  for(let index=0;index<lines.length;index++){
    const line=lines[index];if(!label.test(line))continue;
    const current=amountCandidates(line),onlyPercent=current.length===1&&/%/.test(line);
    if(!current.length||onlyPercent){for(let offset=1;offset<=3&&lines[index+offset];offset++){const next=amountCandidates(lines[index+offset]);if(next.length&&next[0]<100000000)return next[next.length-1]}}
    if((!current.length||onlyPercent)&&index&&lines[index-1]){const previous=amountCandidates(lines[index-1]);if(previous.length&&previous[0]<100000000)return previous[previous.length-1]}
    if(current.length)return current[current.length-1]
  }
  return null
}
function findBottomLabeledAmount(lines,label){
  for(let index=lines.length-1;index>=0;index--){
    const line=lines[index];if(!label.test(line))continue;const current=amountCandidates(line).filter(value=>value<100000000);if(current.length)return current[current.length-1];
    const nearbyHeader=lines.slice(Math.max(0,index-3),index+4).join(' ');if(/(?:total\s*amount|القيمة\s*الإجمالية|القيمة\s*الاجمالية)/i.test(line)&&/(?:description|qty|quantity|unit\s*price|البيان|الوصف|العدد|السعر\s*الإفرادي)/i.test(nearbyHeader))continue;
    for(const offset of [1,-1,2,-2]){const nearby=lines[index+offset];if(!nearby)continue;const values=amountCandidates(nearby).filter(value=>value<100000000);if(values.length)return values[values.length-1]}
  }
  return null
}
function validOcrDate(year,month,day){
  year=Number(year);month=Number(month);day=Number(day);if(year<2000||year>2100||month<1||month>12||day<1||day>31)return '';
  const date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:''
}
function findOcrDate(lines){
  const preferred=lines.filter(line=>/(?:invoice\s*date|issue\s*date|date|التاريخ|تاريخ\s*(?:الفاتورة|الإصدار|الاصدار))/i.test(line)),ordered=[...preferred,...lines.filter(line=>!preferred.includes(line))];
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  for(const line of ordered){
    let match=line.match(/\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);if(match){const result=validOcrDate(match[1],match[2],match[3]);if(result)return result}
    match=line.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|\d{2})\b/);if(match){const year=String(match[3]).length===2?2000+Number(match[3]):match[3],result=validOcrDate(year,match[2],match[1]);if(result)return result}
    match=line.match(/\b(20\d{2})(\d{2})(\d{2})\b/);if(match){const result=validOcrDate(match[1],match[2],match[3]);if(result)return result}
    match=line.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(20\d{2})\b/i);if(match){const month=months[match[2].slice(0,3).toLowerCase()],result=month&&validOcrDate(match[3],month,match[1]);if(result)return result}
  }
  return ''
}
function findVatNumber(lines){
  const label=/(?:vat|tax|trn)\s*(?:registration|number|no\.?|id|reg\.?)?|الرقم\s*الضريبي|رقم\s*(?:التسجيل\s*)?الضريبي|التسجيل\s*الضريبي/i,candidates=[];
  const collect=(line,priority=false)=>{const fixed=line.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1').replace(/[Ss]/g,'5'),matches=fixed.match(/\d(?:[\s-]?\d){14,19}/g)||[];for(const value of matches){const digits=value.replace(/\D/g,'');for(let i=0;i<=digits.length-15;i++){const part=digits.slice(i,i+15);priority?candidates.unshift(part):candidates.push(part)}}};
  for(let index=0;index<lines.length;index++)if(label.test(lines[index])){collect(lines[index],true);if(lines[index+1])collect(lines[index+1],true)}
  return candidates.find(value=>value.startsWith('3')&&value.endsWith('3'))||''
}
function findInvoiceNumber(lines){
  const patterns=[/(?:tax\s*)?invoice\s*(?:no\.?|number|#|ref(?:erence)?\.?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/._-]{1,40})/i,/(?:inv|bill|receipt|document)\s*(?:no\.?|number|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/._-]{1,40})/i,/(?:رقم\s*(?:الفاتورة|المستند|الإيصال|الايصال)|فاتورة\s*رقم)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/._-]{1,40})/i];
  for(const line of lines)for(const pattern of patterns){const match=line.match(pattern);if(match&&!/^(?:no|number|invoice|فاتورة)$/i.test(match[1]))return match[1].replace(/[.,:]+$/,'')}
  const cashIndex=lines.findIndex(line=>/(?:cash\s*invoice|فاتورة\s*نقدية)/i.test(line));if(cashIndex>=0){for(let distance=1;distance<=6;distance++)for(const index of [cashIndex-distance,cashIndex+distance]){const line=lines[index]||'';if(/(?:date|mob|mobile|tel|c\.?r\.?|س\.?\s*ت|جوال)/i.test(line))continue;const match=line.match(/^\D*(\d{3,8})\D*$/);if(match&&!/^20\d{2}$/.test(match[1]))return match[1]}}
  const dateIndex=lines.findIndex(line=>/\b20\d{2}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b/.test(line)),nearDate=dateIndex>=0?lines.slice(Math.max(0,dateIndex-12),dateIndex+1):[];if(dateIndex>=0&&(nearDate.some(line=>/(?:^|\b)(?:t?xn|transaction)(?:\b|\s)/i.test(line))||nearDate.slice(-5).some(line=>/(?:date|تاريخ)/i.test(line)))){for(let index=dateIndex-1;index>=Math.max(0,dateIndex-8);index--){const digits=lines[index].replace(/\D/g,'');if(digits.length>=5&&digits.length<=10)return digits}}
  return ''
}
function findCompany(lines){
  const labeled=/^(?:(?:seller|supplier|merchant|company|business|establishment)\s*(?:name)?|اسم\s*(?:الشركة|المنشأة|المؤسسة|المورد|البائع|التاجر))\s*(?:[:#-]\s*|\s+)(.+)$/i;
  for(const line of lines){const match=line.match(labeled),value=match?.[1]?.trim();if(value&&value.length>=3)return value.slice(0,120)}
  const reject=/(?:invoice|فاتورة|date|تاريخ|description|البيان|unit\s*price|total|الإجمالي|qty|quantity|العدد|c\.?r\.?|commercial\s*reg|mob(?:ile)?|phone|tel|جوال|س\.?\s*ت|riyadh|street|road|area|شارع|طريق|الرياض)/i;
  for(const line of lines.slice(0,18)){const clean=line.replace(/^[^A-Za-z\u0600-\u06ff]+|[^A-Za-z0-9\u0600-\u06ff.,&' -]+$/g,'').trim(),letters=(clean.match(/[A-Za-z\u0600-\u06ff]/g)||[]).length;if(letters>=8&&!reject.test(clean)&&/(?:company|co\.?|est\.?|establishment|trading|مؤسسة|شركة|تجارية|للتجارة)/i.test(clean))return clean.slice(0,120)}
  const candidates=lines.slice(0,18).map((line,index)=>{const clean=line.replace(/^[^A-Za-z\u0600-\u06ff]+|[^A-Za-z0-9\u0600-\u06ff.,&' -]+$/g,'').trim(),letters=(clean.match(/[A-Za-z\u0600-\u06ff]/g)||[]).length,digits=(clean.match(/\d/g)||[]).length;let score=letters-digits*3-index*.35;if(/(?:company|co\.?|est\.?|establishment|trading|مؤسسة|شركة|تجارية|للتجارة)/i.test(clean))score+=20;if(/(?:plumbing|electric|construction|materials|contracting|services|market|store|مقاولات|كهرباء|سباكة|مواد|خدمات)/i.test(clean))score+=7;if(reject.test(clean)||letters<8||digits>3||clean.length>120)score=-999;return {clean,score}}).sort((a,b)=>b.score-a.score);
  return candidates[0]?.score>8?candidates[0].clean:''
}
function findDescription(lines,company){
  const header=/(?:description|\bitem\b\s*(?:description|name)?|product|service|particulars|البيان|الوصف|الصنف|الخدمة|تفاصيل\s*الصنف)/i,stop=/(?:sub\s*total|subtotal|grand\s*total|\btotal\b|vat\s*amount|tax\s*amount|الإجمالي|الاجمالي|المجموع|الضريبة)/i,skip=/(?:qty|quantity|unit\s*price|price|amount|الكمية|سعر\s*الوحدة|المبلغ)/i;
  for(let index=0;index<lines.length;index++){
    if(!header.test(lines[index]))continue;const found=[];
    for(let offset=1;offset<=8&&index+offset<lines.length;offset++){let line=lines[index+offset];if(stop.test(line))break;if(skip.test(line)&&(line.match(/[A-Za-z\u0600-\u06ff]/g)||[]).length<=12)continue;line=line.replace(/\s+(?:SAR|SR|ر\.?\s*س\.?)?\s*\d[\d\s,.]*$/i,'').replace(/^\s*\d+\s*[xX*]?\s*/,'').trim();const letters=(line.match(/[A-Za-z\u0600-\u06ff]/g)||[]).length,words=line.match(/[A-Za-z\u0600-\u06ff]{3,}/g)||[];if(letters>=3&&words.length&&line!==company&&!header.test(line))found.push(line);if(found.length===3)break}
    if(found.length)return found.join(' | ').slice(0,300)
  }
  if(lines.some(line=>/(?:gasoline|petrol|benzine|بنزين|وقود)/i.test(line)))return 'بنزين';
  if(lines.some(line=>/(?:diesel|ديزل)/i.test(line)))return 'ديزل';
  const known=lines.find(line=>/(?:shipping|delivery|شحن|توصيل|restaurant|مطعم)/i.test(line));if(known)return known.trim().slice(0,300)
  return ''
}
function extractInvoiceFields(text){
  const lines=ocrLines(text),totalLabel=/(?:grand\s*total|invoice\s*total|\btotal\b|total\s*(?:amount|including\s*(?:vat|tax)|incl\.?\s*(?:vat|tax)|after\s*(?:vat|tax)|with\s*(?:vat|tax))|amount\s*(?:due|payable)|net\s*(?:total|amount)|إجمالي\s*الفاتورة|اجمالي\s*الفاتورة|الإجمالي\s*(?:شامل|بعد|المستحق)?|الاجمالي\s*(?:شامل|بعد|المستحق)?|المجموع|المبلغ\s*(?:الإجمالي|الاجمالي|المستحق)|الصافي)/i;
  const vatLabel=/(?:vat\s*(?:amount|total|value)|tax\s*(?:amount|total)|value\s*added\s*tax|added\s*tax|(?:vat|ضريبة)\s*15\s*%|ضريبة\s*القيمة\s*المضافة|قيمة\s*الضريبة|مبلغ\s*الضريبة|إجمالي\s*الضريبة|اجمالي\s*الضريبة|الضريبة\s*(?:المضافة|بنسبة\s*15\s*%))/i;
  const beforeLabel=/(?:sub\s*total|subtotal|taxable\s*amount|total\s*(?:excluding|exclusive|before)\s*(?:vat|tax)|amount\s*before\s*(?:vat|tax)|net\s*before\s*(?:vat|tax)|قبل\s*الضريبة|غير\s*شامل\s*الضريبة|المبلغ\s*الخاضع\s*للضريبة|القيمة\s*قبل\s*الضريبة|الإجمالي\s*قبل\s*الضريبة|الاجمالي\s*قبل\s*الضريبة)/i;
  const totalLines=lines.filter(line=>!beforeLabel.test(line)&&!vatLabel.test(line)&&!/(?:vat|tax)\s*(?:registration|number|no\.?|id)|الرقم\s*الضريبي/i.test(line));let total=findBottomLabeledAmount(totalLines,totalLabel)??findLabeledAmount(totalLines,totalLabel),vatAmount=findLabeledAmount(lines,vatLabel),beforeVat=findLabeledAmount(lines,beforeLabel);
  if(total===null){for(const line of lines){if(!/\btotal\b/i.test(line)||/(?:sub\s*total|subtotal|vat|tax)/i.test(line))continue;const values=amountCandidates(line);if(values.length){total=values[values.length-1];break}}}
  if(beforeVat===null&&total!==null&&vatAmount!==null&&total>=vatAmount)beforeVat=total-vatAmount;
  if(vatAmount===null&&total!==null&&beforeVat!==null&&total>=beforeVat)vatAmount=total-beforeVat;
  if(total===null&&beforeVat!==null&&vatAmount!==null)total=beforeVat+vatAmount;
  const hasVatLanguage=lines.some(line=>vatLabel.test(line)||/(?:vat|value\s*added\s*tax|ضريبة\s*القيمة\s*المضافة|الرقم\s*الضريبي)/i.test(line));if(total!==null&&total>0&&beforeVat===null&&vatAmount===null&&!hasVatLanguage){beforeVat=total;vatAmount=0}
  // Reject amount sets that do not add up (likely misread digits) instead of guessing.
  if(total!==null&&beforeVat!==null&&vatAmount!==null&&Math.abs(beforeVat+vatAmount-total)>0.05){beforeVat=null;vatAmount=null}
  const name=findCompany(lines),desc=findDescription(lines,name);
  return {name,vatNo:findVatNumber(lines),invNo:findInvoiceNumber(lines),date:findOcrDate(lines),before:beforeVat,tax:vatAmount,after:total,desc}
}
function makeOcrCanvas(image,max=3800,mode='contrast'){
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,long=Math.max(iw,ih),short=Math.min(iw,ih),scale=Math.min(max/long,Math.max(1,1800/Math.max(1,short))),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(iw*scale));canvas.height=Math.max(1,Math.round(ih*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data,hist=new Uint32Array(256);
  for(let i=0;i<data.length;i+=4){const grey=Math.max(0,Math.min(255,Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2])));hist[grey]++;data[i]=data[i+1]=data[i+2]=grey}
  const total=canvas.width*canvas.height,cut=total*.015;let low=0,high=255,sum=0;for(;low<250;low++){sum+=hist[low];if(sum>=cut)break}sum=0;for(;high>5;high--){sum+=hist[high];if(sum>=cut)break}const range=Math.max(35,high-low);
  let threshold=150;if(mode==='threshold'){let all=0;for(let i=0;i<256;i++)all+=i*hist[i];let background=0,weightBackground=0,best=0;for(let i=0;i<256;i++){weightBackground+=hist[i];if(!weightBackground)continue;const weightForeground=total-weightBackground;if(!weightForeground)break;background+=i*hist[i];const meanBackground=background/weightBackground,meanForeground=(all-background)/weightForeground,between=weightBackground*weightForeground*(meanBackground-meanForeground)**2;if(between>best){best=between;threshold=i}}}
  for(let i=0;i<data.length;i+=4){const raw=data[i];let value=(raw-low)*255/range;value=Math.max(0,Math.min(255,value));if(mode==='threshold')value=raw<threshold?0:255;else value=Math.max(0,Math.min(255,(value-128)*1.18+128));data[i]=data[i+1]=data[i+2]=value}
  ctx.putImageData(pixels,0,0);return canvas
}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('load '+src));document.head.appendChild(s)})}
async function getOcrWorker(){
  if(!window.Tesseract)await loadScript(base+'vendor/ocr/tesseract-7.0.0.min.js');
  if(!ocrWorkerPromise)ocrWorkerPromise=Tesseract.createWorker('eng+ara',Tesseract.OEM.LSTM_ONLY,{workerPath:base+'vendor/ocr/worker-7.0.0.min.js',corePath:base+'vendor/ocr',langPath:base+'vendor/ocr/lang',workerBlobURL:false,logger:m=>ocrLogger&&ocrLogger(m),errorHandler:error=>console.error(error)}).catch(error=>{ocrWorkerPromise=null;throw error});
  return ocrWorkerPromise
}
function mergeOcrText(...texts){const seen=new Set(),lines=[];for(const text of texts)for(const line of ocrLines(text)){const key=line.toLocaleLowerCase();if(!seen.has(key)){seen.add(key);lines.push(line)}}return lines.join('\n')}
async function readInvoiceOcr(image,mode='fast'){const worker=await getOcrWorker();await worker.setParameters({tessedit_pageseg_mode:mode==='deep'?Tesseract.PSM.AUTO:Tesseract.PSM.SPARSE_TEXT,preserve_interword_spaces:'1',user_defined_dpi:'300'});const result=await worker.recognize(makeOcrCanvas(image,mode==='deep'?3500:2600,mode==='deep'?'threshold':'contrast'));return result?.data?.text||''}

// Full photo reading: QR first (exact), then OCR for whatever QR does not carry.
async function readPhoto(file,progress){
  ocrLogger=m=>{if(m?.status==='recognizing text'&&progress)progress(Math.round((m.progress||0)*100))};
  const image=await imageFromFile(file),prepared=autoCropDocument(image);
  let qr=null;
  try{const raw=await decodeQr(fitCanvas(prepared,3000));if(raw)qr=zatcaFields(raw)}catch(e){}
  let text='';
  try{text=await readInvoiceOcr(prepared,'fast');let f=extractInvoiceFields(text);
    if(!qr&&(!f.date||f.after===null||!f.invNo)){text=mergeOcrText(text,await readInvoiceOcr(prepared,'deep'))}
  }catch(e){console.error(e)}
  const ocr=text?extractInvoiceFields(text):null;
  return {qr,ocr,text}
}

window.Scan={tryDecode,decodeQr,enhanceCanvas,fixedThresholdCanvas,zxingWasmDecode,zatcaFields,parseTlv,readPhoto,extractInvoiceFields,imageFromFile,canvasFromImage};
})();
