// ============ ЯНДЕКС.МЕТРИКА ============
(function(m,e,t,r,i,k,a){
    m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
    k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=110760396', 'ym');

ym(110760396, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});

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
    confirm_delete_chat: 'Точно удалить этот чат? Все сообщения будут удалены.',
    // ---- добавлено: никнейм / QR / шаринг ----
    username_copy_title: 'Скопировать',
    username_qr_title: 'QR-код',
    username_edit_title: 'Изменить',
    qr_title: 'Мой QR-код',
    qr_copy_link: '🔗 Скопировать ссылку',
    qr_close: 'Закрыть',
    username_edit_modal_title: 'Свой никнейм',
    username_save: 'Сохранить',
    bell_title: 'Совпадения',
    trade_matches_title: '✨ Совпадения',
    // ---- добавлено: доп.поля анкеты (дети/работа/бизнес/товар/услуга) ----
    extra_section_title: 'Дополнительно (необязательно)',
    children_label: 'Дети',
    job_label: 'Работа',
    business_label: 'Бизнес',
    product_sell_label: 'Товар — хочу продать',
    service_offer_label: 'Услуга — предлагаю',
    job_offer_label: 'Работа — предлагаю вакансию',
    not_specified: 'Не указано',
    other_option: 'Другое (свой вариант)',
    own_variant_placeholder: 'Впиши свой вариант',
    // ---- добавлено: обложка (index.html) и лендинг (landing.html) ----
    menu_title: 'Меню',
    login: 'Войти',
    register: 'Регистрация',
    reviews_link: '⭐ Отзывы',
    rules_link: '📜 Правила',
    made_in: 'Сделано в',
    tagline: 'Настоящие знакомства рядом',
    hero_title_1: 'Настоящие',
    hero_title_span: 'знакомства',
    hero_title_2: 'рядом с тобой',
    hero_sub: 'Люди, дела и совпадения — в одном месте',
    swipe_hint: 'Листай',
    skip: 'Пропустить',
    reviews_heading_1: 'Что говорят',
    reviews_heading_span: 'о нас',
    reviews_heading_sub: 'Оставь свой отзыв — он появится здесь',
    name_label: 'Имя',
    name_placeholder: 'Как тебя зовут?',
    review_label: 'Отзыв',
    review_placeholder: 'Расскажи, как всё прошло...',
    send_review: 'Отправить отзыв',
    testimonials_title: 'Отзывы пользователей',
    start_now: 'Начать сейчас',
    loading_reviews: '⏳ Загружаем отзывы...',
    rules_footer_link: 'Правила сервиса',
    enter_name_err: 'Впиши своё имя',
    set_rating_err: 'Поставь оценку звёздами',
    sending: 'Отправляем...',
    send_fail: 'Не получилось отправить, попробуй ещё раз',
    thanks_review: '✓ Спасибо за отзыв!',
    load_fail: 'Не удалось загрузить отзывы',
    no_reviews_yet: 'Пока никто не оставил отзыв — будь первым!',
    // ---- добавлено: общее меню, анкета, фильтры, профиль, матчи ----
    nav_back: '← Назад',
    search_username_placeholder: 'Поиск по нику, например &ivan482',
    tap_to_open_chat: 'Нажмите, чтобы открыть чат',
    no_matches_yet: 'Пока нет матчей.\nЛайкни кого-нибудь в Знакомствах!',
    searching: '⏳ Ищем...',
    search_error: 'Ошибка поиска',
    no_user_found: 'Никого не нашлось по этому нику',
    session_expired: 'Сессия истекла',
    please_login_again: 'Пожалуйста, войдите заново',
    about_me: 'О себе',
    about_placeholder: 'Расскажи о себе...',
    age_label: 'Возраст',
    city_label: 'Город',
    preferences_section: 'Предпочтения',
    i_am_label: 'Я',
    looking_for_label: 'Ищу',
    choose_placeholder: 'Выбери...',
    gender_male: 'Мужчина',
    gender_female: 'Женщина',
    gender_other: 'Другое',
    looking_male: 'Мужчину',
    looking_female: 'Женщину',
    looking_any: 'Любого',
    extra_desc: 'Эти поля можно не заполнять. Но если то, что ты ищешь, совпадёт с тем, что предлагает другой пользователь (или наоборот) — при просмотре анкет друг друга и в "Знакомствах" это будет отмечено как совпадение ✨.',
    no_children: 'Нет детей',
    child_1: '1 ребёнок',
    child_2: '2 ребёнка',
    child_3plus: '3 и больше',
    business_placeholder: 'Например: IT-консалтинг',
    seek_hint: 'А что ты сам ищешь (товар купить / услугу заказать / работу найти) — настраивается в фильтрах на экране "Знакомства", это видно только тебе.',
    privacy_section: 'Приватность анкеты',
    profile_visibility_label: 'Кто видит мою анкету (о себе, галерею) при просмотре',
    visibility_all: 'Открыта всем',
    visibility_matches: 'Только для мэтчей',
    visibility_none: 'Закрыта для всех',
    publish_profile_btn: 'Опубликовать анкету',
    update_profile_btn: 'Обновить анкету',
    avatar_required_hint: 'Фото анкеты — обязательно для публикации',
    avatar_change_hint: 'Нажми, чтобы сменить фото',
    crop_title: 'Настрой фото',
    crop_hint: 'Потяни, чтобы подвинуть, ползунком — приблизь',
    crop_done: 'Готово',
    avatar_missing_alert: '⚠️ Добавь фото анкеты',
    avatar_missing_hint2: 'Добавь фото — без него анкету нельзя опубликовать',
    age_err: 'Укажи возраст от 18 лет',
    gender_err: 'Укажи свой пол',
    looking_for_err: 'Укажи кого ищешь',
    publishing_msg: 'Публикуем...',
    profile_published: 'Анкета опубликована! ✓',
    photo_size_limit: 'Фото не более 10MB',
    filters_title: '⚙️ Фильтры',
    show_label: 'Показывать',
    men: 'Мужчины',
    women: 'Женщины',
    all_option: 'Все',
    city_example_ph: 'Например: Москва',
    what_seeking_label: 'Что вы ищете (видно только тебе, но по нему будут находиться совпадения с тем, что предлагают в анкетах)',
    product_buy_label: 'Товар — хочу купить',
    service_seek_label: 'Услуга — ищу',
    job_seek_label: 'Работа — ищу',
    reset_btn: 'Сбросить',
    apply_btn: 'Применить',
    no_matches_filter: 'Под такие фильтры никого не нашлось.\nПопробуй расширить критерии.',
    nobody_nearby: 'Пока никого нет рядом.\nПопробуй позже!',
    all_viewed: 'Все анкеты просмотрены!\nЗаходи позже — появятся новые.',
    skip_profile_btn: '👎 Пропустить',
    like_profile_btn: '❤️ Лайк',
    mutual_like_confirm: '🎉 Это взаимный лайк! Перейти в чат?',
    calls_label: 'Звонки',
    ring_sound: '🔊 Звук',
    ring_vibrate: '📳 Вибро',
    ring_silent: '🔕 Тихо',
    my_accounts_label: 'Мои аккаунты на этом устройстве',
    posts_grid_empty: 'У тебя пока нет фото в профиле.\nНажми "+" чтобы добавить!',
    subscribers_title: 'Подписчики',
    subscriptions_title: 'Подписки',
    qr_generating: '⏳ Генерируем...',
    qr_error: '⚠️ Не удалось создать QR-код',
    delete_account_confirm_title: '⚠️ Удалить аккаунт навсегда?',
    comments_disabled_mine: 'Комментарии отключены для остальных (но ты можешь отвечать)',
    fill_profile_hint: '📝 Заполни анкету, чтобы публиковать фото в ленте — иначе там вместо имени будет просто "Пользователь".',
    fill_now_link: 'Заполнить сейчас',
    no_matches_trade: 'Пока нет совпадений.\nЗаполни, что ищешь (в фильтрах "Знакомств") и что предлагаешь (в анкете) — здесь появятся люди, у которых это совпадает.',
    send_like_title: '❤️ Отправить лайк',
    send_like_sub: 'Анкета открыта только мэтчам — но ты можешь лайкнуть с объяснением, в чём совпадение. Если лайкнет в ответ — откроется чат.',
    send_btn: 'Отправить',
    error_loading_short: 'Ошибка загрузки',
    upload_error_prefix: 'Ошибка загрузки: ',
    upload_fail_alert: 'Не удалось загрузить файл (обрыв соединения или файл слишком большой).',
    // ---- добавлено: страница "Кто меня лайкнул" ----
    likes_page_title: 'Кто меня лайкнул',
    no_likes_yet: 'Пока никто не лайкнул.\nЗаполни профиль и добавь фото —\nтебя будут находить чаще!',
    mutual_like_tag: '✓ Взаимный лайк',
    like_back_btn: '❤️ Лайкнуть в ответ',
    skip_plain: 'Пропустить',
    // ---- добавлено: страница просмотра чужой анкеты (view-profile.html) ----
    about: 'О себе',
    gallery: 'Галерея',
    delete_match: '🗑 Удалить матч',
    extra_label: 'Дополнительно',
    field_match_tag: '✨ Совпадение',
    no_bio: 'Пользователь ничего не написал о себе',
    gallery_empty: 'Галерея пуста',
    gallery_locked_none: 'Пользователь закрыл галерею для всех.',
    gallery_locked_matches: 'Галерея доступна только мэтчам.',
    config_error: '❌ Ошибка: config.js не загружен.',
    profile_not_found_full: '⚠️ Анкета не найдена',
    loading_error_prefix: '⚠️ Ошибка загрузки: ',
    chat_deleted: 'Чат удалён.',
    delete_error_prefix: 'Ошибка при удалении: ',
    qr_title_other: 'QR-код анкеты',
    trade_product_buy_label: 'Товар — хочет купить',
    trade_product_sell_label: 'Товар — хочет продать',
    trade_service_seek_label: 'Услуга — ищет',
    trade_service_offer_label: 'Услуга — предлагает',
    trade_job_seek_label: 'Работа — ищет',
    trade_job_offer_label: 'Вакансия — предлагает',
    // ---- добавлено: полноэкранная лента и перевод ----
    grid_mode: 'Сетка',
    translate_link: 'Перевести',
    hide_translation: 'Скрыть перевод',
    translating: 'Переводим...',
    view_comments_link: 'Смотреть комментарии',
    text_post_placeholder: 'О чём думаешь?',
    post_type_photo: '📷 Фото/видео',
    post_type_text: '📝 Текст',
    // ---- добавлено: вкладка "Я лайкнул" на странице Лайков ----
    tab_received: 'Кто меня лайкнул',
    tab_sent: 'Я лайкнул',
    no_sent_likes: 'Ты пока никому не лайкнул(а).\nЛайкай анкеты в "Знакомствах" — они появятся здесь.',
    like_pending: '⏳ Ожидает ответа',
    profile_pending_match: '🔒 Анкета откроется полностью, когда он(а) лайкнет в ответ.',
    send_like_sub_closed: 'Анкета полностью закрыта — просмотреть её будет нельзя, но лайк сохранит этот контакт: если ответит взаимностью, откроется чат.',
    grants_label: 'Открыть этому человеку:',
    grant_about: 'Анкету',
    grant_gallery: 'Галерею',
    grant_chat: 'Чат'
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
    confirm_delete_chat: 'Delete this chat? All messages will be lost.',
    // ---- добавлено: никнейм / QR / шаринг ----
    username_copy_title: 'Copy',
    username_qr_title: 'QR code',
    username_edit_title: 'Edit',
    qr_title: 'My QR code',
    qr_copy_link: '🔗 Copy link',
    qr_close: 'Close',
    username_edit_modal_title: 'Your username',
    username_save: 'Save',
    bell_title: 'Matches',
    trade_matches_title: '✨ Matches',
    // ---- добавлено: доп.поля анкеты (дети/работа/бизнес/товар/услуга) ----
    extra_section_title: 'Additional (optional)',
    children_label: 'Children',
    job_label: 'Job',
    business_label: 'Business',
    product_sell_label: 'Product — selling',
    service_offer_label: 'Service — offering',
    job_offer_label: 'Job — hiring',
    not_specified: 'Not specified',
    other_option: 'Other (your own)',
    own_variant_placeholder: 'Type your own',
    // ---- добавлено: обложка (index.html) и лендинг (landing.html) ----
    menu_title: 'Menu',
    login: 'Log in',
    register: 'Sign up',
    reviews_link: '⭐ Reviews',
    rules_link: '📜 Rules',
    made_in: 'Made by',
    tagline: 'Real connections nearby',
    hero_title_1: 'Real',
    hero_title_span: 'connections',
    hero_title_2: 'near you',
    hero_sub: 'People, deals and matches — all in one place',
    swipe_hint: 'Swipe',
    skip: 'Skip',
    reviews_heading_1: 'What people',
    reviews_heading_span: 'say about us',
    reviews_heading_sub: 'Leave your review — it will appear here',
    name_label: 'Name',
    name_placeholder: "What's your name?",
    review_label: 'Review',
    review_placeholder: 'Tell us how it went...',
    send_review: 'Submit review',
    testimonials_title: 'User reviews',
    start_now: 'Start now',
    loading_reviews: '⏳ Loading reviews...',
    rules_footer_link: 'Terms of service',
    enter_name_err: 'Enter your name',
    set_rating_err: 'Give a star rating',
    sending: 'Sending...',
    send_fail: "Couldn't send, please try again",
    thanks_review: '✓ Thanks for your review!',
    load_fail: 'Failed to load reviews',
    no_reviews_yet: 'No reviews yet — be the first!',
    // ---- добавлено: общее меню, анкета, фильтры, профиль, матчи ----
    nav_back: '← Back',
    search_username_placeholder: 'Search by username, e.g. &ivan482',
    tap_to_open_chat: 'Tap to open chat',
    no_matches_yet: 'No matches yet.\nLike someone in Dating!',
    searching: '⏳ Searching...',
    search_error: 'Search error',
    no_user_found: 'No one found with that username',
    session_expired: 'Session expired',
    please_login_again: 'Please log in again',
    about_me: 'About me',
    about_placeholder: 'Tell about yourself...',
    age_label: 'Age',
    city_label: 'City',
    preferences_section: 'Preferences',
    i_am_label: 'I am',
    looking_for_label: 'Looking for',
    choose_placeholder: 'Choose...',
    gender_male: 'Male',
    gender_female: 'Female',
    gender_other: 'Other',
    looking_male: 'A man',
    looking_female: 'A woman',
    looking_any: 'Anyone',
    extra_desc: 'These fields are optional. But if what you\'re looking for matches what another user offers (or vice versa) — it\'ll be flagged as a match ✨ when viewing profiles and in "Dating".',
    no_children: 'No children',
    child_1: '1 child',
    child_2: '2 children',
    child_3plus: '3 or more',
    business_placeholder: 'e.g. IT consulting',
    seek_hint: 'What you\'re looking for yourself (buy a product / order a service / find a job) is set in the filters on the "Dating" screen — visible only to you.',
    privacy_section: 'Profile privacy',
    profile_visibility_label: 'Who can see my profile (about me, gallery) when viewing',
    visibility_all: 'Open to everyone',
    visibility_matches: 'Matches only',
    visibility_none: 'Closed to everyone',
    publish_profile_btn: 'Publish profile',
    update_profile_btn: 'Update profile',
    avatar_required_hint: 'Profile photo is required to publish',
    avatar_change_hint: 'Tap to change photo',
    crop_title: 'Adjust photo',
    crop_hint: 'Drag to move, use the slider to zoom',
    crop_done: 'Done',
    avatar_missing_alert: '⚠️ Add a profile photo',
    avatar_missing_hint2: "Add a photo — the profile can't be published without it",
    age_err: 'Enter an age of 18 or older',
    gender_err: 'Specify your gender',
    looking_for_err: "Specify who you're looking for",
    publishing_msg: 'Publishing...',
    profile_published: 'Profile published! ✓',
    photo_size_limit: 'Photo must be under 10MB',
    filters_title: '⚙️ Filters',
    show_label: 'Show',
    men: 'Men',
    women: 'Women',
    all_option: 'All',
    city_example_ph: 'e.g. Moscow',
    what_seeking_label: "What you're looking for (visible only to you, but used to find matches with what's offered in profiles)",
    product_buy_label: 'Product — want to buy',
    service_seek_label: 'Service — looking for',
    job_seek_label: 'Job — looking for',
    reset_btn: 'Reset',
    apply_btn: 'Apply',
    no_matches_filter: "No one found for these filters.\nTry widening your criteria.",
    nobody_nearby: 'No one nearby yet.\nCheck back later!',
    all_viewed: "You've viewed all profiles!\nCheck back later for new ones.",
    skip_profile_btn: '👎 Skip',
    like_profile_btn: '❤️ Like',
    mutual_like_confirm: "🎉 It's a mutual like! Go to chat?",
    calls_label: 'Calls',
    ring_sound: '🔊 Sound',
    ring_vibrate: '📳 Vibrate',
    ring_silent: '🔕 Silent',
    my_accounts_label: 'My accounts on this device',
    posts_grid_empty: 'You have no photos in your profile yet.\nTap "+" to add one!',
    subscribers_title: 'Followers',
    subscriptions_title: 'Following',
    qr_generating: '⏳ Generating...',
    qr_error: '⚠️ Could not create QR code',
    delete_account_confirm_title: '⚠️ Delete account forever?',
    comments_disabled_mine: "Comments are disabled for others (but you can still reply)",
    fill_profile_hint: '📝 Fill in your profile to publish photos to the feed — otherwise you\'ll just show as "User" there.',
    fill_now_link: 'Fill in now',
    no_matches_trade: "No matches yet.\nFill in what you're looking for (in Dating filters) and what you offer (in your profile) — people with matching interests will appear here.",
    send_like_title: '❤️ Send a like',
    send_like_sub: "Profile is only open to matches — but you can like with an explanation of the match. If they like back, a chat will open.",
    send_btn: 'Send',
    error_loading_short: 'Error loading',
    upload_error_prefix: 'Upload error: ',
    upload_fail_alert: 'Failed to upload the file (connection issue or file too large).',
    // ---- добавлено: страница "Кто меня лайкнул" ----
    likes_page_title: 'Who liked me',
    no_likes_yet: 'No likes yet.\nFill in your profile and add photos —\nyou\'ll be found more often!',
    mutual_like_tag: '✓ Mutual like',
    like_back_btn: '❤️ Like back',
    skip_plain: 'Skip',
    // ---- добавлено: страница просмотра чужой анкеты (view-profile.html) ----
    about: 'About',
    gallery: 'Gallery',
    delete_match: '🗑 Delete match',
    extra_label: 'Additional',
    field_match_tag: '✨ Match',
    no_bio: "This user hasn't written anything about themselves",
    gallery_empty: 'Gallery is empty',
    gallery_locked_none: 'This user has closed their gallery to everyone.',
    gallery_locked_matches: 'Gallery is only available for matches.',
    config_error: '❌ Error: config.js failed to load.',
    profile_not_found_full: '⚠️ Profile not found',
    loading_error_prefix: '⚠️ Error loading: ',
    chat_deleted: 'Chat deleted.',
    delete_error_prefix: 'Error while deleting: ',
    qr_title_other: 'Profile QR code',
    trade_product_buy_label: 'Product — wants to buy',
    trade_product_sell_label: 'Product — wants to sell',
    trade_service_seek_label: 'Service — looking for',
    trade_service_offer_label: 'Service — offers',
    trade_job_seek_label: 'Job — looking for',
    trade_job_offer_label: 'Job opening — offers',
    // ---- добавлено: полноэкранная лента и перевод ----
    grid_mode: 'Grid',
    translate_link: 'Translate',
    hide_translation: 'Hide translation',
    translating: 'Translating...',
    view_comments_link: 'View comments',
    text_post_placeholder: "What's on your mind?",
    post_type_photo: '📷 Photo/video',
    post_type_text: '📝 Text',
    // ---- добавлено: вкладка "Я лайкнул" на странице Лайков ----
    tab_received: 'Who liked me',
    tab_sent: 'People I liked',
    no_sent_likes: "You haven't liked anyone yet.\nLike profiles in \"Dating\" — they'll show up here.",
    like_pending: '⏳ Waiting for a reply',
    profile_pending_match: '🔒 Their profile will open once they like you back.',
    send_like_sub_closed: "Their profile is fully closed — you won't be able to view it, but a like saves this contact: if they like back, a chat will open.",
    grants_label: 'Open for this person:',
    grant_about: 'Profile',
    grant_gallery: 'Gallery',
    grant_chat: 'Chat'
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

    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-title');
      if (dict[key] !== undefined) {
        el.title = dict[key];
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
