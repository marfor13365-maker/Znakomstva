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
