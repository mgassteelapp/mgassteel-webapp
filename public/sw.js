// sw.js — minimal service worker for Web Push only (Wylee 2026-09-08: live
// pop-up + phone/desktop notification for Mira and the owners on new Minta
// Stok requests, on top of the existing Telegram ping). No caching/offline
// support — the app is online-first and doesn't need it; this worker exists
// solely to receive push events while the app isn't the active tab (or isn't
// open at all) and to focus/open the app when the notification is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* malformed payload — show a generic notice */ }
  const title = data.title || 'M Gas Steel';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
