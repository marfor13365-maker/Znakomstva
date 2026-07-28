// call-webrtc.js
// Аудиозвонки в Blizko: WebRTC + Supabase.
// Сигналинг звонка (кто кому звонит, offer/answer) хранится в таблице `calls` —
// это надёжно: звонок "виден" даже если собеседник открыл приложение чуть позже.
// ICE-кандидаты (только пока звонок уже активен) идут через realtime broadcast — это ок,
// т.к. оба участника уже онлайн на экране звонка в этот момент.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

var BLIZKO_API_URL = (typeof window !== 'undefined' && window.BLIZKO_API_URL) ? window.BLIZKO_API_URL : 'https://vector-chat-api.onrender.com';
var RING_TIMEOUT_MS = 45000;

let pc = null;
let localStream = null;
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

function log(...args) {
  console.log('[call]', ...args);
}

function iceChannelName(matchId) {
  return `call-ice-${matchId}`;
}

// ---------- Инициализация ----------

export function initCallModule(supabaseClient, myUserId) {
  _client = supabaseClient;
  _myUserId = myUserId;
  injectStyles();
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
    onAccept: () => acceptCurrentCall(row),
    onDecline: () => declineIncomingCall(row.id),
  });

  clearTimeout(ringTimer);
  ringTimer = setTimeout(() => {
    if (currentCallId === row.id && !pc) {
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
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    hideCallScreen();
    currentCallId = null;
    throw new Error('Нет доступа к микрофону');
  }

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
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    hideCallScreen();
    currentCallId = null;
    return;
  }

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
    let audioEl = document.getElementById('call-remote-audio');
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'call-remote-audio';
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
  };

  pc.onconnectionstatechange = () => {
    log('connection state', pc.connectionState);
    if (pc.connectionState === 'connected') {
      clearTimeout(ringTimer);
      showConnectedScreen(name, avatarUrl);
    }
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
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
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
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
    alert('Переключение громкой связи не поддерживается этим браузером.');
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

// ---------- UI ----------

function injectStyles() {
  if (document.getElementById('call-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'call-ui-styles';
  style.textContent = `
    #call-screen-overlay{position:fixed;inset:0;background:linear-gradient(180deg,#1a0a12,#0d0d0d);z-index:9999;
      display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:60px 24px 50px;
      font-family:'Inter',sans-serif;color:#f0f0f0;text-align:center}
    #call-screen-overlay .call-top{display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:20px}
    #call-avatar-img, .call-avatar-fallback{width:140px;height:140px;border-radius:50%;object-fit:cover;
      background:#2a2a2a;border:4px solid #ff4d6d;display:flex;align-items:center;justify-content:center;font-size:56px;
      box-shadow:0 0 40px rgba(255,77,109,0.3)}
    #call-name-text{font-family:'Unbounded',sans-serif;font-size:22px;font-weight:600;margin-top:4px}
    #call-status-text{color:#888;font-size:15px;margin-top:2px}
    #call-duration-text{color:#ff8fa3;font-size:16px;font-variant-numeric:tabular-nums;margin-top:4px}
    .call-controls-row{display:flex;gap:28px;justify-content:center;flex-wrap:wrap;width:100%}
    .call-btn{width:68px;height:68px;border-radius:50%;border:none;font-size:28px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;transition:all 0.2s;background:#2a2a2a;color:#f0f0f0;
      box-shadow:0 4px 16px rgba(0,0,0,0.3)}
    .call-btn:active{transform:scale(0.92)}
    .call-btn.secondary.active{background:#ff4d6d;color:white}
    .call-btn.hangup{background:#ff2d4d;color:white;width:76px;height:76px;font-size:32px;box-shadow:0 4px 24px rgba(255,45,77,0.4)}
    .call-incoming-actions{display:flex;gap:56px;justify-content:center;width:100%;margin-top:20px}
    .call-incoming-actions .call-btn.accept{background:#2ecc71;color:white;width:76px;height:76px;font-size:32px;box-shadow:0 4px 24px rgba(46,204,113,0.4)}
    .call-incoming-actions .call-btn.hangup{box-shadow:0 4px 24px rgba(255,45,77,0.4)}
    .call-btn .label{display:block;font-size:10px;font-weight:500;margin-top:4px;color:var(--muted)}
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

function showOutgoingScreen(name, avatarUrl) {
  renderOverlay(`
    <div class="call-top">
      ${avatarHtml(avatarUrl)}
      <div id="call-name-text">${name}</div>
      <div id="call-status-text">📞 Вызов...</div>
    </div>
    <div class="call-controls-row">
      <button class="call-btn hangup" onclick="window.__callHangup()">📵</button>
    </div>
  `);
  window.__callHangup = () => endCall();
}

function showIncomingScreen(name, avatarUrl, { onAccept, onDecline }) {
  renderOverlay(`
    <div class="call-top">
      ${avatarHtml(avatarUrl)}
      <div id="call-name-text">${name}</div>
      <div id="call-status-text">📞 Входящий звонок...</div>
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
    </div>
    <div class="call-controls-row">
      <button class="call-btn secondary" id="call-mute-btn" onclick="window.__callToggleMute()">🎙️</button>
      <button class="call-btn hangup" onclick="window.__callHangup()">📵</button>
      <button class="call-btn secondary" id="call-speaker-btn" onclick="window.__callToggleSpeaker()">🔊</button>
    </div>
  `);
  window.__callHangup = () => endCall();
  window.__callToggleMute = () => toggleMute();
  window.__callToggleSpeaker = () => toggleSpeaker();

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

function hideCallScreen() {
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
  connectedAt = null;
  const overlay = document.getElementById('call-screen-overlay');
  if (overlay) overlay.remove();
}
