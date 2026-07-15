// push-notifications.js
// Подписка на Web Push (звонки, сообщения, лайки, мэтчи) + настройки включения/выключения по типам.
// Использование: BlizkoPush.init(dbClient, userId) — вызвать по кнопке "Включить уведомления".

(function () {
  var VAPID_PUBLIC_KEY = 'BACW1lr_W9Oyo50LRLjQeCfjS7TmzR-BwXDSjQ-7aXLLuKVbsaaqRqZHZ1LtrME3YLKqz49juqypy2lpo1beLeA';

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function arrayBufferToBase64Url(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Регистрирует sw.js (если ещё не зарегистрирован) и возвращает готовую registration.
  async function ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker не поддерживается этим браузером');
    }
    var existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js');
  }

  // Основная функция — вызывается по нажатию на колокольчик.
  // Возвращает true/false (успех), как и ожидает profile.html.
  async function init(dbClient, userId) {
    if (!('Notification' in window) || !('PushManager' in window)) {
      console.warn('Push-уведомления не поддерживаются этим браузером/устройством');
      return false;
    }

    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    try {
      var registration = await ensureServiceWorker();
      await navigator.serviceWorker.ready;

      var existingSub = await registration.pushManager.getSubscription();
      var subscription = existingSub || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      var subJson = subscription.toJSON();
      var p256dh = subJson.keys && subJson.keys.p256dh;
      var authKey = subJson.keys && subJson.keys.auth;

      if (!p256dh || !authKey) {
        console.error('Подписка не содержит ключей шифрования');
        return false;
      }

      var { error } = await dbClient.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: p256dh,
        auth: authKey
      }, { onConflict: 'endpoint' });

      if (error) {
        console.error('Не удалось сохранить подписку в Supabase:', error);
        return false;
      }

      return true;
    } catch (e) {
      console.error('Ошибка подписки на push:', e);
      return false;
    }
  }

  // Отписаться от push полностью (например, если пользователь передумал).
  async function unsubscribe(dbClient) {
    if (!('serviceWorker' in navigator)) return false;
    var registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return true;

    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    var endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    if (dbClient) {
      await dbClient.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    return true;
  }

  // Проверить, подписан ли пользователь прямо сейчас (для отображения состояния в UI).
  async function isSubscribed() {
    if (!('serviceWorker' in navigator)) return false;
    var registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return false;
    var subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  }

  // ===== Настройки: какие типы уведомлений получать =====
  // Хранятся в profiles: notif_messages, notif_likes, notif_matches, notif_calls (все boolean, default true).

  var PREFERENCE_KEYS = ['notif_messages', 'notif_likes', 'notif_matches', 'notif_calls'];

  async function getPreferences(dbClient, userId) {
    var { data, error } = await dbClient
      .from('profiles')
      .select('notif_messages, notif_likes, notif_matches, notif_calls')
      .eq('id', userId)
      .single();

    if (error || !data) {
      // Если что-то пошло не так — считаем, что всё включено (безопасный дефолт для UX)
      return { notif_messages: true, notif_likes: true, notif_matches: true, notif_calls: true };
    }
    return data;
  }

  async function setPreference(dbClient, userId, key, value) {
    if (PREFERENCE_KEYS.indexOf(key) === -1) {
      throw new Error('Неизвестный ключ настройки: ' + key);
    }
    var update = {};
    update[key] = !!value;
    var { error } = await dbClient.from('profiles').update(update).eq('id', userId);
    return !error;
  }

  window.BlizkoPush = {
    init: init,
    unsubscribe: unsubscribe,
    isSubscribed: isSubscribed,
    getPreferences: getPreferences,
    setPreference: setPreference
  };
})();
