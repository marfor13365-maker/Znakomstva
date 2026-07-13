// call-webrtc.js
// Аудиозвонки в Blizko через WebRTC + Supabase Realtime (broadcast) как сигналинг.
// Подключить на страницах, где есть кнопка звонка (список мэтчей) и/или глобально (чтобы ловить входящие).
//
// Зависимость: глобальный объект `supabase` (уже инициализированный клиент supabase-js), как в остальном приложении.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Когда появится свой TURN (coturn на VPS) — добавить сюда:
  // { urls: 'turn:your-turn-server.example.com:3478', username: 'user', credential: 'pass' },
];

let pc = null;              // RTCPeerConnection текущего звонка
let localStream = null;
let callChannel = null;     // supabase realtime channel текущего звонка
let currentCallId = null;
let onIncomingCallCallback = null; // UI-хук: показать модалку "входящий звонок"
let onCallStateChangeCallback = null; // UI-хук: обновить статус (connecting/connected/ended)
let _client = null; // клиент supabase-js (то, что в проекте называется `db`)

// Вызвать один раз перед использованием любых других функций модуля.
export function initCallModule(supabaseClient) {
  _client = supabaseClient;
}

function channelNameFor(matchId) {
  return `call-${matchId}`;
}

function log(...args) {
  console.log('[call]', ...args);
}

// ---------- Публичные хуки для UI ----------

// Вызвать один раз при загрузке приложения (для авторизованного пользователя),
// чтобы ловить входящие звонки на ЛЮБОМ экране.
export function initIncomingCallListener(myUserId, matchIds, { onIncomingCall, onCallStateChange } = {}) {
  onIncomingCallCallback = onIncomingCall || null;
  onCallStateChangeCallback = onCallStateChange || null;

  // Подписываемся на все каналы звонков по активным мэтчам пользователя.
  // matchIds — массив id мэтчей текущего пользователя (можно обновлять при новых мэтчах).
  matchIds.forEach((matchId) => {
    const ch = _client.channel(channelNameFor(matchId), {
      config: { broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'call-offer' }, (payload) => {
      const { fromUserId, callId, sdp } = payload.payload;
      if (fromUserId === myUserId) return; // не реагируем на свой же оффер
      log('входящий звонок', matchId, callId);
      currentCallId = callId;
      callChannel = ch;
      if (onIncomingCallCallback) {
        onIncomingCallCallback({ matchId, callId, fromUserId, sdp });
      }
    });

    ch.subscribe();
  });
}

// Инициатор звонка: нажали иконку "позвонить" у мэтча.
export async function startCall(matchId, myUserId, calleeUserId) {
  const callId = crypto.randomUUID();
  currentCallId = callId;

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  callChannel = _client.channel(channelNameFor(matchId), {
    config: { broadcast: { self: false } },
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      callChannel.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { callId, fromUserId: myUserId, candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    playRemoteAudio(event.streams[0]);
  };

  pc.onconnectionstatechange = () => {
    log('connection state', pc.connectionState);
    if (onCallStateChangeCallback) onCallStateChangeCallback(pc.connectionState);
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      cleanupCall();
    }
  };

  callChannel.on('broadcast', { event: 'call-answer' }, async (payload) => {
    if (payload.payload.callId !== callId) return;
    await pc.setRemoteDescription(new RTCSessionDescription(payload.payload.sdp));
  });

  callChannel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
    if (payload.payload.callId !== callId || payload.payload.fromUserId === myUserId) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
    } catch (e) {
      log('ошибка добавления ICE-кандидата', e);
    }
  });

  callChannel.on('broadcast', { event: 'call-end' }, () => {
    cleanupCall();
  });

  await new Promise((resolve) => callChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') resolve();
  }));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  callChannel.send({
    type: 'broadcast',
    event: 'call-offer',
    payload: { callId, fromUserId: myUserId, sdp: offer },
  });

  if (onCallStateChangeCallback) onCallStateChangeCallback('calling');
  return callId;
}

// Принять входящий звонок. sdp и callId берутся из onIncomingCall callback.
export async function answerCall(matchId, myUserId, callId, remoteSdp) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      callChannel.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { callId, fromUserId: myUserId, candidate: event.candidate },
      });
    }
  };

  pc.ontrack = (event) => {
    playRemoteAudio(event.streams[0]);
  };

  pc.onconnectionstatechange = () => {
    log('connection state', pc.connectionState);
    if (onCallStateChangeCallback) onCallStateChangeCallback(pc.connectionState);
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      cleanupCall();
    }
  };

  callChannel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
    if (payload.payload.callId !== callId || payload.payload.fromUserId === myUserId) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(payload.payload.candidate));
    } catch (e) {
      log('ошибка добавления ICE-кандидата', e);
    }
  });

  callChannel.on('broadcast', { event: 'call-end' }, () => {
    cleanupCall();
  });

  await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  callChannel.send({
    type: 'broadcast',
    event: 'call-answer',
    payload: { callId, sdp: answer },
  });

  if (onCallStateChangeCallback) onCallStateChangeCallback('connected');
}

// Отклонить входящий звонок без ответа.
export function declineCall() {
  if (callChannel && currentCallId) {
    callChannel.send({
      type: 'broadcast',
      event: 'call-end',
      payload: { callId: currentCallId },
    });
  }
  cleanupCall();
}

// Повесить трубку (для любой из сторон).
export function endCall() {
  if (callChannel && currentCallId) {
    callChannel.send({
      type: 'broadcast',
      event: 'call-end',
      payload: { callId: currentCallId },
    });
  }
  cleanupCall();
}

// ---------- Внутреннее ----------

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

function cleanupCall() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (onCallStateChangeCallback) onCallStateChangeCallback('ended');
  currentCallId = null;
  // callChannel НЕ отписываем — он используется для входящих звонков на этом мэтче тоже.
}
