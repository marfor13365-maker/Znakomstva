const SUPABASE_URL = "https://zxzhnmwksygozwtdymmt.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4emhubXdrc3lnb3p3dGR5bW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MjM0OTgsImV4cCI6MjA5Njk5OTQ5OH0.Mi69CvtMzxQ5upkBoDtTa9FaVvtmiN9iUmlN6shDJaw"

// ===== Сейф аккаунтов =====
// Хранит access/refresh токены всех аккаунтов, с которых когда-либо входили на этом устройстве.
// Это позволяет переключаться между своими аккаунтами без повторного ввода пароля.
// Хранится в localStorage (общий на устройство) — это осознанно, в отличие от текущей
// АКТИВНОЙ сессии вкладки (та в sessionStorage). Сейф — это просто "запомненные ключи",
// не активная сессия, поэтому конфликта между вкладками здесь нет.

var VAULT_KEY = 'blizko_account_vault';

// ФИКС: раньше restoreLastVaultSession() при потере сессии вкладки восстанавливала
// аккаунт с САМЫМ СВЕЖИМ updated_at — то есть тот, который последним где-либо на
// устройстве обновил токен (в т.ч. фоновым автообновлением). На Android Chrome
// sessionStorage вкладки нередко очищается системой, когда фоновая вкладка выгружается
// из памяти (частый баг на слабых/старых телефонах, даже вопреки спецификации). При
// следующем открытии вкладка теряла сессию и restoreLastVaultSession() могла молча
// подставить ДРУГОЙ аккаунт с этого же устройства — если у него в этот момент оказался
// более свежий updated_at, — а не тот, которым человек реально только что пользовался.
// Дальше все действия (лайки, сообщения) уходили от имени чужого аккаунта, что и
// объясняло путаницу с матчами между аккаунтами на одном устройстве.
//
// Теперь вместо угадывания "самый свежий" используется ЯВНЫЙ указатель "активный
// аккаунт" — он выставляется только осознанно: при входе или через ручное
// переключение в настройках, а не автообновлением токена в фоне.
var ACTIVE_ACCOUNT_KEY = 'blizko_active_account';

function getActiveAccountId() {
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY) || null;
  } catch (e) {
    return null;
  }
}

function setActiveAccountId(userId) {
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, userId);
  } catch (e) {}
}

function getAccountVault() {
  try {
    return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveSessionToVault(session, markActive) {
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
  // markActive=false используется при фоновом автообновлении токена — оно НЕ должно
  // само по себе менять, какой аккаунт считается "активным" на устройстве.
  if (markActive !== false) {
    setActiveAccountId(session.user.id);
  }
}

function removeFromAccountVault(userId) {
  var vault = getAccountVault().filter(function (a) { return a.user_id !== userId; });
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  if (getActiveAccountId() === userId) {
    try { localStorage.removeItem(ACTIVE_ACCOUNT_KEY); } catch (e) {}
  }
}

// Переключает АКТИВНУЮ сессию текущей вкладки на другой аккаунт из сейфа, без пароля.
// Возвращает true/false.
//
// ФИКС: access_token живёт ~1 час. Если аккаунт из сейфа давно не открывали, setSession
// с протухшим access_token может сразу вернуть ошибку, даже не дойдя до обновления по
// refresh_token (который живёт неделями). Поэтому если первая попытка не удалась —
// пробуем восстановить сессию только по refresh_token через refreshSession().
async function switchToVaultAccount(client, userId) {
  var vault = getAccountVault();
  var entry = vault.find(function (a) { return a.user_id === userId; });
  if (!entry) return false;

  var { error } = await client.auth.setSession({
    access_token: entry.access_token,
    refresh_token: entry.refresh_token
  });
  if (!error) {
    setActiveAccountId(userId);
    return true;
  }

  try {
    var refreshResult = await client.auth.refreshSession({ refresh_token: entry.refresh_token });
    if (refreshResult.error) return false;
    setActiveAccountId(userId);
    return true;
  } catch (e) {
    return false;
  }
}

// Если в этой вкладке нет активной сессии (sessionStorage пуст — например, вкладка
// открыта заново после закрытия приложения, или система Android выгрузила вкладку из
// памяти и очистила её sessionStorage), пробуем незаметно восстановить сессию, вместо
// того чтобы сразу считать пользователя разлогиненным.
//
// Восстанавливаем ИМЕННО тот аккаунт, что явно выставлен активным (setActiveAccountId) —
// а не "самый свежий по updated_at", чтобы фоновое обновление токена ДРУГОГО аккаунта
// на этом же устройстве не могло подменить, кто сейчас залогинен в этой вкладке.
// Если явного указателя нет (совсем старые данные до этого фикса) — по-прежнему
// берём самый свежий как запасной вариант.
async function restoreLastVaultSession(client) {
  var vault = getAccountVault();
  if (!vault || vault.length === 0) return false;

  var activeId = getActiveAccountId();
  var target = activeId ? vault.find(function (a) { return a.user_id === activeId; }) : null;

  if (!target) {
    vault.sort(function (a, b) { return (b.updated_at || 0) - (a.updated_at || 0); });
    target = vault[0];
  }

  try {
    var { error } = await client.auth.setSession({
      access_token: target.access_token,
      refresh_token: target.refresh_token
    });
    if (!error) {
      setActiveAccountId(target.user_id);
      return true;
    }

    var refreshResult = await client.auth.refreshSession({ refresh_token: target.refresh_token });
    if (refreshResult.error) return false;
    setActiveAccountId(target.user_id);
    return true;
  } catch (e) {
    return false;
  }
}

// Создаёт Supabase-клиент с сессией в sessionStorage (своя для КАЖДОЙ вкладки) —
// чинит путаницу аккаунтов между вкладками. Плюс автоматически подпитывает сейф аккаунтов
// свежими токенами при каждом входе/обновлении токена в этой вкладке.
function createBlizkoClient() {
  var client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      storage: window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  client.auth.onAuthStateChange(function (event, session) {
    if (session && ['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION'].indexOf(event) !== -1) {
      // Фоновое автообновление токена (TOKEN_REFRESHED) не должно само по себе менять,
      // какой аккаунт считается активным на устройстве — только реальный вход
      // (SIGNED_IN/INITIAL_SESSION) или явное переключение через switchToVaultAccount.
      saveSessionToVault(session, event !== 'TOKEN_REFRESHED');
    }
  });

  return client;
}
