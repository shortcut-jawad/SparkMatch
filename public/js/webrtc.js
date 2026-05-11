// webrtc.js: WebRTC peer connection setup, call controls (mute/cam/end), and media stream management
import { socket } from './socket.js';
import { state }  from './state.js';
import { initials } from './utils.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

export function initWebRTC({ showScreen, toast, doJoinWaiting, appendMsg }) {

  socket.on('start_call', async ({ initiator, partnerId: pid }) => {
    state.partnerId    = pid;
    state.hasLiked     = false;
    state.partnerLiked = false;
    state.currentMatchId = null;

    // Reset like button
    const likeBtn = document.getElementById('btn-like');
    likeBtn.classList.remove('liked');
    document.getElementById('like-icon-outline').style.display = '';
    document.getElementById('like-icon-filled').style.display  = 'none';

    // Clear notification & banner
    const notif = document.getElementById('call-like-notification');
    notif.classList.remove('show');
    notif.textContent = '';
    document.getElementById('mutual-match-banner').classList.remove('show');

    document.getElementById('call-partner-name').textContent  = state.partnerProfile.displayName || '—';
    document.getElementById('chat-title').textContent         = `Chat with ${state.partnerProfile.displayName}`;
    document.getElementById('chat-messages').innerHTML        = '';

    const wrap = document.getElementById('call-partner-pic-wrap');
    wrap.innerHTML = state.partnerProfile.picture
      ? `<img class="call-partner-pic" src="${state.partnerProfile.picture}" alt="" />`
      : `<div class="call-partner-placeholder">${initials(state.partnerProfile.displayName)}</div>`;

    showScreen('call');

    try {
      state.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById('local-video').srcObject = state.localStream;
    } catch {
      toast('Camera/mic access denied');
    }

    state.pc = new RTCPeerConnection(ICE);
    if (state.localStream) state.localStream.getTracks().forEach(t => state.pc.addTrack(t, state.localStream));

    state.pc.ontrack = e => { document.getElementById('remote-video').srcObject = e.streams[0]; };
    state.pc.onicecandidate = e => {
      if (e.candidate) socket.emit('webrtc_ice', { candidate: e.candidate, to: state.partnerId });
    };

    if (initiator) {
      const offer = await state.pc.createOffer();
      await state.pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', { offer, to: state.partnerId });
    }

    appendMsg(`Connected with ${state.partnerProfile.displayName}! Say hi 👋`, null, false, true);
  });

  socket.on('webrtc_offer', async ({ offer, from }) => {
    if (!state.pc) return;
    await state.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    socket.emit('webrtc_answer', { answer, to: from });
  });

  socket.on('webrtc_answer', async ({ answer }) => {
    if (!state.pc) return;
    await state.pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('webrtc_ice', async ({ candidate }) => {
    if (!state.pc) return;
    try { await state.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  });

  socket.on('call_ended', () => {
    endCall(false);
    toast('Call ended by partner');
    if (state.currentUser) doJoinWaiting();
    else showScreen('home');
  });

  // ── Like Button ──
  document.getElementById('btn-like').addEventListener('click', () => {
    if (state.hasLiked || !state.partnerId) return;
    state.hasLiked = true;
    socket.emit('like_user');

    const likeBtn = document.getElementById('btn-like');
    likeBtn.classList.add('liked');
    document.getElementById('like-icon-outline').style.display = 'none';
    document.getElementById('like-icon-filled').style.display  = '';
  });

  socket.on('partner_liked_you', ({ displayName }) => {
    state.partnerLiked = true;
    const notif = document.getElementById('call-like-notification');
    notif.innerHTML = `<strong>${displayName}</strong> liked you! Tap the like button to connect.`;
    notif.classList.add('show');
    setTimeout(() => notif.classList.remove('show'), 6000);
  });

  socket.on('mutual_like', ({ matchId, partnerDisplayName }) => {
    state.currentMatchId = matchId;
    const banner = document.getElementById('mutual-match-banner');
    document.getElementById('mutual-match-text').textContent =
      `You and ${partnerDisplayName} liked each other. Your chat has been saved permanently!`;
    banner.classList.add('show');
    // Auto-hide after 8 seconds
    setTimeout(() => banner.classList.remove('show'), 8000);
  });

  // ── Controls ──
  document.getElementById('btn-end').addEventListener('click', () => {
    endCall(true);
    showScreen('home');
  });

  document.getElementById('btn-skip-call').addEventListener('click', () => {
    if (!state.partnerId) return;
    endCall(true);
    doJoinWaiting();
  });

  document.getElementById('btn-mute').addEventListener('click', () => {
    if (!state.localStream) return;
    state.isMuted = !state.isMuted;
    state.localStream.getAudioTracks().forEach(t => t.enabled = !state.isMuted);
    const btn = document.getElementById('btn-mute');
    btn.classList.toggle('active', state.isMuted);
    btn.innerHTML = state.isMuted
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`;
  });

  document.getElementById('btn-vid').addEventListener('click', () => {
    if (!state.localStream) return;
    state.isCamOff = !state.isCamOff;
    state.localStream.getVideoTracks().forEach(t => t.enabled = !state.isCamOff);
    const btn = document.getElementById('btn-vid');
    btn.classList.toggle('active', state.isCamOff);
    btn.innerHTML = state.isCamOff
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16 11.35V8l6-4v16l-2.47-1.65"/><path d="M11 5l1-1h2"/><path d="m3 3 18 18"/><path d="M3 7H2v13h14"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;
  });

  // Layout toggle (split ↔ PiP)
  const videoArea  = document.querySelector('.video-area');
  const btnLayout  = document.getElementById('btn-layout');
  const layoutIcon = document.getElementById('layout-icon');
  const SPLIT_ICON = `<rect x="2" y="3" width="9" height="18" rx="1.5"/><rect x="13" y="3" width="9" height="18" rx="1.5"/>`;
  const PIP_ICON   = `<rect x="2" y="2" width="20" height="20" rx="2"/><rect x="13" y="13" width="8" height="6" rx="1" fill="currentColor" stroke="none"/>`;

  btnLayout.addEventListener('click', () => {
    const pip = videoArea.classList.toggle('pip');
    btnLayout.classList.toggle('layout-active', pip);
    layoutIcon.innerHTML = pip ? SPLIT_ICON : PIP_ICON;
  });
}

export function endCall(notify = true) {
  if (notify && state.partnerId) socket.emit('end_call');
  if (state.pc) { state.pc.close(); state.pc = null; }
  if (state.localStream) { state.localStream.getTracks().forEach(t => t.stop()); state.localStream = null; }
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('local-video').srcObject  = null;
  state.partnerId    = null;
  state.hasLiked     = false;
  state.partnerLiked = false;

  // Reset like UI
  const likeBtn = document.getElementById('btn-like');
  if (likeBtn) {
    likeBtn.classList.remove('liked');
    const outline = document.getElementById('like-icon-outline');
    const filled  = document.getElementById('like-icon-filled');
    if (outline) outline.style.display = '';
    if (filled)  filled.style.display  = 'none';
  }
  const notif = document.getElementById('call-like-notification');
  if (notif) { notif.classList.remove('show'); }
  const banner = document.getElementById('mutual-match-banner');
  if (banner) { banner.classList.remove('show'); }
}
