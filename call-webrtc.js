// call-webrtc.js
// Аудиозвонки в Blizko: WebRTC + Supabase.
//
// КРИТИЧНЫЙ ФИКС ЭТОЙ ВЕРСИИ: кнопки оверлея звонка использовали класс `.call-btn` —
// ТОЧНО ТАКОЙ ЖЕ, как кнопка "позвонить" в топбаре chat.html. Стили оверлея добавляются
// в <head> через JS уже ПОСЛЕ того как страница загрузилась (при вызове initCallModule()),
// поэтому при одинаковой специфичности CSS-правило оверлея (.call-btn{background:var(--input-bg)})
// побеждало правило страницы (.call-btn{background:var(--accent)}) — топбар-кнопка звонка
// перекрашивалась в серый именно в момент инициализации модуля звонков. Это и есть причина
// "сначала в тему, потом перекрашивается". Теперь все кнопки оверлея используют уникальный
// класс `.blizko-call-btn`, конфликтов с кнопками страниц больше нет.
//
// ФИКС: сообщение "громкая связь не поддерживается браузером" раньше показывалось через
// нативный alert() — системный диалог, который выглядит пугающе и блокирует интерфейс.
// Само сообщение технически верное: HTMLMediaElement.setSinkId() (переключение аудио-выхода)
// действительно не поддерживается частью мобильных браузеров — это ограничение браузера,
// а не баг. Но подавать эту информацию нативным alert() было грубо. Теперь вместо alert()
// используется мягкий toast (showCallToast) — всплывающая подсказка внизу экрана, которая
// сама исчезает через несколько секунд и не блокирует интерфейс звонка.
//
// (сохранены также: буферизация ICE-кандидатов, синхронизация сброса звонка у обеих сторон,
// запись звонка, рингтон/вибро, режим звук/вибро/тихо, всегда видимая кнопка громкой связи.)

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Получает временные TURN-креды с бэкенда перед звонком (нужны, когда участники в
// разных сетях — мобильный интернет обычно не пропускает прямое P2P-соединение
// только через STUN). При сбое запроса тихо откатываемся на ICE_SERVERS (только
// STUN) — звонок всё ещё может сработать в благоприятных сетевых условиях.
async function getIceServers() {
  try {
    const r = await fetch(BLIZKO_API_URL + '/api/calls/turn-credentials');
    if (!r.ok) throw new Error('bad status ' + r.status);
    const data = await r.json();
    if (data && data.iceServers && data.iceServers.length) return data.iceServers;
  } catch (e) {
    log('не удалось получить TURN-креды, используем только STUN', e);
  }
  return ICE_SERVERS;
}

var BLIZKO_API_URL = (typeof window !== 'undefined' && window.BLIZKO_API_URL) ? window.BLIZKO_API_URL : 'https://vector-chat-api.onrender.com';
var RING_TIMEOUT_MS = 45000;
var RING_MODE_KEY = 'blizko_ring_mode'; // 'sound' | 'vibrate' | 'silent'

let pc = null;
let localStream = null;
let remoteStream = null;
let iceChannel = null;
let pendingIceCandidates = [];
let activeCallRowChannel = null;
let declinedChannel = null;
let globalCallsChannel = null;
let currentCallId = null;
let currentMatchId = null;
let _client = null;
let _myUserId = null;
let connectedAt = null;
let durationTimer = null;
let ringTimer = null;
let isMuted = false;
let speakerOn = false;
let isCaller = false;
let callAlreadyLogged = false;

// --- рингтон/вибро ---
let audioCtx = null;
let ringOscInterval = null;
let vibrateInterval = null;

// --- запись звонка ---
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function formatCallDuration(ms) {
  var sec = Math.floor(ms / 1000);
  var m = String(Math.floor(sec / 60)).padStart(2, '0');
  var s = String(sec % 60).padStart(2, '0');
  return m + ':' + s;
}

async function logCallToChat(text) {
  if (!currentMatchId || !_client || !_myUserId) return;
  try {
    await _client.from('messages').insert({
      match_id: currentMatchId,
      sender_id: _myUserId,
      text: text
    });
  } catch (e) {
    log('не удалось записать лог звонка в чат', e);
  }
}

function log(...args) {
  console.log('[call]', ...args);
}

function iceChannelName(matchId) {
  return `call-ice-${matchId}`;
}

// ---------- Локализация подписей кнопок ----------

var LABELS = {
  ru: {
    calling: '📞 Вызов...',
    incoming: '📞 Входящий звонок...',
    declined: '❌ Звонок отклонён',
    mute: 'Микрофон',
    unmute: 'Без звука',
    record: 'Запись',
    recording: 'Идёт запись',
    stopRecord: 'Стоп запись',
    hangup: 'Сброс',
    speaker: 'Громкая',
    accept: 'Принять',
    decline: 'Отклонить',
    speakerUnsupported: 'Переключение громкой связи не поддерживается этим браузером. Попробуй воспользоваться системными кнопками громкости телефона во время звонка.',
  },
  en: {
    calling: '📞 Calling...',
    incoming: '📞 Incoming call...',
    declined: '❌ Call declined',
    mute: 'Mute',
    unmute: 'Unmute',
    record: 'Record',
    recording: 'Recording',
    stopRecord: 'Stop rec.',
    hangup: 'End',
    speaker: 'Speaker',
    accept: 'Accept',
    decline: 'Decline',
    speakerUnsupported: 'Switching to loudspeaker is not supported by this browser. Try using your phone\'s volume buttons during the call.',
  },
};

function getLang() {
  var l = null;
  try { l = localStorage.getItem('blizko_lang'); } catch (e) {}
  return l === 'en' ? 'en' : 'ru';
}

function t(key) {
  var dict = LABELS[getLang()] || LABELS.ru;
  return dict[key] || key;
}

// ---------- SVG-иконки (наследуют цвет кнопки через currentColor) ----------

var ICONS = {
  phone: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  phoneOff: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.86.31 1.76.53 2.67.65A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  mic: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  record: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
};

function iconEl(name) {
  return ICONS[name] || '';
}

// ---------- Режим звонка (звук / вибро / тихо) ----------

export function getRingMode() {
  var m = null;
  try { m = localStorage.getItem(RING_MODE_KEY); } catch (e) {}
  return (m === 'vibrate' || m === 'silent') ? m : 'sound';
}

export function setRingMode(mode) {
  if (['sound', 'vibrate', 'silent'].indexOf(mode) === -1) return;
  try { localStorage.setItem(RING_MODE_KEY, mode); } catch (e) {}
  notifyServiceWorkerRingMode();
}

function notifyServiceWorkerRingMode() {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'ring-mode', mode: getRingMode() });
    }
  } catch (e) {}
}

// ---------- Инициализация ----------

export function initCallModule(supabaseClient, myUserId) {
  _client = supabaseClient;
  _myUserId = myUserId;
  injectStyles();

  notifyServiceWorkerRingMode();
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(function () { notifyServiceWorkerRingMode(); }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', notifyServiceWorkerRingMode);
  }
}

// Слушает ВСЕ входящие звонки для этого пользователя на любой странице приложения.
export async function initGlobalCallListener() {
  if (!_client || !_myUserId) {
    console.warn('[call] initCallModule не вызван перед initGlobalCallListener');
    return;
  }

  try {
    const cutoff = new Date(Date.now() - RING_TIMEOUT_MS).toISOString();
    const { data: pending } = await _client
      .from('calls')
      .select('*')
      .eq('callee_id', _myUserId)
      .eq('status', 'ringing')
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);
    if (pending && pending.length > 0) {
      handleIncomingCallRow(pending[0]);
    }
  } catch (e) { log('ошибка проверки текущих звонков', e); }

  if (globalCallsChannel) return;
  globalCallsChannel = _client.channel('calls-listener-' + _myUserId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'calls',
      filter: 'callee_id=eq.' + _myUserId,
    }, (payload) => {
      handleIncomingCallRow(payload.new);
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'calls',
      filter: 'callee_id=eq.' + _myUserId,
    }, (payload) => {
      if (payload.new.status !== 'ringing' && payload.new.id === currentCallId && !pc) {
        stopRingtone();
        closeIceChannel();
        hideCallScreen();
        currentCallId = null;
      }
    })
    .subscribe();
}

async function handleIncomingCallRow(row) {
  if (!row || row.status !== 'ringing') return;
  if (currentCallId) return;
  currentCallId = row.id;
  currentMatchId = row.match_id;

  // Подписываемся на ICE-канал СРАЗУ, ещё до того как человек нажмёт "Принять" —
  // иначе теряются кандидаты, отправленные звонящим во время гудков.
  openIceChannel(row.match_id, row.id);

  let name = 'Пользователь';
  let avatarUrl = '';
  try {
    const { data: prof } = await _client.from('profiles').select('name, photo_url').eq('id', row.caller_id).single();
    if (prof) { name = prof.name || name; avatarUrl = prof.photo_url || ''; }
  } catch (e) {}

  showIncomingScreen(name, avatarUrl, {
    onAccept: () => { stopRingtone(); acceptCurrentCall(row); },
    onDecline: () => { stopRingtone(); declineIncomingCall(row.id); },
  });
  startRingtone();

  clearTimeout(ringTimer);
  ringTimer = setTimeout(() => {
    if (currentCallId === row.id && !pc) {
      stopRingtone();
      closeIceChannel();
      hideCallScreen();
      currentCallId = null;
    }
  }, RING_TIMEOUT_MS);
}

// Расширенный набор аудио-constraint'ов против эха/скрипа.
// ВАЖНО: echoCancellation борется только с "ближним" эхом — своим же звуком из динамика,
// попавшим обратно в свой микрофон. Если оба телефона стоят рядом друг с другом на одном
// столе во время теста — это классическая акустическая обратная связь между ДВУМЯ разными
// устройствами (как микрофон у колонки на концерте), и её никаким software-эхоподавлением
// с одной стороны не убрать. Для чистого теста звука разноси телефоны по разным комнатам
// или используй наушники хотя бы на одном из них.
function micConstraints() {
  return {
    audio: {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: 1,
      googEchoCancellation: true,
      googAutoGainControl: true,
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
    },
    video: false,
  };
}

// Общий обработчик изменений статуса звонка — используется ОБЕИМИ сторонами после
// установления соединения, чтобы сброс с одной стороны сразу закрывал экран у другой.
function watchCallRowStatus(callId, onAccepted) {
  if (activeCallRowChannel) return;
  activeCallRowChannel = _client.channel('call-row-' + callId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'calls',
      filter: 'id=eq.' + callId,
    }, async (payload) => {
      const row = payload.new;
      if (row.status === 'accepted' && onAccepted) {
        await onAccepted(row);
      }
      if (row.status === 'ended' || row.status === 'missed') {
        cleanupCall();
      }
    })
    .subscribe();
}

// ---------- Исходящий звонок ----------

export async function startCall(matchId, calleeUserId, name, avatarUrl) {
  if (!_client) throw new Error('call модуль не инициализирован. Сначала вызовите initCallModule');

  const callId = crypto.randomUUID();
  currentCallId = callId;
  currentMatchId = matchId;
  isCaller = true;
  callAlreadyLogged = false;

  showOutgoingScreen(name, avatarUrl);

  try {
    localStream = await navigator.mediaDevices.getUserMedia(micConstraints());
  } catch (e) {
    hideCallScreen();
    currentCallId = null;
    throw new Error('Нет доступа к микрофону');
  }

  updateMuteButton();

  const iceServers = await getIceServers();
  pc = new RTCPeerConnection({ iceServers: iceServers });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  wireConnectionEvents(name, avatarUrl);
  openIceChannel(matchId, callId);
  flushPendingIceCandidates();

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const { error: insertErr } = await _client.from('calls').insert({
    id: callId,
    match_id: matchId,
    caller_id: _myUserId,
    callee_id: calleeUserId,
    offer_sdp: offer,
    status: 'ringing',
  });
  if (insertErr) {
    log('ошибка записи звонка в БД', insertErr);
    cleanupCall();
    throw new Error('Не удалось начать звонок: ' + insertErr.message);
  }

  watchCallRowStatus(callId, async (row) => {
    if (row.answer_sdp && pc && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(row.answer_sdp));
      flushPendingIceCandidates();
    }
  });

  // declined до ответа — отдельная обработка с экраном "звонок отклонён"
  declinedChannel = _client.channel('call-declined-' + callId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'calls',
      filter: 'id=eq.' + callId,
    }, (payload) => {
      if (payload.new.status === 'declined' && !connectedAt) {
        showDeclinedScreen(name, avatarUrl);
        callAlreadyLogged = true;
        logCallToChat('📞 Звонок отклонён');
        setTimeout(() => cleanupCall(), 1600);
      }
    })
    .subscribe();

  notifyIncomingCallPush(matchId, calleeUserId, callId).catch((e) => log('push-уведомление не отправлено', e));

  clearTimeout(ringTimer);
  ringTimer = setTimeout(async () => {
    if (currentCallId === callId && !connectedAt) {
      try {
        await _client.from('calls').update({ status: 'missed', updated_at: new Date().toISOString() }).eq('id', callId);
      } catch (e) {}
      callAlreadyLogged = true;
      await logCallToChat('📞 Пропущенный звонок');
      cleanupCall();
    }
  }, RING_TIMEOUT_MS);

  return callId;
}

async function notifyIncomingCallPush(matchId, calleeUserId, callId) {
  var sessionResult = await _client.auth.getSession();
  var accessToken = sessionResult.data.session && sessionResult.data.session.access_token;
  if (!accessToken) return;

  var callerName = 'Пользователь';
  try {
    var profResult = await _client.from('profiles').select('name').eq('id', _myUserId).single();
    if (profResult.data && profResult.data.name) callerName = profResult.data.name;
  } catch (e) {}

  await fetch(BLIZKO_API_URL + '/api/calls/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_user_id: calleeUserId,
      from_user_id: _myUserId,
      access_token: accessToken,
      caller_name: callerName,
      call_id: callId,
      match_id: matchId,
    }),
  });
}

async function acceptCurrentCall(row) {
  clearTimeout(ringTimer);
  isCaller = false;
  callAlreadyLogged = false;
  const infoName = document.getElementById('call-name-text')?.textContent || 'Пользователь';
  const infoAvatar = document.getElementById('call-avatar-img')?.src || '';

  try {
    localStream = await navigator.mediaDevices.getUserMedia(micConstraints());
  } catch (e) {
    hideCallScreen();
    currentCallId = null;
    return;
  }

  updateMuteButton();

  const iceServers = await getIceServers();
  pc = new RTCPeerConnection({ iceServers: iceServers });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  wireConnectionEvents(infoName, infoAvatar);
  // ICE-канал уже открыт в handleIncomingCallRow.

  await pc.setRemoteDescription(new RTCSessionDescription(row.offer_sdp));
  flushPendingIceCandidates();

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await _client.from('calls').update({
    answer_sdp: answer,
    status: 'accepted',
    updated_at: new Date().toISOString(),
  }).eq('id', row.id);

  // Принявший тоже следит за статусом строки — чтобы сброс с любой стороны после
  // соединения сразу закрывал экран у обоих.
  watchCallRowStatus(row.id, null);
}

async function declineIncomingCall(callId) {
  clearTimeout(ringTimer);
  stopRingtone();
  try {
    await _client.from('calls').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', callId);
  } catch (e) {}
  closeIceChannel();
  hideCallScreen();
  if (currentCallId === callId) currentCallId = null;
}

function openIceChannel(matchId, callId) {
  if (iceChannel) return; // уже открыт — не дублируем подписку
  iceChannel = _client.channel(iceChannelName(matchId) + '-' + callId, { config: { broadcast: { self: false } } });
  iceChannel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
    if (payload.payload.callId !== callId || payload.payload.fromUserId === _myUserId) return;
    if (!pc) {
      pendingIceCandidates.push(payload.payload.candidate);
      return;
    }
    try { await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate)); }
    catch (e) { log('ошибка ICE', e); }
  });
  iceChannel.subscribe();
}

function flushPendingIceCandidates() {
  if (!pc || pendingIceCandidates.length === 0) return;
  var toFlush = pendingIceCandidates;
  pendingIceCandidates = [];
  toFlush.forEach(function (c) {
    pc.addIceCandidate(new RTCIceCandidate(c)).catch(function (e) { log('ошибка ICE (flush)', e); });
  });
}

function closeIceChannel() {
  if (iceChannel && _client) { _client.removeChannel(iceChannel); iceChannel = null; }
  pendingIceCandidates = [];
}

function wireConnectionEvents(name, avatarUrl) {
  pc.onicecandidate = (event) => {
    if (event.candidate && iceChannel && currentCallId) {
      iceChannel.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { callId: currentCallId, fromUserId: _myUserId, candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    remoteStream = event.streams[0];
    let audioEl = document.getElementById('call-remote-audio');
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'call-remote-audio';
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = remoteStream;
  };

  let disconnectTimer = null;
  pc.onconnectionstatechange = () => {
    log('connection state', pc.connectionState);
    if (pc.connectionState === 'connected') {
      clearTimeout(ringTimer);
      clearTimeout(disconnectTimer);
      stopRingtone();
      showConnectedScreen(name, avatarUrl);
    }
    if (pc.connectionState === 'disconnected') {
      clearTimeout(disconnectTimer);
      disconnectTimer = setTimeout(() => {
        if (pc && pc.connectionState === 'disconnected') cleanupCall();
      }, 6000);
    }
    if (['failed', 'closed'].includes(pc.connectionState)) {
      clearTimeout(disconnectTimer);
      cleanupCall();
    }
  };

  pc.oniceconnectionstatechange = () => {
    log('ICE state', pc.iceConnectionState);
  };
}

export function endCall() {
  if (currentCallId && _client) {
    _client.from('calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', currentCallId).then(() => {}, () => {});
  }
  cleanupCall();
}

export function declineCall() {
  if (currentCallId) declineIncomingCall(currentCallId);
}

function cleanupCall() {
  if (isCaller && currentMatchId && !callAlreadyLogged) {
    callAlreadyLogged = true;
    if (connectedAt) {
      logCallToChat('📞 Звонок • ' + formatCallDuration(Date.now() - connectedAt));
    } else {
      logCallToChat('📞 Звонок отменён');
    }
  }
  clearTimeout(ringTimer);
  stopRingtone();
  if (isRecording) stopRecording();
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  remoteStream = null;
  closeIceChannel();
  if (activeCallRowChannel && _client) { _client.removeChannel(activeCallRowChannel); activeCallRowChannel = null; }
  if (declinedChannel && _client) { _client.removeChannel(declinedChannel); declinedChannel = null; }
  currentCallId = null;
  currentMatchId = null;
  isMuted = false;
  speakerOn = false;
  isCaller = false;
  callAlreadyLogged = false;
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
  connectedAt = null;
  hideCallScreen();
}

// ---------- Рингтон / вибро на входящем звонке ----------

function beep(freq, startTime, duration) {
  if (!audioCtx) return;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function playRingCycle() {
  if (!audioCtx) return;
  var t = audioCtx.currentTime;
  beep(950, t, 0.35);
  beep(950, t + 0.45, 0.35);
}

function startRingtone() {
  var mode = getRingMode();
  if (mode === 'silent') return;

  if (mode === 'sound') {
    try {
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      playRingCycle();
      clearInterval(ringOscInterval);
      ringOscInterval = setInterval(playRingCycle, 1800);
    } catch (e) { log('ringtone error', e); }
  }

  if ((mode === 'sound' || mode === 'vibrate') && navigator.vibrate) {
    navigator.vibrate([400, 200, 400]);
    clearInterval(vibrateInterval);
    vibrateInterval = setInterval(function () { navigator.vibrate([400, 200, 400]); }, 1800);
  }
}

function stopRingtone() {
  if (ringOscInterval) { clearInterval(ringOscInterval); ringOscInterval = null; }
  if (vibrateInterval) { clearInterval(vibrateInterval); vibrateInterval = null; }
  if (navigator.vibrate) navigator.vibrate(0);
  if (audioCtx && audioCtx.state === 'running' && !pc) {
    try { audioCtx.suspend(); } catch (e) {}
  }
}

// ---------- Мягкое уведомление вместо alert() ----------

var _toastTimer = null;
function showCallToast(message) {
  var toast = document.getElementById('call-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'call-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () {
    toast.classList.remove('show');
  }, 3800);
}

// ---------- Управление аудио ----------

export function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
  updateMuteButton();
}

export async function toggleSpeaker() {
  const audioEl = document.getElementById('call-remote-audio');
  if (!audioEl || typeof audioEl.setSinkId !== 'function') {
    showCallToast(t('speakerUnsupported'));
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const speaker = devices.find((d) => d.kind === 'audiooutput' && /speaker/i.test(d.label));
    speakerOn = !speakerOn;
    await audioEl.setSinkId(speakerOn && speaker ? speaker.deviceId : 'default');
    updateSpeakerButton();
  } catch (e) {
    log('ошибка переключения динамика', e);
    showCallToast(t('speakerUnsupported'));
  }
}

// ---------- Запись звонка ----------

export async function toggleRecording() {
  if (isRecording) {
    stopRecording();
    return;
  }
  if (!localStream || !remoteStream || !pc || pc.connectionState !== 'connected') return;

  try {
    if (!audioCtx || audioCtx.state === 'closed') audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    var dest = audioCtx.createMediaStreamDestination();
    var srcLocal = audioCtx.createMediaStreamSource(localStream);
    var srcRemote = audioCtx.createMediaStreamSource(remoteStream);
    srcLocal.connect(dest);
    srcRemote.connect(dest);

    recordedChunks = [];
    var mimeType = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    mediaRecorder = new MediaRecorder(dest.stream, { mimeType: mimeType });
    mediaRecorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = uploadRecording;
    mediaRecorder.start();
    isRecording = true;
    updateRecordButton();
  } catch (e) {
    log('не удалось начать запись', e);
    showCallToast(getLang() === 'en' ? 'Could not start recording.' : 'Не удалось начать запись звонка.');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch (e) {}
  }
  isRecording = false;
  updateRecordButton();
}

async function uploadRecording() {
  var chunks = recordedChunks;
  recordedChunks = [];
  if (!chunks.length || !_client || !currentMatchId) return;

  var blob = new Blob(chunks, { type: 'audio/webm' });
  var fileName = 'call_' + Date.now() + '.webm';

  try {
    var up = await _client.storage.from('call-recordings').upload(fileName, blob);
    if (up.error) {
      log('ошибка загрузки записи', up.error);
      showCallToast((getLang() === 'en' ? 'Could not save call recording: ' : 'Не удалось сохранить запись звонка: ') + up.error.message);
      return;
    }
    var url = _client.storage.from('call-recordings').getPublicUrl(fileName).data.publicUrl;
    await _client.from('messages').insert({
      match_id: currentMatchId,
      sender_id: _myUserId,
      file_url: url,
      file_name: 'call-recording.webm',
      text: '🎙️ ' + (getLang() === 'en' ? 'Call recording' : 'Запись звонка'),
    });
  } catch (e) {
    log('ошибка сохранения записи', e);
  }
}

// ---------- UI ----------

function injectStyles() {
  if (document.getElementById('call-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'call-ui-styles';
  style.textContent = `
    #call-screen-overlay{position:fixed;inset:0;background:linear-gradient(180deg,var(--card,#161616),var(--bg,#0d0d0d));z-index:9999;
      display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:60px 24px 50px;
      font-family:'Inter',sans-serif;color:var(--text,#f0f0f0);text-align:center}
    #call-screen-overlay .call-top{display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:20px}
    #call-avatar-img, .call-avatar-fallback{width:140px;height:140px;border-radius:50%;object-fit:cover;
      background:var(--input-bg,#2a2a2a);border:4px solid var(--accent,#ff4d6d);display:flex;align-items:center;justify-content:center;font-size:56px;
      box-shadow:0 0 40px rgba(0,0,0,0.4)}
    #call-name-text{font-family:'Unbounded',sans-serif;font-size:22px;font-weight:600;margin-top:4px}
    #call-status-text{color:var(--muted,#888);font-size:15px;margin-top:2px}
    #call-status-text.ringing-pulse{animation:callRingPulse 1.4s ease-in-out infinite}
    @keyframes callRingPulse{0%,100%{opacity:1}50%{opacity:0.4}}
    #call-duration-text{color:var(--accent2,#ff8fa3);font-size:16px;font-variant-numeric:tabular-nums;margin-top:4px}
    #call-rec-indicator{display:none;align-items:center;gap:6px;justify-content:center;color:#ff4d4d;font-size:12px;font-weight:600;margin-top:8px}
    #call-rec-indicator.show{display:flex}
    #call-rec-indicator .dot{width:8px;height:8px;border-radius:50%;background:#ff4d4d;animation:callRecBlink 1s ease-in-out infinite}
    @keyframes callRecBlink{0%,100%{opacity:1}50%{opacity:0.25}}
    .call-controls-row{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;width:100%}
    .call-btn-wrap{display:flex;flex-direction:column;align-items:center;gap:6px}
    .call-btn-wrap .call-btn-label{font-size:11px;color:var(--muted,#888);font-weight:500}
    .blizko-call-btn{width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;
      display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:var(--input-bg,#2a2a2a);color:var(--text,#f0f0f0);
      box-shadow:0 4px 16px rgba(0,0,0,0.3)}
    .blizko-call-btn:active{transform:scale(0.92)}
    .blizko-call-btn.secondary.active{background:var(--accent,#ff4d6d);color:white}
    .call-btn-wrap.disabled{opacity:0.35;pointer-events:none}
    .blizko-call-btn.hangup{background:#ff2d4d;color:white;width:72px;height:72px;box-shadow:0 4px 24px rgba(255,45,77,0.4)}
    .call-incoming-actions{display:flex;gap:56px;justify-content:center;width:100%;margin-top:20px}
    .call-incoming-actions .blizko-call-btn.accept{background:#2ecc71;color:white;width:72px;height:72px;box-shadow:0 4px 24px rgba(46,204,113,0.4)}
    .call-incoming-actions .blizko-call-btn.hangup{box-shadow:0 4px 24px rgba(255,45,77,0.4)}
    #call-toast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%) translateY(20px);
      background:rgba(20,20,20,0.95);color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;
      max-width:85vw;text-align:center;line-height:1.4;z-index:10000;opacity:0;pointer-events:none;
      transition:opacity 0.25s,transform 0.25s;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
    #call-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  `;
  document.head.appendChild(style);
}

function avatarHtml(avatarUrl) {
  return avatarUrl
    ? `<img id="call-avatar-img" src="${avatarUrl}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'call-avatar-fallback',textContent:'👤'}))">`
    : `<div id="call-avatar-img" class="call-avatar-fallback">👤</div>`;
}

function renderOverlay(innerHtml) {
  let overlay = document.getElementById('call-screen-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'call-screen-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = innerHtml;
}

function controlsRowHtml(connected) {
  var disabledCls = connected ? '' : ' disabled';
  var html = '<div class="call-controls-row">';

  html += '<div class="call-btn-wrap"><button class="blizko-call-btn secondary" id="call-mute-btn" onclick="window.__callToggleMute()">' + iconEl('mic') + '</button><span class="call-btn-label" id="call-mute-label">' + t('mute') + '</span></div>';

  html += '<div class="call-btn-wrap' + disabledCls + '"><button class="blizko-call-btn secondary" id="call-record-btn" onclick="window.__callToggleRecord()">' + iconEl('record') + '</button><span class="call-btn-label">' + t('record') + '</span></div>';

  html += '<div class="call-btn-wrap"><button class="blizko-call-btn hangup" onclick="window.__callHangup()">' + iconEl('phoneOff') + '</button><span class="call-btn-label">' + t('hangup') + '</span></div>';

  html += '<div class="call-btn-wrap"><button class="blizko-call-btn secondary" id="call-speaker-btn" onclick="window.__callToggleSpeaker()">' + iconEl('speaker') + '</button><span class="call-btn-label">' + t('speaker') + '</span></div>';

  html += '</div>';
  return html;
}

function wireCommonHandlers() {
  window.__callHangup = () => endCall();
  window.__callToggleMute = () => toggleMute();
  window.__callToggleSpeaker = () => toggleSpeaker();
  window.__callToggleRecord = () => toggleRecording();
}

function showOutgoingScreen(name, avatarUrl) {
  renderOverlay(`
    <div class="call-top">
      ${avatarHtml(avatarUrl)}
      <div id="call-name-text">${name}</div>
      <div id="call-status-text" class="ringing-pulse">${t('calling')}</div>
    </div>
    ${controlsRowHtml(false)}
  `);
  wireCommonHandlers();
  updateMuteButton();
}

function showIncomingScreen(name, avatarUrl, { onAccept, onDecline }) {
  renderOverlay(`
    <div class="call-top">
      ${avatarHtml(avatarUrl)}
      <div id="call-name-text">${name}</div>
      <div id="call-status-text" class="ringing-pulse">${t('incoming')}</div>
    </div>
    <div class="call-incoming-actions">
      <div class="call-btn-wrap"><button class="blizko-call-btn hangup" onclick="window.__callDeclineBtn()">${iconEl('phoneOff')}</button><span class="call-btn-label">${t('decline')}</span></div>
      <div class="call-btn-wrap"><button class="blizko-call-btn accept" onclick="window.__callAcceptBtn()">${iconEl('phone')}</button><span class="call-btn-label">${t('accept')}</span></div>
    </div>
  `);
  window.__callAcceptBtn = () => onAccept();
  window.__callDeclineBtn = () => onDecline();
}

function showDeclinedScreen(name, avatarUrl) {
  renderOverlay(`
    <div class="call-top">
      ${avatarHtml(avatarUrl)}
      <div id="call-name-text">${name}</div>
      <div id="call-status-text">${t('declined')}</div>
    </div>
    <div></div>
  `);
}

function showConnectedScreen(name, avatarUrl) {
  connectedAt = Date.now();
  renderOverlay(`
    <div class="call-top">
      ${avatarHtml(avatarUrl)}
      <div id="call-name-text">${name}</div>
      <div id="call-duration-text">00:00</div>
      <div id="call-rec-indicator"><span class="dot"></span><span>${t('recording')}</span></div>
    </div>
    ${controlsRowHtml(true)}
  `);
  wireCommonHandlers();
  updateMuteButton();
  updateSpeakerButton();
  updateRecordButton();

  if (durationTimer) clearInterval(durationTimer);
  durationTimer = setInterval(() => {
    const el = document.getElementById('call-duration-text');
    if (!el) return;
    const sec = Math.floor((Date.now() - connectedAt) / 1000);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }, 1000);
}

function updateMuteButton() {
  const btn = document.getElementById('call-mute-btn');
  const label = document.getElementById('call-mute-label');
  if (!btn) return;
  btn.classList.toggle('active', isMuted);
  btn.innerHTML = isMuted ? iconEl('micOff') : iconEl('mic');
  if (label) label.textContent = isMuted ? t('unmute') : t('mute');
}

function updateSpeakerButton() {
  const btn = document.getElementById('call-speaker-btn');
  if (!btn) return;
  btn.classList.toggle('active', speakerOn);
}

function updateRecordButton() {
  const recordBtn = document.getElementById('call-record-btn');
  const wrap = recordBtn ? recordBtn.closest('.call-btn-wrap') : null;
  if (recordBtn) recordBtn.classList.toggle('active', isRecording);
  if (wrap) {
    var label = wrap.querySelector('.call-btn-label');
    if (label) label.textContent = isRecording ? t('stopRecord') : t('record');
  }
  const indicator = document.getElementById('call-rec-indicator');
  if (indicator) indicator.classList.toggle('show', isRecording);
}

function hideCallScreen() {
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
  connectedAt = null;
  const overlay = document.getElementById('call-screen-overlay');
  if (overlay) overlay.remove();
}
