// matchmaking.js: waiting room management, profile reveal, skip/connect socket event handling
import { socket } from './socket.js';
import { state } from './state.js';
import { initials } from './utils.js';

export function initMatchmaking({ showScreen, toast, doJoinWaiting }) {

  socket.on('waiting_count', ({ count }) => {
    document.getElementById('waiting-count-label').textContent =
      count === 1 ? '1 person online' : `${count} people online`;
  });

  socket.on('show_profile', ({ partnerId: pid, displayName, picture, bio, city }) => {
    state.partnerId = pid;
    state.partnerProfile = { displayName, picture, bio, city };

    document.getElementById('reveal-name-text').textContent = displayName;
    document.getElementById('reveal-bio').textContent  = bio || '';

    const cityInline = document.getElementById('reveal-city-inline');
    if (city) {
      cityInline.textContent  = ', ' + city;
      cityInline.style.display = 'inline';
    } else {
      cityInline.style.display = 'none';
    }
    document.getElementById('reveal-status').textContent = '';

    const revealPic   = document.getElementById('reveal-pic');
    const placeholder = document.getElementById('reveal-placeholder');
    if (picture) {
      revealPic.src = picture; revealPic.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      revealPic.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = initials(displayName);
    }

    const actions = document.getElementById('reveal-actions');
    actions.innerHTML = `
      <button class="btn-skip" id="btn-skip">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Skip
      </button>
      <button class="btn-connect" id="btn-connect">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        Connect
      </button>
    `;
    document.getElementById('btn-skip').addEventListener('click', onSkip);
    document.getElementById('btn-connect').addEventListener('click', onConnect);

    showScreen('profile');
  });

  function onConnect() {
    document.getElementById('btn-connect').disabled = true;
    document.getElementById('btn-skip').disabled    = true;
    document.getElementById('reveal-actions').innerHTML =
      `<div style="grid-column:span 2;text-align:center;color:var(--primary-2);font-weight:600;padding:0.5rem">Waiting for ${state.partnerProfile.displayName}... ✨</div>`;
    socket.emit('accept');
  }

  function onSkip() {
    socket.emit('decline');
    showScreen('waiting');
  }

  socket.on('partner_accepted', () => {
    document.getElementById('reveal-status').textContent = `${state.partnerProfile.displayName} accepted! ✨`;
  });

  socket.on('partner_declined', () => {
    toast(`${state.partnerProfile.displayName} skipped. Finding another...`);
    showScreen('waiting');
  });

  socket.on('back_to_waiting', () => showScreen('waiting'));
}
