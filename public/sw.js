// Lightweight installable PWA. Sensitive orders/admin/API are NEVER cached.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(!(/^\/(images\/|icon-|brand-mark\.svg)/).test(url.pathname))return;
  event.respondWith(caches.open('cedar-assets-v1').then(async cache=>{
    const cached=await cache.match(event.request);
    if(cached)return cached;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(event.request,response.clone());
    return response;
  }));
});
