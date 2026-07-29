// sw.js — Service Worker для Blizko.
// Должен лежать в КОРНЕ репозитория (рядом с index.html), не в подпапке.
// Именно расположение в корне даёт ему право "слушать" весь сайт.

// Текущий режим уведомлений о звонке: 'sound' | 'vibrate' | 'silent'.
// Обновляется сообщением от страницы (см. call-webrtc.js -> notifyServiceWorkerRingMode()).
// Живёт, пока жив этот экземпляр Service Worker'а; при перезапуске SW сбрасывается на 'sound' —
// это безопасный вариант по умолчанию (лучше лишний раз прозвонить, чем пропустить звонок).
var currentRingMode = 'sound';

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// Страница сообщает нам выбранный пользователем режим (настройки -> звук/вибро/тихо).
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'ring-mode') {
    if (['sound', 'vibrate', 'silent'].indexOf(event.data.mode) !== -1) {
      currentRingMode = event.data.mode;
    }
  }
});

// Приходит push с сервера (Render) — показываем системное уведомление.
// Работает даже если сайт закрыт / телефон в спящем режиме (экран загорится и завибрирует,
// если это звонок и режим не "тихо").
self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Blizko', body: event.data ? event.data.text() : '' };
  }

  var isCall = data.type === 'call';
  var title = data.title || 'Blizko';

  var vibratePattern;
  if (currentRingMode === 'silent') {
    vibratePattern = [];
  } else if (currentRingMode === 'vibrate') {
    vibratePattern = isCall ? [400, 200, 400, 200, 400, 200, 400] : [200];
  } else {
    vibratePattern = isCall ? [300, 200, 300, 200, 300] : [200];
  }

  var options = {
    body: data.body || '',
    icon: data.icon || 'icon-192.png',
    badge: data.badge || 'icon-192.png',
    tag: data.tag || 'blizko-notification',
    requireInteraction: isCall, // звонок не исчезнет сам, пока не нажмут
    silent: currentRingMode === 'silent',
    vibrate: vibratePattern,
    data: {
      url: data.url || '/',
      type: data.type || 'message',
      callId: data.callId || null,
      matchId: data.matchId || data.match_id || null,
      fromUserId: data.fromUserId || null
    },
    actions: isCall
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
    // И "Принять", и "Отклонить", и обычный тап — открывают сам чат.
    // Полноэкранный экран звонка (Accept/Decline) там появится сам —
    // звонок хранится в БД, а не только в push, так что он не потеряется.
    if (data.matchId) {
      targetUrl = 'chat.html?match=' + data.matchId + (data.callId ? '&call=' + data.callId : '');
    } else {
      targetUrl = data.url || '/';
    }
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
