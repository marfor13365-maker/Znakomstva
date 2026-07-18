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

// Уникальный идентификатор ЭТОЙ вкладки (живёт в sessionStorage, значит свой на каждую вкладку).
// Нужен, чтобы у каждой вкладки было своё уникальное имя внутренней блокировки Supabase —
// иначе несколько вкладок одного сайта борются за одну и ту же блокировку и вызывают мигание/гонки.
function getTabId() {
  var id = sessionStorage.getItem('blizko_tab_id');
  if (!id) {
    id = 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('blizko_tab_id', id);
  }
  return id;
}

// Создаёт Supabase-клиент с сессией в sessionStorage (своя для КАЖДОЙ вкладки) —
// чинит путаницу аккаунтов между вкладками. Плюс автоматически подпитывает сейф аккаунтов
// свежими токенами при каждом входе/обновлении токена в этой вкладке.
function createBlizkoClient() {
  var client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: window.sessionStorage,
      storageKey: 'sb-blizko-auth-' + getTabId(),
      persistSession: true,
      autoRefreshToken: true
    }
  });

  client.auth.onAuthStateChange(function (event, session) {
    if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].indexOf(event) !== -1) {
      saveSessionToVault(session);
    }
  });

  return client;
}
