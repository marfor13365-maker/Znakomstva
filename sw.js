// sw.js — Service Worker для Blizko.
// Должен лежать в КОРНЕ репозитория (рядом с index.html), не в подпапке.
// Именно расположение в корне даёт ему право "слушать" весь сайт.

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// Приходит push с сервера (Render) — показываем системное уведомление.
// Работает даже если сайт закрыт / телефон в спящем режиме (экран загорится).
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Blizko', body: event.data ? event.data.text() : '' };
  }

  var title = data.title || 'Blizko';
  var options = {
    body: data.body || '',
    icon: data.icon || 'icon-192.png',
    badge: data.badge || 'icon-192.png',
    tag: data.tag || 'blizko-notification',
    requireInteraction: data.type === 'call', // звонок не исчезнет сам, пока не нажмут
    data: {
      url: data.url || '/',
      type: data.type || 'message',
      callId: data.callId || null,
      fromUserId: data.fromUserId || null
    },
    vibrate: data.type === 'call' ? [300, 200, 300, 200, 300] : [200],
    actions: data.type === 'call'
      ? [
          { action: 'accept', title: '✅ Принять' },
          { action: 'decline', title: '❌ Отклонить' }
        ]
      : []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Клик по уведомлению (или по кнопке Принять/Отклонить) — открываем нужную страницу.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var data = event.notification.data || {};
  var targetUrl = data.url || '/';

  if (data.type === 'call') {
    if (event.action === 'decline') {
      // Просто закрываем уведомление, отдельный сигнал отказа отправит сама страница при открытии,
      // либо можно расширить позже через fetch() прямо отсюда.
      return;
    }
    // 'accept' или просто тап по уведомлению — открываем страницу звонка
    targetUrl = data.url || ('/call.html?call=' + data.callId + '&from=' + data.fromUserId);
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

