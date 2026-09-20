/* Tessera Web Push service worker. Labelled: no payload is invented when VAPID is missing. */
self.addEventListener('push', (event) => {
  let data = { title: 'Tessera', body: 'Something happened in your Inbox.', href: '/inbox' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* keep defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tessera', {
      body: data.body,
      data: { href: data.href || '/inbox' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href || '/inbox';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
