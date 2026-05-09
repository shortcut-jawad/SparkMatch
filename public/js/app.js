// app.js: authenticated app entry point — view router, session init, home/edit/chat screens
import { state } from './state.js';
import { socket } from './socket.js';
import { getToken, saveSession, clearSession, apiGetProfile, apiUpdateProfile, apiDeleteProfile } from './api.js';
import { initials, setLoading, compressPic } from './utils.js';
import { initLocation, showLocBanner } from './location.js';
import { initMatchmaking } from './matchmaking.js';
import { initWebRTC } from './webrtc.js';

// ── VIEW ROUTER ──
const SCREENS = {
  home:    document.getElementById('home-screen'),
  waiting: document.getElementById('waiting-screen'),
  profile: document.getElementById('profile-screen'),
  call:    document.getElementById('call-screen'),
};

export function showScreen(name) {
  state.currentScreen = name;
  Object.values(SCREENS).forEach(s => s.classList.remove('active'));
  SCREENS[name].classList.add('active');
}

// ── TOAST ──
let toastTimer;
export function toast(msg, duration = 3200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ── HOME PROFILE ──
function renderHomeProfile() {
  if (!state.currentUser) return;
  const u = state.currentUser;
  document.getElementById('my-display-name').textContent = u.displayName;
  document.getElementById('my-username').textContent     = '@' + u.username;
  document.getElementById('my-bio').textContent          = u.bio || '';
  document.getElementById('my-initials').textContent     = initials(u.displayName);

  const cityEl = document.getElementById('my-city');
  if (u.city) {
    document.getElementById('my-city-text').textContent = u.city;
    cityEl.style.display = 'flex';
  } else {
    cityEl.style.display = 'none';
  }

  const pic      = document.getElementById('my-pic');
  const fallback = document.getElementById('my-initials');
  if (u.picture) {
    pic.src = u.picture; pic.style.display = 'block'; fallback.style.display = 'none';
  } else {
    pic.style.display = 'none'; fallback.style.display = 'flex';
  }
}

// ── MATCHING ──
export function doJoinWaiting() {
  socket.emit('join_waiting', {
    displayName: state.currentUser.displayName,
    picture:     state.currentUser.picture,
    bio:         state.currentUser.bio,
    city:        state.currentUser.city || '',
    lat:         state.locationCoords?.lat ?? null,
    lng:         state.locationCoords?.lng ?? null,
  });
  showScreen('waiting');
}

function startMatching() {
  if (!state.currentUser) return;
  const locStatus = localStorage.getItem('sm_loc_status');
  if (locStatus === 'granted' && !state.locationCoords) {
    navigator.geolocation?.getCurrentPosition(
      p => { state.locationCoords = { lat: p.coords.latitude, lng: p.coords.longitude }; },
      () => {},
      { timeout: 5000 }
    );
  } else if (!locStatus) {
    // First-time user: show location banner and join waiting AFTER they respond,
    // so they're not placed in the queue while interacting with a browser permission dialog
    showLocBanner(doJoinWaiting);
    return;
  }
  doJoinWaiting();
}

function cancelWaiting() {
  socket.emit('leave_waiting');
  showScreen('home');
}

// ── EDIT PROFILE ──
function openEditModal() {
  if (!state.currentUser) return;
  document.getElementById('edit-displayname').value         = state.currentUser.displayName;
  document.getElementById('edit-bio').value                 = state.currentUser.bio || '';
  document.getElementById('edit-city').value                = state.currentUser.city || '';
  document.getElementById('edit-current-pw').value          = '';
  document.getElementById('edit-new-pw').value              = '';
  document.getElementById('edit-remove-pic').checked        = false;
  document.getElementById('edit-pic-thumb').style.display   = 'none';
  document.getElementById('edit-picture').value             = '';
  document.getElementById('edit-error').textContent         = '';
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

document.getElementById('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('edit-error').textContent = '';
  setLoading('edit-save-btn', true, '');

  const fd = new FormData();
  fd.append('displayName',   document.getElementById('edit-displayname').value.trim());
  fd.append('bio',           document.getElementById('edit-bio').value.trim());
  fd.append('city',          document.getElementById('edit-city').value.trim());
  fd.append('removePicture', document.getElementById('edit-remove-pic').checked ? 'true' : 'false');
  const rawPic = document.getElementById('edit-picture').files[0];
  const pic    = await compressPic(rawPic);
  if (pic) fd.append('picture', pic, 'photo.jpg');
  const curPw = document.getElementById('edit-current-pw').value;
  const newPw = document.getElementById('edit-new-pw').value;
  if (newPw) { fd.append('currentPassword', curPw); fd.append('newPassword', newPw); }

  try {
    const data = await apiUpdateProfile(state.token, fd);
    state.currentUser = data;
    saveSession(state.token, data);
    renderHomeProfile();
    closeEditModal();
    toast('Profile updated!');
  } catch (err) {
    document.getElementById('edit-error').textContent = err.message;
  } finally {
    setLoading('edit-save-btn', false, 'Save Changes');
  }
});

// Wire file preview for edit modal
document.getElementById('edit-picture')?.addEventListener('change', e => {
  const thumb = document.getElementById('edit-pic-thumb');
  if (e.target.files?.[0]) {
    const reader = new FileReader();
    reader.onload = ev => { thumb.src = ev.target.result; thumb.style.display = 'block'; };
    reader.readAsDataURL(e.target.files[0]);
  }
});

async function confirmDelete() {
  if (!confirm('Are you sure you want to permanently delete your account? This cannot be undone.')) return;
  try {
    await apiDeleteProfile(state.token);
    toast('Account deleted. Goodbye!');
    logout();
  } catch (err) {
    toast('Could not delete account: ' + err.message);
  }
}

function logout() {
  state.token = null; state.currentUser = null;
  clearSession();
  window.location.href = '/';
}

// ── CHAT ──
const chatMessages = document.getElementById('chat-messages');
const chatInput    = document.getElementById('chat-input');

export function appendMsg(msg, name, isMe, isSystem = false) {
  const div = document.createElement('div');
  if (isSystem) {
    div.className   = 'msg-system';
    div.textContent = msg;
  } else {
    div.className = `msg-bubble ${isMe ? 'msg-me' : 'msg-them'}`;
    div.innerHTML = `<div class="msg-label">${isMe ? 'You' : name}</div>${msg}`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg || !state.partnerId) return;
  socket.emit('chat_message', { message: msg, to: state.partnerId });
  appendMsg(msg, state.currentUser?.displayName || 'You', true);
  chatInput.value = '';
}

document.getElementById('chat-send').addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
socket.on('chat_message', ({ message, name }) => appendMsg(message, name, false));

// ── CHAT TOGGLE ──
const chatSidebar  = document.getElementById('chat-sidebar');
const btnChat      = document.getElementById('btn-chat');
const btnCloseChat = document.getElementById('btn-close-chat');

function toggleChat(forceOpen) {
  const open = forceOpen !== undefined ? forceOpen : !chatSidebar.classList.contains('open');
  chatSidebar.classList.toggle('open', open);
  btnChat.classList.toggle('chat-active', open);
  if (open) chatInput.focus();
}

btnChat.addEventListener('click',      () => toggleChat());
btnCloseChat.addEventListener('click', () => toggleChat(false));

// ── RECONNECT ──
socket.on('connect', () => {
  if (state.currentScreen === 'waiting' && state.currentUser) doJoinWaiting();
});

// ── EXPOSE GLOBALS for inline onclick attributes in app.html ──
window.logout         = logout;
window.openEditModal  = openEditModal;
window.closeEditModal = closeEditModal;
window.startMatching  = startMatching;
window.cancelWaiting  = cancelWaiting;
window.confirmDelete  = confirmDelete;

// ── INIT ──
(async function init() {
  const token = getToken();
  if (!token) { window.location.replace('/'); return; }

  try {
    const user = await apiGetProfile(token);
    state.token       = token;
    state.currentUser = user;
    saveSession(token, user);
    renderHomeProfile();
    showScreen('home');

    // Location
    const locStatus = initLocation();
    if (!locStatus) setTimeout(() => showLocBanner(null), 1200);

    // Init sub-systems
    initMatchmaking({ showScreen, toast, doJoinWaiting });
    initWebRTC({ showScreen, toast, doJoinWaiting, appendMsg });
  } catch {
    clearSession();
    window.location.replace('/');
  }
})();
