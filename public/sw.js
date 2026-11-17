/* Diwaniya Tonight service worker: pings only (no offline cache in v1).
   Every push shows a notification (WebKit drops subscriptions that push silently). */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const SAFE_URL = /^\/#\/(d\/[0-9a-f-]{36}|diwaniya|inbox|tonight)$/;

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const ar = data.lang !== 'en';
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 120) : ar ? 'ديوانية الليلة' : 'Diwaniya Tonight';
  const body = typeof data.body === 'string' ? data.body.slice(0, 300) : '';
  const url = typeof data.url === 'string' && SAFE_URL.test(data.url) ? data.url : '/#/inbox';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      dir: ar ? 'rtl' : 'ltr',
      lang: ar ? 'ar' : 'en',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 80) : undefined,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/#/inbox';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
