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
