// chat/chatCall.js — WebRTC voice & video calls inside permanent chats (reuses existing signaling backend)
import { socket }   from '../socket.js';
import { state }    from '../state.js';
import { initials } from '../utils.js';
<<<<<<< HEAD
=======
import { populateVideoChatSidebar, handleImageInputFile } from '../app.js';
>>>>>>> 491caa0 (Fix duplicate chat messages, caller UI info, image preview modal, and CI pipeline)

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

  // ── In-call controls (Voice) ──
  document.getElementById('chat-call-mute-btn').addEventListener('click', () => {
    if (!state.chatCallStream) return;
    const track = state.chatCallStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('chat-call-mute-btn');
    btn.classList.toggle('ctrl-active', !track.enabled);
    btn.title = track.enabled ? 'Mute' : 'Unmute';
  });

  // ── In-call controls (Video) ──
  document.getElementById('chat-video-btn-end').addEventListener('click', () => {
    socket.emit('chat_call_end', { matchId: state.chatCallMatchId });
    endChatCall(false);
  });

  document.getElementById('chat-video-btn-mute').addEventListener('click', () => {
    if (!state.chatCallStream) return;
    const track = state.chatCallStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('chat-video-btn-mute');
    btn.classList.toggle('active', !track.enabled);
    btn.innerHTML = !track.enabled
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
  });

  document.getElementById('chat-video-btn-vid').addEventListener('click', () => {
    if (!state.chatCallStream) return;
    const track = state.chatCallStream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    const btn = document.getElementById('chat-video-btn-vid');
    btn.classList.toggle('active', !track.enabled);
    btn.innerHTML = !track.enabled
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16 11.35V8l6-4v16l-2.47-1.65"/><path d="M11 5l1-1h2"/><path d="m3 3 18 18"/><path d="M3 7H2v13h14"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;
  });

  const chatVideoArea = document.querySelector('#chat-call-video-section .video-area');
  const chatVideoBtnLayout = document.getElementById('chat-video-btn-layout');
  const chatVideoLayoutIcon = document.getElementById('chat-video-layout-icon');
  const SPLIT_ICON = `<rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/>`;
  const PIP_ICON   = `<rect x="2" y="2" width="20" height="20" rx="2"/><rect x="13" y="13" width="8" height="6" rx="1" fill="currentColor" stroke="none"/>`;

  chatVideoBtnLayout.addEventListener('click', () => {
    const pip = chatVideoArea.classList.toggle('pip');
    chatVideoBtnLayout.classList.toggle('layout-active', pip);
    chatVideoLayoutIcon.innerHTML = pip ? SPLIT_ICON : PIP_ICON;
  });

  // ── Temporary Chat in Video Call ──
  const chatVideoSidebar = document.getElementById('chat-video-sidebar');
  const btnChatVideo = document.getElementById('chat-video-btn-chat');
  
  function toggleChatVideo(forceOpen) {
    const open = forceOpen !== undefined ? forceOpen : !chatVideoSidebar.classList.contains('open');
    chatVideoSidebar.classList.toggle('open', open);
    btnChatVideo.classList.toggle('chat-active', open);
    if (open) document.getElementById('chat-video-input').focus();
  }

  btnChatVideo.addEventListener('click', () => toggleChatVideo());
  document.getElementById('chat-video-btn-close-chat').addEventListener('click', () => toggleChatVideo(false));

  function sendChatVideoMsg() {
    const input = document.getElementById('chat-video-input');
    const msg = input.value.trim();
    if (!msg || !state.chatCallMatchId) return;
    
    // Send as permanent message — the socket.on('permanent_message') listener
    // in app.js will handle appending to both the main chat and the video sidebar
    socket.emit('permanent_message', { matchId: state.chatCallMatchId, text: msg });
    input.value = '';
  }

  document.getElementById('chat-video-send').addEventListener('click', sendChatVideoMsg);
  document.getElementById('chat-video-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatVideoMsg(); });

  // Image upload in video call sidebar
  const chatVideoImageBtn = document.getElementById('chat-video-image-btn');
  const chatVideoImageInput = document.getElementById('chat-video-image-input');
  chatVideoImageBtn.addEventListener('click', () => chatVideoImageInput.click());
  chatVideoImageInput.addEventListener('change', () => {
    handleImageInputFile(chatVideoImageInput.files[0], state.chatCallMatchId);
    chatVideoImageInput.value = '';
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
  socket.emit('chat_call_invite', { 
    matchId, 
    type,
    callerName: state.currentUser?.displayName,
    callerPicture: state.currentUser?.picture
  });
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
  const chatVideoArea = document.querySelector('#chat-call-video-section .video-area');
  if (chatVideoArea) chatVideoArea.classList.remove('pip');
  const chatVideoBtnLayout = document.getElementById('chat-video-btn-layout');
  if (chatVideoBtnLayout) chatVideoBtnLayout.classList.remove('layout-active');
  const chatVideoLayoutIcon = document.getElementById('chat-video-layout-icon');
  if (chatVideoLayoutIcon) chatVideoLayoutIcon.innerHTML = `<rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/>`;

  // Reset chat sidebar
  const chatVideoSidebar = document.getElementById('chat-video-sidebar');
  if (chatVideoSidebar) chatVideoSidebar.classList.remove('open');
  const btnChatVideo = document.getElementById('chat-video-btn-chat');
  if (btnChatVideo) btnChatVideo.classList.remove('chat-active');
  
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
  const chatPanel = document.querySelector('#chat-call-active .chat-call-panel');
  
  if (videoSec) videoSec.style.display = type === 'video' ? 'flex' : 'none';
  if (chatPanel) chatPanel.style.display = type === 'video' ? 'none' : 'flex';

  if (isInitiator) {
    const offer = await state.chatCallPc.createOffer();
    await state.chatCallPc.setLocalDescription(offer);
    socket.emit('chat_call_offer', { offer, matchId: state.chatCallMatchId });
  }
}

function _setPartnerUI(name, picture) {
  // Set name in all elements
  const nameEls = document.querySelectorAll('.chat-call-partner-name');
  nameEls.forEach(el => { el.textContent = name || ''; });

  // Set large avatar (for ringing/incoming/voice-active overlay panels)
  const overlayPicWraps = document.querySelectorAll('.chat-call-avatar-wrap.chat-call-partner-pic-wrap');
  const overlayContent = picture
    ? `<img src="${picture}" class="chat-call-avatar-img" alt="" />`
    : `<div class="chat-call-avatar-init">${initials(name || '?')}</div>`;
  overlayPicWraps.forEach(wrap => { wrap.innerHTML = overlayContent; });

  // Set small header pic (for video call top-left, same style as matching call)
  const headerPicWrap = document.getElementById('chat-call-header-pic-wrap');
  if (headerPicWrap) {
    headerPicWrap.innerHTML = picture
      ? `<img class="call-partner-pic" src="${picture}" alt="" />`
      : `<div class="call-partner-placeholder">${initials(name || '?')}</div>`;
  }

  // Set sidebar title
  const sidebarTitle = document.getElementById('chat-video-title');
  if (sidebarTitle) sidebarTitle.textContent = `Chat with ${name || ''}`;
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
