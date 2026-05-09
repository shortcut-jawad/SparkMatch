// location.js: geolocation permission flow, location banner UI, and locationCoords management
import { state } from './state.js';

export function showLocBanner(cb) {
  state.locBannerCallback = cb || null;
  document.getElementById('loc-banner').classList.add('show');
}

function allowLocation() {
  document.getElementById('loc-banner').classList.remove('show');
  if (!navigator.geolocation) {
    localStorage.setItem('sm_loc_status', 'denied');
    _runCallback();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    p => {
      state.locationCoords = { lat: p.coords.latitude, lng: p.coords.longitude };
      localStorage.setItem('sm_loc_status', 'granted');
      _runCallback();
    },
    () => {
      localStorage.setItem('sm_loc_status', 'denied');
      _runCallback();
    },
    { timeout: 10000 }
  );
}

function dismissLocBanner() {
  document.getElementById('loc-banner').classList.remove('show');
  localStorage.setItem('sm_loc_status', 'denied');
  _runCallback();
}

function _runCallback() {
  if (state.locBannerCallback) {
    const cb = state.locBannerCallback;
    state.locBannerCallback = null;
    cb();
  }
}

export function initLocation() {
  // Expose for inline onclick attributes in app.html
  window.allowLocation    = allowLocation;
  window.dismissLocBanner = dismissLocBanner;

  // On load: silently fetch coords if already granted
  const locStatus = localStorage.getItem('sm_loc_status');
  if (locStatus === 'granted') {
    navigator.geolocation?.getCurrentPosition(
      p => { state.locationCoords = { lat: p.coords.latitude, lng: p.coords.longitude }; },
      () => {},
      { timeout: 8000 }
    );
  }
  return locStatus;
}
