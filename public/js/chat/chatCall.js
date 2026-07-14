// chat/chatCall.js — WebRTC voice & video calls inside permanent chats (reuses existing signaling backend)
import { socket }   from '../socket.js';
import { state }    from '../state.js';
import { initials } from '../utils.js';

const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
] };

let _toast     = null;
let _callTimer = null;
let _callStart = 0;

// ── Public API ──

export function initChatCall({ toast }) {
  _toast = toast;

  socket.on('chat_call_incoming', ({ matchId, type, callerName, callerPicture }) => {
    if (state.chatCallPc) {
      socket.emit('chat_call_reject', { matchId });
      return;
    }
    state.chatCallMatchId = matchId;
    state.chatCallType    = type;
    _setPartnerUI(callerName, callerPicture);
    document.getElementById('chat-call-incoming-type').textContent =
      type === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call';
    _showSubview('incoming');
  });

  socket.on('chat_call_accepted', async ({ matchId }) => {
    if (matchId !== state.chatCallMatchId) return;
    _showSubview('active');
    _setStatusText('Connecting…');
    await _startPeerConnection(true);
  });

  socket.on('chat_call_rejected', ({ matchId }) => {
    if (matchId !== state.chatCallMatchId) return;
    endChatCall(false);
    _toast?.('Call declined');
  });

  socket.on('chat_call_unavailable', ({ matchId }) => {
    if (matchId !== state.chatCallMatchId) return;
    endChatCall(false);
    _toast?.('Partner is not online');
  });

  socket.on('chat_call_offer', async ({ offer }) => {
    if (!state.chatCallPc) await _startPeerConnection(false);
    await state.chatCallPc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await state.chatCallPc.createAnswer();
    await state.chatCallPc.setLocalDescription(answer);
    socket.emit('chat_call_answer', { answer, matchId: state.chatCallMatchId });
  });

  socket.on('chat_call_answer', async ({ answer }) => {
    if (!state.chatCallPc) return;
    await state.chatCallPc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('chat_call_ice', async ({ candidate }) => {
    if (!state.chatCallPc) return;
    try { await state.chatCallPc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  });

  socket.on('chat_call_ended', ({ matchId }) => {
    if (matchId !== state.chatCallMatchId) return;
    endChatCall(false);
    _toast?.('Call ended');
  });

  // ── Accept / Reject / Cancel ──
  document.getElementById('chat-call-accept-btn').addEventListener('click', () => {
    socket.emit('chat_call_accept', { matchId: state.chatCallMatchId });
    _showSubview('active');
    _setStatusText('Connecting…');
  });

  document.getElementById('chat-call-reject-btn').addEventListener('click', () => {
    socket.emit('chat_call_reject', { matchId: state.chatCallMatchId });
    endChatCall(false);
  });

  document.getElementById('chat-call-cancel-btn').addEventListener('click', () => {
    socket.emit('chat_call_end', { matchId: state.chatCallMatchId });
    endChatCall(false);
  });

  document.getElementById('chat-call-end-btn').addEventListener('click', () => {
    socket.emit('chat_call_end', { matchId: state.chatCallMatchId });
    endChatCall(false);
  });

  // ── In-call controls ──
  document.getElementById('chat-call-mute-btn').addEventListener('click', () => {
    if (!state.chatCallStream) return;
    const track = state.chatCallStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('chat-call-mute-btn');
    btn.classList.toggle('ctrl-active', !track.enabled);
    btn.title = track.enabled ? 'Mute' : 'Unmute';
  });

  document.getElementById('chat-call-cam-btn').addEventListener('click', () => {
    if (!state.chatCallStream) return;
    const track = state.chatCallStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    document.getElementById('chat-call-cam-btn').classList.toggle('ctrl-active', !track.enabled);
  });

  // Layout toggle (split ↔ PiP)
  const chatVideoSec = document.getElementById('chat-call-video-section');
  const chatBtnLayout = document.getElementById('chat-call-layout-btn');
  const chatLayoutIcon = document.getElementById('chat-call-layout-icon');
  const SPLIT_ICON = `<rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/>`;
  const PIP_ICON   = `<rect x="2" y="2" width="20" height="20" rx="2"/><rect x="13" y="13" width="8" height="6" rx="1" fill="currentColor" stroke="none"/>`;

  chatBtnLayout.addEventListener('click', () => {
    const pip = chatVideoSec.classList.toggle('pip');
    chatBtnLayout.classList.toggle('ctrl-active', pip);
    chatLayoutIcon.innerHTML = pip ? SPLIT_ICON : PIP_ICON;
  });
}

export function startChatCallInvite(matchId, type, partnerName, partnerPicture) {
  if (state.chatCallPc) { _toast?.('Already in a call'); return; }
  state.chatCallMatchId = matchId;
  state.chatCallType    = type;
  _setPartnerUI(partnerName, partnerPicture);
  document.getElementById('chat-call-ringing-type').textContent =
    type === 'video' ? 'Video Call' : 'Voice Call';
  _showSubview('ringing');
  socket.emit('chat_call_invite', { matchId, type });
}

export function endChatCall(notify = true) {
  if (notify && state.chatCallMatchId) {
    socket.emit('chat_call_end', { matchId: state.chatCallMatchId });
  }
  if (state.chatCallPc) { state.chatCallPc.close(); state.chatCallPc = null; }
  if (state.chatCallStream) {
    state.chatCallStream.getTracks().forEach(t => t.stop());
    state.chatCallStream = null;
  }
  ['chat-call-remote-video', 'chat-call-local-video'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.srcObject = null;
  });
  const ra = document.getElementById('chat-call-remote-audio');
  if (ra) ra.srcObject = null;

  state.chatCallMatchId = null;
  state.chatCallType    = null;
  clearInterval(_callTimer);

  // Reset layout state
  const videoSec = document.getElementById('chat-call-video-section');
  if (videoSec) videoSec.classList.remove('pip');
  const chatBtnLayout = document.getElementById('chat-call-layout-btn');
  if (chatBtnLayout) chatBtnLayout.classList.remove('ctrl-active');
  const chatLayoutIcon = document.getElementById('chat-call-layout-icon');
  if (chatLayoutIcon) {
    chatLayoutIcon.innerHTML = `<rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/>`;
  }

  _hideOverlay();
}

// ── Private helpers ──

async function _startPeerConnection(isInitiator) {
  const type = state.chatCallType;
  try {
    state.chatCallStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    });
    if (type === 'video') {
      const lv = document.getElementById('chat-call-local-video');
      if (lv) lv.srcObject = state.chatCallStream;
    }
  } catch {
    _toast?.('Could not access ' + (type === 'video' ? 'camera/microphone' : 'microphone'));
    endChatCall(true);
    return;
  }

  state.chatCallPc = new RTCPeerConnection(ICE);
  state.chatCallStream.getTracks().forEach(t => state.chatCallPc.addTrack(t, state.chatCallStream));

  state.chatCallPc.ontrack = e => {
    if (type === 'video') {
      const rv = document.getElementById('chat-call-remote-video');
      if (rv) rv.srcObject = e.streams[0];
    } else {
      const ra = document.getElementById('chat-call-remote-audio');
      if (ra) { ra.srcObject = e.streams[0]; ra.play().catch(() => {}); }
    }
  };

  state.chatCallPc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('chat_call_ice', { candidate: e.candidate, matchId: state.chatCallMatchId });
    }
  };

  state.chatCallPc.onconnectionstatechange = () => {
    const cs = state.chatCallPc?.connectionState;
    if (cs === 'connected') _markConnected();
    if (cs === 'failed') { endChatCall(true); _toast?.('Call connection failed'); }
  };

  // Show correct UI for call type
  const videoSec = document.getElementById('chat-call-video-section');
  const camWrap  = document.getElementById('chat-call-cam-wrap');
  const layoutWrap = document.getElementById('chat-call-layout-wrap');
  if (videoSec) videoSec.style.display = type === 'video' ? 'flex' : 'none';
  if (camWrap)  camWrap.style.display  = type === 'video' ? 'flex' : 'none';
  if (layoutWrap) layoutWrap.style.display = type === 'video' ? 'flex' : 'none';

  if (isInitiator) {
    const offer = await state.chatCallPc.createOffer();
    await state.chatCallPc.setLocalDescription(offer);
    socket.emit('chat_call_offer', { offer, matchId: state.chatCallMatchId });
  }
}

function _setPartnerUI(name, picture) {
  const nameEls = document.querySelectorAll('.chat-call-partner-name');
  nameEls.forEach(el => { el.textContent = name || ''; });
  const picWraps = document.querySelectorAll('.chat-call-partner-pic-wrap');
  const content  = picture
    ? `<img src="${picture}" class="chat-call-avatar-img" alt="" />`
    : `<div class="chat-call-avatar-init">${initials(name || '?')}</div>`;
  picWraps.forEach(wrap => { wrap.innerHTML = content; });
}

function _markConnected() {
  _setStatusText('');
  _callStart = Date.now();
  clearInterval(_callTimer);
  _callTimer = setInterval(() => {
    const s  = Math.floor((Date.now() - _callStart) / 1000);
    const el = document.getElementById('chat-call-timer');
    if (el) el.textContent =
      `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}

function _setStatusText(text) {
  const el = document.getElementById('chat-call-status-text');
  if (el) el.textContent = text;
}

function _showSubview(name) {
  const overlay = document.getElementById('chat-call-overlay');
  if (overlay) overlay.classList.add('visible');
  ['ringing', 'incoming', 'active'].forEach(n => {
    const el = document.getElementById(`chat-call-${n}`);
    if (el) el.style.display = n === name ? 'flex' : 'none';
  });
}

function _hideOverlay() {
  clearInterval(_callTimer);
  const overlay = document.getElementById('chat-call-overlay');
  if (overlay) overlay.classList.remove('visible');
  ['ringing', 'incoming', 'active'].forEach(n => {
    const el = document.getElementById(`chat-call-${n}`);
    if (el) el.style.display = 'none';
  });
}
