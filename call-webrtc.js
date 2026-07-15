// call-webrtc.js
// Аудиозвонки в Blizko: WebRTC + Supabase Realtime (broadcast) как сигналинг.
// Полноэкранный UI звонка встроен прямо в модуль — подключающей странице
// достаточно вызвать initCallModule(), initIncomingCallListener() и startCall().

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Когда появится свой TURN (coturn на VPS) — добавить сюда:
  // { urls: 'turn:your-turn-server.example.com:3478', username: 'user', credential: 'pass' },
];

var BLIZKO_API_URL = (typeof window !== 'undefined' && window.BLIZKO_API_URL) ? window.BLIZKO_API_URL : 'https://vector-chat-api.onrender.com';

let pc = null;
let localStream = null;
let callChannel = null;
let currentCallId = null;
let _client = null;
let _myUserId = null;
let connectedAt = null;
let durationTimer = null;
let isMuted = false;
let speakerOn = false;

function channelNameFor(matchId) {
  return `call-${matchId}`;
}

function log(...args) {
  console.log('[call]', ...args);
}

// ---------- Инициализация ----------

export function initCallModule(supabaseClient, myUserId) {
  _client = supabaseClient;
  _myUserId = myUserId;
  injectStyles();
}

// matchIds — массив id мэтчей пользователя.
// getProfileInfo(otherUserId) должна вернуть { name, avatarUrl } (синхронно, из уже загруженных данных страницы).
export function initIncomingCallListener(matchIds, getProfileInfo) {
  matchIds.forEach((matchId) => {
    const ch = _client.channel(channelNameFor(matchId), {
      config: { broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'call-offer' }, (payload) => {
      const { fromUserId, callId, sdp } = payload.payload;
      if (fromUserId === _myUserId) return;
      log('входящий звонок', matchId, callId);
      currentCallId = callId;
      callChannel = ch;

      const info = (getProfileInfo && getProfileInfo(fromUserId)) || {};
      showIncomingScreen(info.name || 'Пользователь', info.avatarUrl, {
        onAccept: () => acceptCurrentCall(matchId, callId, sdp),
        onDecline: () => {
          sendEnd();
          hideCallScreen();
        },
      });
    });

    ch.subscribe();
  });
}

// ---------- Исходящий звонок ----------

export async function startCall(matchId, calleeUserId, name, avatarUrl) {
  const callId = crypto.randomUUID();
  currentCallId = callId;

  showOutgoingScreen(name, avatarUrl);

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    hideCallScreen();
    throw e;
  }

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  callChannel = _client.channel(channelNameFor(matchId), {
    config: { broadcast: { self: false } },
  });

  wireConnectionEvents(name, avatarUrl);

  callChannel.on('broadcast', { event: 'call-answer' }, async (payload) => {
    if (payload.payload.callId !== callId) return;
    await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
  });

  callChannel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
    if (payload.payload.callId !== callId || payload.payload.fromUserId === _myUserId) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate)); }
    catch (e) { log('ошибка ICE', e); }
  });

  callChannel.on('broadcast', { event: 'call-end' }, () => cleanupCall());

  await new Promise((resolve) => callChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') resolve();
  }));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  callChannel.send({
    type: 'broadcast',
    event: 'call-offer',
    payload: { callId, fromUserId: _myUserId, sdp: offer },
  });

  notifyIncomingCallPush(matchId, calleeUserId, callId).catch((e) => log('push-уведомление о звонке не отправлено', e));

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
  } catch (e) { /* используем дефолтное имя */ }

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

async function acceptCurrentCall(matchId, callId, remoteSdp) {
  const infoName = document.getElementById('call-name-text')?.textContent || 'Пользователь';
  const infoAvatar = document.getElementById('call-avatar-img')?.src || '';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (e) {
    hideCallScreen();
    return;
  }

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  wireConnectionEvents(infoName, infoAvatar);

  callChannel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
    if (payload.payload.callId !== callId || payload.payload.fromUserId === _myUserId) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate)); }
    catch (e) { log('ошибка ICE', e); }
  });

  callChannel.on('broadcast', { event: 'call-end' }, () => cleanupCall());

  await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  callChannel.send({
    type: 'broadcast',
    event: 'call-answer',
    payload: { callId, sdp: answer },
  });
}

function wireConnectionEvents(name, avatarUrl) {
  pc.ontrack = (event) => playRemoteAudio(event.streams[0]);

  pc.onconnectionstatechange = () => {
    log('connection state', pc.connectionState);
    if (pc.connectionState === 'connected') {
      showConnectedScreen(name, avatarUrl);
    }
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      cleanupCall();
    }
  };
}

function sendEnd() {
  if (callChannel && currentCallId) {
    callChannel.send({ type: 'broadcast', event: 'call-end', payload: { callId: currentCallId } });
  }
}

export function endCall() {
  sendEnd();
  cleanupCall();
}

export function declineCall() {
  sendEnd();
  cleanupCall();
}

function cleanupCall() {
  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  currentCallId = null;
  isMuted = false;
  speakerOn = false;
  hideCallScreen();
}

// ---------- Аудио ----------

function playRemoteAudio(stream) {
  let audioEl = document.getElementById('call-remote-audio');
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = 'call-remote-audio';
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
  updateMuteButton();
}

// Переключение громкой связи: поддержка в Android Chrome ограничена
// (нет официального API для earpiece/speaker), делаем best-effort через setSinkId,
// если браузер поддерживает выбор устройства вывода.
async function toggleSpeaker() {
  const audioEl = document.getElementById('call-remote-audio');
  if (!audioEl || typeof audioEl.setSinkId !== 'function') {
    alert('Переключение громкой связи не поддерживается этим браузером. Используй системную кнопку громкости/переключатель динамика в шторке звонка.');
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

// ---------- Полноэкранный UI ----------

function injectStyles() {
  if (document.getElementById('call-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'call-ui-styles';
  style.textContent = `
    #call-screen-overlay{position:fixed;inset:0;background:linear-gradient(180deg,#1a0a12,#0d0d0d);z-index:9999;
      display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:60px 24px 50px;
      font-family:'Inter',sans-serif;color:#f0f0f0;text-align:center}
    #call-screen-overlay .call-top{display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:20px}
    #call-avatar-img, .call-avatar-fallback{width:120px;height:120px;border-radius:50%;object-fit:cover;
      background:#2a2a2a;border:3px solid #ff4d6d;display:flex;align-items:center;justify-content:center;font-size:48px}
    #call-name-text{font-family:'Unbounded',sans-serif;font-size:20px;font-weight:600}
    #call-status-text{color:#888;font-size:14px}
    #call-duration-text{color:#ff8fa3;font-size:14px;font-variant-numeric:tabular-nums}
    .call-controls-row{display:flex;gap:24px;justify-content:center}
    .call-btn{width:64px;height:64px;border-radius:50%;border:none;font-size:26px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;transition:opacity 0.2s}
    .call-btn:active{opacity:0.7}
    .call-btn.secondary{background:#2a2a2a;color:#f0f0f0}
    .call-btn.secondary.active{background:#ff4d6d;color:white}
    .call-btn.hangup{background:#ff2d4d;color:white;width:72px;height:72px;font-size:30px}
    .call-incoming-actions{display:flex;gap:48px;justify-content:center}
    .call-incoming-actions .call-btn.accept{background:#2ecc71;color:white;width:72px;height:72px;font-size:30px}
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
      <div id="call-status-text">Вызов...</div>
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
      <div id="call-status-text">Входящий звонок...</div>
    </div>
    <div class="call-incoming-actions">
      <button class="call-btn hangup" onclick="window.__callDeclineBtn()">📵</button>
      <button class="call-btn accept" onclick="window.__callAcceptBtn()">📞</button>
    </div>
  `);
  window.__callAcceptBtn = () => onAccept();
  window.__callDeclineBtn = () => onDecline();
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
