// auth.js: login and signup form handlers; redirects to app.html on successful authentication
import { apiLogin, apiRegister, saveSession, getToken, apiGetProfile } from './api.js';
import { compressPic, setLoading, previewPic } from './utils.js';

// If already authenticated, skip the auth page entirely
(async function checkExistingSession() {
  const token = getToken();
  if (!token) return;
  try {
    await apiGetProfile(token);
    window.location.replace('/app.html');
  } catch { /* token invalid — stay on auth page */ }
})();

function onAuthSuccess(token, user) {
  saveSession(token, user);
  window.location.href = '/app.html';
}

// ── LOGIN (index.html) ──
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    document.getElementById('login-error').textContent = '';
    setLoading('login-btn', true, '');
    try {
      const data = await apiLogin(username, password);
      onAuthSuccess(data.token, data.user);
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
    } finally {
      setLoading('login-btn', false, 'Sign In');
    }
  });
}

// ── SIGNUP (signup.html) ──
const registerForm = document.getElementById('register-form');
if (registerForm) {
  // Wire file preview
  document.getElementById('reg-picture')?.addEventListener('change', e => previewPic(e.target, 'reg-pic-thumb'));

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('reg-error').textContent = '';
    setLoading('reg-btn', true, '');
    try {
      const fd = new FormData();
      fd.append('displayName', document.getElementById('reg-displayname').value.trim());
      fd.append('username',    document.getElementById('reg-username').value.trim());
      fd.append('password',    document.getElementById('reg-password').value);
      fd.append('bio',         document.getElementById('reg-bio').value.trim());
      fd.append('city',        document.getElementById('reg-city').value.trim());
      const rawPic = document.getElementById('reg-picture').files[0];
      const pic = await compressPic(rawPic);
      if (pic) fd.append('picture', pic, 'photo.jpg');
      const data = await apiRegister(fd);
      onAuthSuccess(data.token, data.user);
    } catch (err) {
      document.getElementById('reg-error').textContent = err.message;
    } finally {
      setLoading('reg-btn', false, 'Create Account');
    }
  });
}
