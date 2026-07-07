// Общий модуль темы для всех страниц Blizko
// Подключается как <script src="theme.js"></script> ПЕРЕД остальными скриптами

(function() {
  var THEMES = {
    pink: { accent: '#ff1744', accent2: '#ff5252' },
    tiffany: { accent: '#00bfb3', accent2: '#00e6d6' },
    green: { accent: '#00c853', accent2: '#43ea69' }
  };

  // ============ ЯЗЫКИ ============
  var LANG_RU = {
    feed: 'Лента',
    swipe: 'Знакомства',
    likes: 'Лайки',
    chats: 'Чаты',
    profile: 'Профиль',
    matches: 'Матчи',    // <--- добавлено
    add_post: '+',
    loading: '⏳ Загрузка...',
    no_photos: 'Пока нет фото. Будь первым — добавь своё!',
    views: '👁',
    new_post: 'Новый пост',
    publish: 'Опубликовать',
    caption_placeholder: 'Напиши что-нибудь...',
    comments: 'Комментарии',
    write_comment: 'Написать комментарий...',
    no_comments: 'Пока нет комментариев',
    comments_disabled: 'Комментарии отключены автором',
    match: '❤️ Match',
    like_sent: '✓ Лайк отправлен',
    delete: 'Удалить',
    share: 'Поделиться',
    follow: 'Подписаться',
    following: '✓ Подписан',
    open_profile: '👤 Открыть анкету',
    profile_locked: '🔒 Этот пользователь закрыл свою анкету для всех.',
    profile_match_only: '🔒 Анкета доступна только для мэтчей. Лайкни этого пользователя, чтобы открыть анкету.',
    profile_not_found: 'Профиль не найден',
    error_loading: 'Ошибка загрузки',
    back: '←',
    settings: '⚙️',
    my_profile: 'Моя анкета',
    enable_notifications: '🔔 Включить уведомления',
    logout: 'Выйти из аккаунта',
    delete_account: 'Удалить аккаунт навсегда',
    theme_mode: 'Режим',
    theme_color: 'Цвет',
    posts: 'постов',
    followers: 'подписчиков',
    following_label: 'подписок',
    who_sees_photos: 'Кто видит мои фото в профиле',
    everyone: 'Всем',
    only_matches: 'Только мэтчам',
    no_one: 'Никому',
    change_photo: 'Сменить фото',
    delete_photo: 'Удалить',
    add_to_feed: 'Опубликовать также в ленте',
    tap_to_select: 'Нажми чтобы выбрать фото или видео',
    write_something: 'Напиши что-нибудь...',
    publish_to_feed: 'Опубликовать в ленту',
    photo: 'фото',
    video: 'видео',
    no_followers: 'Пока нет подписчиков',
    no_following: 'Ты пока ни на кого не подписан(а)',
    confirm_delete: 'Удалить этот пост?',
    confirm_delete_account: 'Удалить аккаунт навсегда?',
    delete_account_warning: 'Будут удалены: анкета, фото, посты, лайки, чаты и сообщения. Это действие нельзя отменить.',
    cancel: 'Отмена',
    loading_users: '⏳ Загрузка...',
    profile: 'Профиль',
    just_now: 'только что',
    min: 'мин',
    h: 'ч',
    you: 'Вы',
    write_first: 'Напишите первым!',
    no_matches: 'Пока нет совпадений.\nЛистай анкеты и находи людей!',
    go_swipe: 'Найти людей',
    match_like: '❤️ Понравился(ась)?',
    like: 'Лайкнуть',
    match_text: 'Вы понравились друг другу!',
    go_feed: 'Перейти в ленту',
    no_profiles: 'Пока нет анкет.\nЗагляни позже!',
    chat: 'Чат',
    no_messages: 'Нет сообщений. Напиши первым!',
    write_message: 'Написать сообщение...',
    confirm_delete_chat: 'Точно удалить этот чат? Все сообщения будут удалены.'
  };

  var LANG_EN = {
    feed: 'Feed',
    swipe: 'Dating',
    likes: 'Likes',
    chats: 'Chats',
    profile: 'Profile',
    matches: 'Matches',   // <--- добавлено
    add_post: '+',
    loading: '⏳ Loading...',
    no_photos: 'No photos yet. Be the first to add yours!',
    views: '👁',
    new_post: 'New post',
    publish: 'Publish',
    caption_placeholder: 'Write something...',
    comments: 'Comments',
    write_comment: 'Write a comment...',
    no_comments: 'No comments yet',
    comments_disabled: 'Comments disabled by author',
    match: '❤️ Match',
    like_sent: '✓ Like sent',
    delete: 'Delete',
    share: 'Share',
    follow: 'Follow',
    following: '✓ Following',
    open_profile: '👤 Open profile',
    profile_locked: '🔒 This user has closed their profile to everyone.',
    profile_match_only: '🔒 Profile is only available for matches. Like this user to open their profile.',
    profile_not_found: 'Profile not found',
    error_loading: 'Error loading',
    back: '←',
    settings: '⚙️',
    my_profile: 'My profile',
    enable_notifications: '🔔 Enable notifications',
    logout: 'Logout',
    delete_account: 'Delete account forever',
    theme_mode: 'Mode',
    theme_color: 'Color',
    posts: 'posts',
    followers: 'followers',
    following_label: 'following',
    who_sees_photos: 'Who sees my profile photos',
    everyone: 'Everyone',
    only_matches: 'Only matches',
    no_one: 'No one',
    change_photo: 'Change photo',
    delete_photo: 'Delete',
    add_to_feed: 'Also publish to feed',
    tap_to_select: 'Tap to select photo or video',
    write_something: 'Write something...',
    publish_to_feed: 'Publish to feed',
    photo: 'photo',
    video: 'video',
    no_followers: 'No followers yet',
    no_following: 'You are not following anyone yet',
    confirm_delete: 'Delete this post?',
    confirm_delete_account: 'Delete account forever?',
    delete_account_warning: 'Will be deleted: profile, photos, posts, likes, chats and messages. This action cannot be undone.',
    cancel: 'Cancel',
    loading_users: '⏳ Loading...',
    profile: 'Profile',
    just_now: 'just now',
    min: 'min',
    h: 'h',
    you: 'You',
    write_first: 'Write first!',
    no_matches: 'No matches yet.\nSwipe to find people!',
    go_swipe: 'Find people',
    match_like: '❤️ Liked?',
    like: 'Like',
    match_text: 'You liked each other!',
    go_feed: 'Go to feed',
    no_profiles: 'No profiles yet.\nCheck back later!',
    chat: 'Chat',
    no_messages: 'No messages yet. Write first!',
    write_message: 'Write a message...',
    confirm_delete_chat: 'Delete this chat? All messages will be lost.'
  };

  function getLang() {
    return localStorage.getItem('blizko_lang') || 'ru';
  }

  function setLang(lang) {
    localStorage.setItem('blizko_lang', lang);
    return lang;
  }

  function getText(key) {
    var lang = getLang();
    var dict = lang === 'en' ? LANG_EN : LANG_RU;
    return dict[key] || key;
  }

  function toggleLang() {
    var current = getLang();
    var next = current === 'ru' ? 'en' : 'ru';
    setLang(next);
    applyLang();
    return next;
  }

  function detectBrowserLang() {
    var browserLang = navigator.language || navigator.userLanguage || 'ru';
    if (browserLang.startsWith('en')) return 'en';
    return 'ru';
  }

  function applyLang() {
    var lang = getLang();
    var dict = lang === 'en' ? LANG_EN : LANG_RU;

    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        el.textContent = dict[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) {
        el.placeholder = dict[key];
      }
    });

    var langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.textContent = lang === 'ru' ? 'EN' : 'RU';
    }

    document.documentElement.lang = lang;
  }

  // ============ ТЕМА ============
  function getMode() {
    return localStorage.getItem('blizko_mode') || 'dark';
  }

  function getColor() {
    return localStorage.getItem('blizko_color') || 'pink';
  }

  function applyTheme() {
    var mode = getMode();
    var color = getColor();
    var c = THEMES[color] || THEMES.pink;

    var root = document.documentElement;
    root.style.setProperty('--accent', c.accent);
    root.style.setProperty('--accent2', c.accent2);

    if (mode === 'light') {
      root.style.setProperty('--bg', '#f7f7f9');
      root.style.setProperty('--card', '#ffffff');
      root.style.setProperty('--border', '#e3e3e8');
      root.style.setProperty('--text', '#16161a');
      root.style.setProperty('--muted', '#777');
      root.style.setProperty('--input-bg', '#f0f0f3');
    } else {
      root.style.setProperty('--bg', '#0d0d0d');
      root.style.setProperty('--card', '#161616');
      root.style.setProperty('--border', '#2a2a2a');
      root.style.setProperty('--text', '#f0f0f0');
      root.style.setProperty('--muted', '#888');
      root.style.setProperty('--input-bg', '#1e1e1e');
    }

    document.body.setAttribute('data-theme-mode', mode);
    document.body.setAttribute('data-theme-color', color);
  }

  function setMode(mode) {
    localStorage.setItem('blizko_mode', mode);
    applyTheme();
  }

  function setColor(color) {
    localStorage.setItem('blizko_color', color);
    applyTheme();
  }

  // ============ INIT ============
  function init() {
    if (!localStorage.getItem('blizko_lang')) {
      var detected = detectBrowserLang();
      setLang(detected);
    }
    applyTheme();
    applyLang();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BlizkoTheme = {
    apply: applyTheme,
    setMode: setMode,
    setColor: setColor,
    getMode: getMode,
    getColor: getColor,
    getLang: getLang,
    setLang: setLang,
    toggleLang: toggleLang,
    getText: getText,
    applyLang: applyLang,
    LANG_RU: LANG_RU,
    LANG_EN: LANG_EN
  };
})();
