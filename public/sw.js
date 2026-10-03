// Serendine service worker: shows push notifications and opens the right screen when tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Serendine';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).pathname === url && 'focus' in client) return client.focus();
      }
      for (const client of list) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(url).then((c) => (c ? c.focus() : self.clients.openWindow(url)));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
