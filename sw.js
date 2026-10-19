// Offline support: the app shell is cached on install; the large OCR files are cached the first time they are used.
const CACHE='ahda-v1.0.0';
const SHELL=['./','index.html','app.js','scan.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
  'vendor/js/jsQR-1.4.0.js','vendor/js/zxing-0.21.3.min.js','vendor/qrwasm/zxing-reader-3.1.2.js','vendor/qrwasm/zxing_reader.wasm',
  'vendor/js/html2canvas-1.4.1.min.js','vendor/js/jspdf-2.5.1.umd.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ahda-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
  const isShell=/\/(index\.html|app\.js|scan\.js)?$/.test(new URL(req.url).pathname)||req.mode==='navigate';
  if(isShell){
    // Network first for the app itself so updates arrive; fall back to cache when offline.
    e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy))}return res})));
});
