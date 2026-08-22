// chat/chatCall.js — WebRTC voice & video calls inside permanent chats
// Video calls reuse the matching call-screen UI (with like/next/live hidden via .chat-call-mode)
// Voice calls still use the chat-call-overlay panel
import { socket }   from '../socket.js';
import { state }    from '../state.js';
import { initials } from '../utils.js';

const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
] };

let _toast       = null;
let _showScreen  = null;
let _appendMsg   = null;
let _callTimer   = null;
let _callStart   = 0;

// ── Public API ──

export function initChatCall({ toast, showScreen, appendMsg }) {
  _toast      = toast;
  _showScreen = showScreen;
  _appendMsg  = appendMsg;

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
    if (state.chatCallType === 'video') {
      // Switch to the reused call-screen for video
      _activateVideoCallScreen();
    } else {
      _showSubview('active');
      _setStatusText('Connecting…');
    }
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
    if (!state.chatCallPc) {
      // Answering side: if video, also switch to call-screen
      if (state.chatCallType === 'video') {
        _activateVideoCallScreen();
      }
      await _startPeerConnection(false);
    }
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
    if (state.chatCallType === 'video') {
      _activateVideoCallScreen();
    } else {
      _showSubview('active');
      _setStatusText('Connecting…');
    }
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

  // ── In-call controls (voice-only overlay) ──
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

  // Layout toggle (split ↔ PiP) — for voice-only overlay
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
  // Store partner info for video call screen reuse
  state._chatCallPartnerName    = partnerName;
  state._chatCallPartnerPicture = partnerPicture;
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

  // Clean up video call screen (if video call was using it)
  if (state.chatCallType === 'video' || state._chatCallWasVideo) {
    // Clear the reused call-screen videos
    const rv = document.getElementById('remote-video');
    const lv = document.getElementById('local-video');
    if (rv) rv.srcObject = null;
    if (lv) lv.srcObject = null;

    // Remove chat-call-mode class
    const videoArea = document.querySelector('.video-area');
    if (videoArea) videoArea.classList.remove('chat-call-mode');

    // Close chat sidebar if open
    const chatSidebar = document.getElementById('chat-sidebar');
    if (chatSidebar) chatSidebar.classList.remove('open');
    const btnChat = document.getElementById('btn-chat');
    if (btnChat) btnChat.classList.remove('chat-active');

    // Reset layout
    if (videoArea) videoArea.classList.remove('pip');
    const layoutBtn = document.getElementById('btn-layout');
    if (layoutBtn) layoutBtn.classList.remove('layout-active');
    const layoutIcon = document.getElementById('layout-icon');
    if (layoutIcon) {
      layoutIcon.innerHTML = `<rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/>`;
    }

    // Go back to chats screen
    if (_showScreen) _showScreen('chats');
  }

  // Clean up voice-only overlay elements
  ['chat-call-remote-video', 'chat-call-local-video'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.srcObject = null;
  });
  const ra = document.getElementById('chat-call-remote-audio');
  if (ra) ra.srcObject = null;

  state._chatCallWasVideo = state.chatCallType === 'video';
  state.chatCallMatchId = null;
  state.chatCallType    = null;
  state._chatCallPartnerName    = null;
  state._chatCallPartnerPicture = null;
  clearInterval(_callTimer);

  // Reset layout state for voice overlay
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

/**
 * Activate the matching call-screen for a permanent-chat video call.
 * Sets partner info on the call-screen UI and adds `chat-call-mode`
 * to hide like/next/live elements.
 */
function _activateVideoCallScreen() {
  _hideOverlay(); // hide ringing/incoming overlay

  const name = state._chatCallPartnerName || '';
  const pic  = state._chatCallPartnerPicture;

  // Set partner name
  document.getElementById('call-partner-name').textContent = name || '—';

  // Set partner pic
  const wrap = document.getElementById('call-partner-pic-wrap');
  wrap.innerHTML = pic
    ? `<img class="call-partner-pic" src="${pic}" alt="" />`
    : `<div class="call-partner-placeholder">${initials(name)}</div>`;

  // Set chat title
  document.getElementById('chat-title').textContent = `Chat with ${name}`;
  document.getElementById('chat-messages').innerHTML = '';

  // Add chat-call-mode class to hide like/next/live
  const videoArea = document.querySelector('.video-area');
  if (videoArea) videoArea.classList.add('chat-call-mode');

  // Show call screen
  if (_showScreen) _showScreen('call');
}

async function _startPeerConnection(isInitiator) {
  const type = state.chatCallType;
  const isVideo = type === 'video';

  try {
    state.chatCallStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo,
    });
    if (isVideo) {
      // Use the main call-screen local video element
      const lv = document.getElementById('local-video');
      if (lv) lv.srcObject = state.chatCallStream;
    }
  } catch {
    _toast?.('Could not access ' + (isVideo ? 'camera/microphone' : 'microphone'));
    endChatCall(true);
    return;
  }

  state.chatCallPc = new RTCPeerConnection(ICE);
  state.chatCallStream.getTracks().forEach(t => state.chatCallPc.addTrack(t, state.chatCallStream));

  state.chatCallPc.ontrack = e => {
    if (isVideo) {
      // Use the main call-screen remote video element
      const rv = document.getElementById('remote-video');
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

  if (!isVideo) {
    // Show correct UI for voice-only call (overlay)
    const videoSec = document.getElementById('chat-call-video-section');
    const camWrap  = document.getElementById('chat-call-cam-wrap');
    const layoutWrap = document.getElementById('chat-call-layout-wrap');
    if (videoSec) videoSec.style.display = 'none';
    if (camWrap)  camWrap.style.display  = 'none';
    if (layoutWrap) layoutWrap.style.display = 'none';
    _showSubview('active');
    _setStatusText('Connecting…');
  }
  // For video, the call-screen is already shown via _activateVideoCallScreen()

  if (isInitiator) {
    const offer = await state.chatCallPc.createOffer();
    await state.chatCallPc.setLocalDescription(offer);
    socket.emit('chat_call_offer', { offer, matchId: state.chatCallMatchId });
  }
}

function _setPartnerUI(name, picture) {
  // Store for later use when activating video call screen
  state._chatCallPartnerName    = name;
  state._chatCallPartnerPicture = picture;

  const nameEls = document.querySelectorAll('.chat-call-partner-name');
  nameEls.forEach(el => { el.textContent = name || ''; });
  const picWraps = document.querySelectorAll('.chat-call-partner-pic-wrap');
  const content  = picture
    ? `<img src="${picture}" class="chat-call-avatar-img" alt="" />`
    : `<div class="chat-call-avatar-init">${initials(name || '?')}</div>`;
  picWraps.forEach(wrap => { wrap.innerHTML = content; });
}

function _markConnected() {
  if (state.chatCallType !== 'video') {
    _setStatusText('');
  }
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
