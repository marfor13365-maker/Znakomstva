// trade-match.js
// Общая логика сравнения полей "товар/услуга/работа" между профилями.
// Раньше эта логика была скопирована отдельно в feed.html, swipe.html и
// view-profile.html — при любом изменении алгоритма пришлось бы править в трёх
// местах, и со временем они бы разъехались. Теперь один источник правды.

function blizkoFuzzyEq(a, b) {
var x = (a || '').trim().toLowerCase();
var y = (b || '').trim().toLowerCase();
if (!x || !y) return false;
return x === y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
}

function blizkoTradeLang() {
return (typeof BlizkoTheme !== 'undefined') ? BlizkoTheme.getLang() : 'ru';
}

function blizkoTradeLabel(ru, en) {
return blizkoTradeLang() === 'en' ? en : ru;
}

// mine — свои поля (product_buy, product_sell, service_seek, service_offer, job_seek, job_offer)
// author — поля другого профиля с теми же именами колонок.
// Возвращает массив { type: 'service'|'product'|'job', label: '...' }.
function blizkoComputeTradeMatches(mine, author) {
var matches = [];
mine = mine || {};
author = author || {};
if (mine.service_seek && author.service_offer && blizkoFuzzyEq(mine.service_seek, author.service_offer)) {
matches.push({ type: 'service', label: blizkoTradeLabel('Совпадение услуги: ', 'Service match: ') + author.service_offer });
}
if (mine.service_offer && author.service_seek && blizkoFuzzyEq(mine.service_offer, author.service_seek)) {
matches.push({ type: 'service', label: blizkoTradeLabel('Ищет твою услугу: ', 'Looking for your service: ') + author.service_seek });
}
if (mine.product_buy && author.product_sell && blizkoFuzzyEq(mine.product_buy, author.product_sell)) {
matches.push({ type: 'product', label: blizkoTradeLabel('Продаёт то, что ты ищешь: ', 'Selling what you want: ') + author.product_sell });
}
if (mine.product_sell && author.product_buy && blizkoFuzzyEq(mine.product_sell, author.product_buy)) {
matches.push({ type: 'product', label: blizkoTradeLabel('Хочет купить твой товар: ', 'Wants to buy your product: ') + author.product_buy });
}
if (mine.job_seek && author.job_offer && blizkoFuzzyEq(mine.job_seek, author.job_offer)) {
matches.push({ type: 'job', label: blizkoTradeLabel('Есть вакансия: ', 'Has a job opening: ') + author.job_offer });
}
if (mine.job_offer && author.job_seek && blizkoFuzzyEq(mine.job_offer, author.job_seek)) {
matches.push({ type: 'job', label: blizkoTradeLabel('Ищет твою вакансию: ', 'Looking for your job opening: ') + author.job_seek });
}
return matches;
}

var TRADE_FIELDS_SELECT = 'id, name, age, city, photo_url, product_buy, product_sell, service_seek, service_offer, job_seek, job_offer, username, profile_visibility';

// Тянет мои поля + всех кандидатов с хотя бы одним заполненным полем товар/услуга/работа,
// и считает совпадения по каждому. Используется и для бейджа-счётчика на колокольчике,
// и для полного списка на странице trade-matches.html — одна и та же функция, чтобы
// число на колокольчике всегда совпадало с тем, что видно в списке.
async function blizkoGetAllTradeMatches(db, myUserId) {
var { data: mine } = await db.from('profiles')
.select('product_buy, product_sell, service_seek, service_offer, job_seek, job_offer')
.eq('id', myUserId)
.maybeSingle();
mine = mine || {};
var hasAnyOfMine = mine.product_buy || mine.product_sell || mine.service_seek || mine.service_offer || mine.job_seek || mine.job_offer;
if (!hasAnyOfMine) return [];

var { data: candidates, error } = await db.from('profiles')
.select(TRADE_FIELDS_SELECT)
.neq('id', myUserId)
.eq('is_active', true)
.or('product_buy.not.is.null,product_sell.not.is.null,service_seek.not.is.null,service_offer.not.is.null,job_seek.not.is.null,job_offer.not.is.null');
if (error) { console.error('blizkoGetAllTradeMatches error:', error); return []; }

var results = [];
(candidates || []).forEach(function(c) {
var matches = blizkoComputeTradeMatches(mine, c);
if (matches.length > 0) results.push({ profile: c, matches: matches });
});
return results;
}

// Ставит число на бейдж колокольчика (скрывает бейдж, если совпадений нет).
// ============ ОТМЕТКИ "ПРОСМОТРЕНО" ДЛЯ БЕЙДЖА СОВПАДЕНИЙ ============
// Хранится на устройстве (как и другие "просмотрено"-метки в приложении).
// Список ID тех, чьё совпадение уже видели на странице trade-matches.html —
// бейдж на колокольчике считает только НЕ просмотренные совпадения, чтобы
// метка исчезала после захода в список и не копилась бессмысленно.
var BLIZKO_TRADE_SEEN_KEY = 'blizko_trade_seen_ids';

function blizkoGetTradeSeenSet() {
try {
return new Set(JSON.parse(localStorage.getItem(BLIZKO_TRADE_SEEN_KEY) || '[]'));
} catch (e) {
return new Set();
}
}

// Вызывать при открытии списка совпадений (trade-matches.html) — помечает всех,
// кто сейчас в списке, как просмотренных. Новые совпадения, появившиеся ПОСЛЕ
// этого момента, снова покажутся на бейдже.
function blizkoMarkTradeMatchesSeen(targetIds) {
var seen = blizkoGetTradeSeenSet();
(targetIds || []).forEach(function(id) { seen.add(id); });
try {
localStorage.setItem(BLIZKO_TRADE_SEEN_KEY, JSON.stringify(Array.from(seen)));
} catch (e) {}
}

async function blizkoRenderTradeBell(db, myUserId, badgeElId) {
try {
var all = await blizkoGetAllTradeMatches(db, myUserId);
var badge = document.getElementById(badgeElId);
if (!badge) return;
var seen = blizkoGetTradeSeenSet();
var unseenCount = all.filter(function(entry) { return !seen.has(entry.profile.id); }).length;
if (unseenCount > 0) {
badge.textContent = unseenCount > 99 ? '99+' : String(unseenCount);
badge.style.display = 'flex';
} else {
badge.style.display = 'none';
}
} catch (e) {
console.error('blizkoRenderTradeBell error:', e);
}
}
