// ===== Скрытая диагностика (видна только с ?debug=1 в адресе) =====
// Лог сохраняется в sessionStorage и переживает переход между страницами.
// Редиректы при включённой диагностике задерживаются на 4 секунды — чтобы успеть увидеть/сфотографировать.
(function () {
  var params = new URLSearchParams(window.location.search);
  if (params.get('debug') === '1') {
    sessionStorage.setItem('blizko_debug_on', '1');
  }
  window.BLIZKO_DEBUG = sessionStorage.getItem('blizko_debug_on') === '1';
})();

function blizkoRenderDebugPanel() {
  if (!window.BLIZKO_DEBUG) return;
  var el = document.getElementById('blizko-debug-panel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'blizko-debug-panel';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#000;color:#0f0;font-size:10px;padding:6px;z-index:999999;max-height:220px;overflow:auto;white-space:pre-wrap;font-family:monospace';
    (document.body || document.documentElement).appendChild(el);
  }
  el.textContent = sessionStorage.getItem('blizko_debug_log') || '';
  el.scrollTop = el.scrollHeight;
}

function blizkoDbg(msg) {
  if (!window.BLIZKO_DEBUG) return;
  var log = sessionStorage.getItem('blizko_debug_log') || '';
  var time = new Date().toISOString().slice(11, 19);
  var page = window.location.pathname.split('/').pop() || 'index.html';
  log += time + ' [' + page + '] ' + msg + '\n';
  sessionStorage.setItem('blizko_debug_log', log);
  if (document.body) blizkoRenderDebugPanel();
  else document.addEventListener('DOMContentLoaded', blizkoRenderDebugPanel);
}

// Используй вместо прямого window.location.href = ... в местах, где происходит авто-редирект по сессии.
function blizkoRedirect(url, reason) {
  blizkoDbg('REDIRECT -> ' + url + ' (' + reason + ')');
  if (window.BLIZKO_DEBUG) {
    setTimeout(function () { window.location.href = url; }, 4000);
  } else {
    window.location.href = url;
  }
}

const SUPABASE_URL = "https://zxzhnmwksygozwtdymmt.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4emhubXdrc3lnb3p3dGR5bW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjM0OTgsImV4cCI6MjA5Njk5OTQ5OH0.Mi69CvtMzxQ5upkBoDtTa9FaVvtmiN9iUmlN6shDJaw"

// ===== Сейф аккаунтов =====
// Хранит access/refresh токены всех аккаунтов, с которых когда-либо входили на этом устройстве.
// Это позволяет переключаться между своими аккаунтами без повторного ввода пароля.
// Хранится в localStorage (общий на устройство) — это осознанно, в отличие от текущей
// АКТИВНОЙ сессии вкладки (та в sessionStorage). Сейф — это просто "запомненные ключи",
// не активная сессия, поэтому конфликта между вкладками здесь нет.

var VAULT_KEY = 'blizko_account_vault';

function getAccountVault() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveSessionToVault(session) {
  if (!session || !session.user) return;
  var vault = getAccountVault();
  var idx = vault.findIndex(function (a) { return a.user_id === session.user.id; });
  var entry = {
    user_id: session.user.id,
    email: session.user.email,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    updated_at: Date.now()
  };
  if (idx >= 0) vault[idx] = entry;
  else vault.push(entry);
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

function removeFromAccountVault(userId) {
  var vault = getAccountVault().filter(function (a) { return a.user_id !== userId; });
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

// Переключает АКТИВНУЮ сессию текущей вкладки на другой аккаунт из сейфа, без пароля.
// Возвращает true/false.
async function switchToVaultAccount(client, userId) {
  var vault = getAccountVault();
  var entry = vault.find(function (a) { return a.user_id === userId; });
  if (!entry) return false;

  var { error } = await client.auth.setSession({
    access_token: entry.access_token,
    refresh_token: entry.refresh_token
  });
  return !error;
}

// Создаёт Supabase-клиент с сессией в sessionStorage (своя для КАЖДОЙ вкладки) —
// чинит путаницу аккаунтов между вкладками. Имя блокировки НЕ делаем уникальным на вкладку:
// это позволяет Supabase корректно координировать обновление токена, если один и тот же
// аккаунт открыт сразу в нескольких вкладках (иначе токен-обновление гонится и вылетает вход).
// Изоляция между РАЗНЫМИ аккаунтами в разных вкладках обеспечивается самим sessionStorage,
// а не именем блокировки — так что это ничего не ломает.
function createBlizkoClient() {
  var client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  // Обновляем токен сессии только пока вкладка активна (видна на экране).
  // Если этот же аккаунт открыт в нескольких вкладках одновременно, без этой меры они
  // одновременно пытаются обновить один и тот же (одноразовый) refresh-токен — и та вкладка,
  // что не успела первой, теряет сессию и вылетает на экран входа. Приостановка обновления
  // в фоновых вкладках убирает эту гонку.
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  handleVisibilityChange();

  client.auth.onAuthStateChange(function (event, session) {
    if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].indexOf(event) !== -1) {
      saveSessionToVault(session);
    }
  });

  return client;
}
