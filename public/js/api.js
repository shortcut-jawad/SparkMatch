// api.js: fetch wrappers for all REST endpoints; JWT token read/write via localStorage

export function getToken()  { return localStorage.getItem('sm_token'); }
export function getUser()   { try { return JSON.parse(localStorage.getItem('sm_user')); } catch { return null; } }

export function saveSession(token, user) {
  localStorage.setItem('sm_token', token);
  localStorage.setItem('sm_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('sm_token');
  localStorage.removeItem('sm_user');
}

export async function apiLogin(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function apiRegister(formData) {
  const res = await fetch('/api/register', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function apiGetProfile(token) {
  const res = await fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + token } });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

export async function apiUpdateProfile(token, formData) {
  const res = await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + token },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
}

export async function apiDeleteProfile(token) {
  const res = await fetch('/api/profile', {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('Delete failed');
}

export async function apiGetMatches(token) {
  const res = await fetch('/api/matches', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('Failed to load matches');
  return res.json();
}

export async function apiGetMatchMessages(token, matchId) {
  const res = await fetch(`/api/matches/${matchId}/messages`, {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('Failed to load messages');
  return res.json();
}

export async function apiPostVoiceNote(token, matchId, blob, duration) {
  const fd = new FormData();
  fd.append('audio', blob, 'voice-note.webm');
  fd.append('duration', String(Math.round(duration)));
  const res = await fetch(`/api/matches/${matchId}/voice-note`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// Reuses the same multer image upload config as profile picture uploads
export async function apiPostChatImage(token, matchId, blob) {
  const fd = new FormData();
  fd.append('picture', blob, 'chat-photo.jpg');
  const res = await fetch(`/api/matches/${matchId}/image`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

// STUN-only fallback so calls still work (on open networks) if the server can't supply TURN
const FALLBACK_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
let _iceConfig = null;

export async function apiGetIceConfig() {
  if (_iceConfig) return _iceConfig;
  try {
    const res = await fetch('/api/ice-servers', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('ICE config unavailable');
    _iceConfig = await res.json();
    return _iceConfig;
  } catch {
    return FALLBACK_ICE;
  }
}
