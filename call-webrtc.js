// call-webrtc.js
// Аудиозвонки в Blizko: WebRTC + Supabase.
// Сигналинг звонка (кто кому звонит, offer/answer) хранится в таблице `calls` —
// это надёжно: звонок "виден" даже если собеседник открыл приложение чуть позже.
// ICE-кандидаты (только пока звонок уже активен) идут через realtime broadcast — это ок,
// т.к. оба участника уже онлайн на экране звонка в этот момент.
//
// НОВОЕ:
// - Запись звонка (локальный + удалённый звук сводятся через Web Audio API, сохраняются в Supabase Storage
//   в бакет "call-recordings" и добавляются файлом в чат). Бакет нужно создать вручную в Supabase (Public).
// - Все кнопки звонка видны сразу — во время дозвона мьют работает сразу, запись/громкая связь
//   активируются как только звонок реально соединился.
// - Рингтон + вибро на входящем звонке, режим (звук/вибро/тихо) хранится в localStorage
//   и синхронизируется с Service Worker'ом, чтобы фоновые push-уведомления тоже его учитывали.
// - Экран звонка больше не хардкодит цвета — использует CSS-переменные темы сайта (--accent, --bg, --text и т.д.),
//   поэтому всегда совпадает с выбранной темой/цветом, а не только иногда.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

var BLIZKO_API_URL = (typeof window !== 'undefined' && window.BLIZKO_API_URL) ? window.BLIZKO_API_URL : 'https://vector-chat-api.onrender.com';
var RING_TIMEOUT_MS = 45000;
var RING_MODE_KEY = 'blizko_ring_mode'; // 'sound' | 'vibrate' | 'silent'

let pc = null;
let localStream = null;
let remoteStream = null;
let iceChannel = null;
let activeCallRowChannel = null;
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

// --- рингтон/вибро ---
let audioCtx = null;
let ringOscInterval = null;
let vibrateInterval = null;

// --- запись звонка ---
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function log(...args) {
  console.log('[call]', ...args);
}

function iceChannelName(matchId) {
  return `call-ice-${matchId}`;
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

  // Сообщаем Service Worker'у текущий режим звонка (звук/вибро/тихо),
  // чтобы фоновые push-уведомления о звонках его тоже учитывали.
  notifyServiceWorkerRingMode();
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(function () { notifyServiceWorkerRingMode(); }).catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', notifyServiceWorkerRingMode);
  }
}

// Слушает ВСЕ входящие звонки для этого пользователя на любой странице приложения.
// Вызывать один раз (после initCallModule) на каждой странице, где должен работать приём звонков.
export async function initGlobalCallListener() {
  if (!_client || !_myUserId) {
    console.warn('[call] initCallModule не вызван перед initGlobalCallListener');
    return;
  }

  // 1) Может звонок уже "звонит", а мы только что открыли страницу
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

  // 2) Слушаем новые звонки и изменения статуса в реальном времени
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
        hideCallScreen();
        currentCallId = null;
      }
    })
    .subscribe();
}

async function handleIncomingCallRow(row) {
  if (!row || row.status !== 'ringing') return;
  if (currentCallId) return; // уже обрабатываем какой-то звонок
  currentCallId = row.id;
  currentMatchId = row.match_id;

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
      hideCallScreen();
      currentCallId = null;
    }
  }, RING_TIMEOUT_MS);
}

// ---------- Исходящий звонок ----------

export async function startCall(matchId, calleeUserId, name, avatarUrl) {
  if (!_client) throw new Error('call модуль не инициализирован. Сначала вызовите initCallModule');

  const callId = crypto.randomUUID();
  currentCallId = callId;
  currentMatchId = matchId;

  showOutgoingScreen(name, avatarUrl);

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (e) {
    hideCallScreen();
    currentCallId = null;
    throw new Error('Нет доступа к микрофону');
  }

  updateMuteButton();

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  wireConnectionEvents(name, avatarUrl);
  openIceChannel(matchId, callId);

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

  activeCallRowChannel = _client.channel('call-row-' + callId)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'calls',
      filter: 'id=eq.' + callId,
    }, async (payload) => {
      const row = payload.new;
      if (row.status === 'accepted' && row.answer_sdp && pc && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(row.answer_sdp));
      } else if (row.status === 'declined') {
        showDeclinedScreen(name, avatarUrl);
        setTimeout(() => cleanupCall(), 1600);
      } else if (row.status === 'ended' || row.status === 'missed') {
        cleanupCall();
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
  const infoName = document.getElementById('call-name-text')?.textContent || 'Пользователь';
  const infoAvatar = document.getElementById('call-avatar-img')?.src || '';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (e) {
    hideCallScreen();
    currentCallId = null;
    return;
  }

  updateMuteButton();

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  wireConnectionEvents(infoName, infoAvatar);
  openIceChannel(row.match_id, row.id);

  await pc.setRemoteDescription(new RTCSessionDescription(row.offer_sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await _client.from('calls').update({
    answer_sdp: answer,
    status: 'accepted',
    updated_at: new Date().toISOString(),
  }).eq('id', row.id);
}

async function declineIncomingCall(callId) {
  clearTimeout(ringTimer);
  stopRingtone();
  try {
    await _client.from('calls').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', callId);
  } catch (e) {}
  hideCallScreen();
  if (currentCallId === callId) currentCallId = null;
}

function openIceChannel(matchId, callId) {
  iceChannel = _client.channel(iceChannelName(matchId) + '-' + callId, { config: { broadcast: { self: false } } });
  iceChannel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
    if (payload.payload.callId !== callId || payload.payload.fromUserId === _myUserId) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate)); }
    catch (e) { log('ошибка ICE', e); }
  });
  iceChannel.subscribe();
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
      // Даём шанс на восстановление (смена сети/аудио-маршрута иногда даёт кратковременный disconnect) —
      // раньше звонок обрывался сразу при любом временном сбое.
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
  clearTimeout(ringTimer);
  stopRingtone();
  if (isRecording) stopRecording();
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  remoteStream = null;
  if (iceChannel && _client) { _client.removeChannel(iceChannel); iceChannel = null; }
  if (activeCallRowChannel && _client) { _client.removeChannel(activeCallRowChannel); activeCallRowChannel = null; }
  currentCallId = null;
  currentMatchId = null;
  isMuted = false;
  speakerOn = false;
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
    // Переключение в громкую связь через браузер поддерживается не везде (в т.ч. Chrome для Android
    // это в принципе не умеет) — поэтому кнопка вместо алерта просто выключена, пока не соединились.
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
  }
}

function speakerSupported() {
  var el = document.createElement('audio');
  return typeof el.setSinkId === 'function';
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
    alert('Не удалось начать запись звонка.');
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
      alert('Не удалось сохранить запись звонка: ' + up.error.message + '\n(проверь, что в Supabase Storage есть публичный бакет "call-recordings")');
      return;
    }
    var url = _client.storage.from('call-recordings').getPublicUrl(fileName).data.publicUrl;
    await _client.from('messages').insert({
      match_id: currentMatchId,
      sender_id: _myUserId,
      file_url: url,
      file_name: 'Запись звонка.webm',
      text: '🎙️ Запись звонка',
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
    .call-controls-row{display:flex;gap:22px;justify-content:center;flex-wrap:wrap;width:100%}
    .call-btn{width:64px;height:64px;border-radius:50%;border:none;font-size:26px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:var(--input-bg,#2a2a2a);color:var(--text,#f0f0f0);
      box-shadow:0 4px 16px rgba(0,0,0,0.3)}
    .call-btn:active{transform:scale(0.92)}
    .call-btn.secondary.active{background:var(--accent,#ff4d6d);color:white}
    .call-btn.secondary.disabled{opacity:0.35;pointer-events:none}
    .call-btn.hangup{background:#ff2d4d;color:white;width:76px;height:76px;font-size:32px;box-shadow:0 4px 24px rgba(255,45,77,0.4)}
    .call-incoming-actions{display:flex;gap:56px;justify-content:center;width:100%;margin-top:20px}
    .call-incoming-actions .call-btn.accept{background:#2ecc71;color:white;width:76px;height:76px;font-size:32px;box-shadow:0 4px 24px rgba(46,204,113,0.4)}
    .call-incoming-actions .call-btn.hangup{box-shadow:0 4px 24px rgba(255,45,77,0.4)}
    .call-btn .label{display:block;font-size:10px;font-weight:500;margin-top:4px;color:var(--muted,#888)}
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

// Единый ряд кнопок — показывается сразу целиком; запись и громкая связь
// активны только когда звонок реально соединён (connected=true).
function controlsRowHtml(connected) {
  var secondaryState = connected ? '' : ' disabled';
  var speakerOk = speakerSupported();
  return '<div class="call-controls-row">' +
    '<button class="call-btn secondary" id="call-mute-btn" onclick="window.__callToggleMute()" title="Микрофон">🎙️</button>' +
    '<button class="call-btn secondary' + secondaryState + '" id="call-record-btn" onclick="window.__callToggleRecord()" title="Записать звонок">⏺</button>' +
    '<button class="call-btn hangup" onclick="window.__callHangup()" title="Завершить">📵</button>' +
    (speakerOk
      ? '<button class="call-btn secondary' + secondaryState + '" id="call-speaker-btn" onclick="window.__callToggleSpeaker()" title="Громкая связь">🔊</button>'
      : '') +
  '</div>';
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
      <div id="call-status-text" class="ringing-pulse">📞 Вызов...</div>
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
      <div id="call-status-text" class="ringing-pulse">📞 Входящий звонок...</div>
    </div>
    <div class="call-incoming-actions">
      <button class="call-btn hangup" onclick="window.__callDeclineBtn()">📵</button>
      <button class="call-btn accept" onclick="window.__callAcceptBtn()">📞</button>
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
      <div id="call-status-text">❌ Звонок отклонён</div>
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
      <div id="call-rec-indicator"><span class="dot"></span><span>Идёт запись</span></div>
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
  if (!btn) return;
  btn.classList.toggle('active', isMuted);
  btn.textContent = isMuted ? '🔇' : '🎙️';
}

function updateSpeakerButton() {
  const btn = document.getElementById('call-speaker-btn');
  if (!btn) return;
  btn.classList.toggle('active', speakerOn);
}

function updateRecordButton() {
  const btn = document.getElementById('call-record-btn');
  if (btn) {
    btn.classList.toggle('active', isRecording);
    btn.title = isRecording ? 'Остановить запись' : 'Записать звонок';
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
