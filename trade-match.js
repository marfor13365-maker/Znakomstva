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

// mine — свои поля (product_buy, product_sell, service_seek, service_offer, job_seek, job_offer)
// author — поля другого профиля с теми же именами колонок.
// Возвращает массив { type: 'service'|'product'|'job', label: '...' }.
function blizkoComputeTradeMatches(mine, author) {
var matches = [];
mine = mine || {};
author = author || {};
if (mine.service_seek && author.service_offer && blizkoFuzzyEq(mine.service_seek, author.service_offer)) {
matches.push({ type: 'service', label: 'Совпадение услуги: ' + author.service_offer });
}
if (mine.service_offer && author.service_seek && blizkoFuzzyEq(mine.service_offer, author.service_seek)) {
matches.push({ type: 'service', label: 'Ищет твою услугу: ' + author.service_seek });
}
if (mine.product_buy && author.product_sell && blizkoFuzzyEq(mine.product_buy, author.product_sell)) {
matches.push({ type: 'product', label: 'Продаёт то, что ты ищешь: ' + author.product_sell });
}
if (mine.product_sell && author.product_buy && blizkoFuzzyEq(mine.product_sell, author.product_buy)) {
matches.push({ type: 'product', label: 'Хочет купить твой товар: ' + author.product_buy });
}
if (mine.job_seek && author.job_offer && blizkoFuzzyEq(mine.job_seek, author.job_offer)) {
matches.push({ type: 'job', label: 'Есть вакансия: ' + author.job_offer });
}
if (mine.job_offer && author.job_seek && blizkoFuzzyEq(mine.job_offer, author.job_seek)) {
matches.push({ type: 'job', label: 'Ищет твою вакансию: ' + author.job_seek });
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
async function blizkoRenderTradeBell(db, myUserId, badgeElId) {
try {
var all = await blizkoGetAllTradeMatches(db, myUserId);
var badge = document.getElementById(badgeElId);
if (!badge) return;
if (all.length > 0) {
badge.textContent = all.length > 99 ? '99+' : String(all.length);
badge.style.display = 'flex';
} else {
badge.style.display = 'none';
}
} catch (e) {
console.error('blizkoRenderTradeBell error:', e);
}
}
