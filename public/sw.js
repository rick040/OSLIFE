// OSLIFE service worker — minimal, exists mainly to power the Web Share Target.
// When Android shares to "OSLIFE" the manifest POSTs multipart/form-data to
// /share; we intercept it here, stash any files in a Cache and forward text/url
// in the query string, then redirect to the SPA so ShareIntake can read it.

const SHARE_CACHE = 'bd-share'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(handleShare(event.request))
  }
  // Everything else: default network behaviour (no offline caching for now).
})

async function handleShare(request) {
  try {
    const form = await request.formData()
    const params = new URLSearchParams()
    for (const key of ['title', 'text', 'url']) {
      const v = form.get(key)
      if (typeof v === 'string' && v) params.set(key, v)
    }

    const files = form.getAll('files').filter((f) => f && typeof f !== 'string')
    if (files.length) {
      const cache = await caches.open(SHARE_CACHE)
      let i = 0
      for (const file of files) {
        await cache.put(
          `/__bd_share_file_${i}`,
          new Response(file, {
            headers: {
              'content-type': file.type || 'application/octet-stream',
              'x-filename': encodeURIComponent(file.name || `file-${i}`),
            },
          }),
        )
        i++
      }
      params.set('files', String(i))
    }

    return Response.redirect(`/share?${params.toString()}`, 303)
  } catch (err) {
    return Response.redirect('/share', 303)
  }
}
