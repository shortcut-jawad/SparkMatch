const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Cloudflare TURN credentials are short-lived; cache them and refresh before expiry
const CF_TTL_SECONDS = 24 * 60 * 60;
let _cfCache = { servers: null, expiresAt: 0 };

async function cloudflareTurnServers() {
  const { CF_TURN_KEY_ID, CF_TURN_API_TOKEN } = process.env;
  if (!CF_TURN_KEY_ID || !CF_TURN_API_TOKEN) return [];
  if (_cfCache.servers && Date.now() < _cfCache.expiresAt) return _cfCache.servers;

  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: CF_TTL_SECONDS }),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`);
  const { iceServers } = await res.json();
  const servers = Array.isArray(iceServers) ? iceServers : [iceServers];
  // Refresh an hour early so clients never receive credentials about to expire
  _cfCache = { servers, expiresAt: Date.now() + (CF_TTL_SECONDS - 60 * 60) * 1000 };
  return servers;
}

// Static credentials, e.g. from a Metered Open Relay account
function staticTurnServers() {
  const { TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  if (!TURN_URLS) return [];
  return [{
    urls: TURN_URLS.split(',').map(u => u.trim()).filter(Boolean),
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  }];
}

router.get('/', auth, async (_, res) => {
  let turn = [];
  try {
    turn = await cloudflareTurnServers();
  } catch (e) {
    console.error('TURN credential error:', e.message);
  }
  if (!turn.length) turn = staticTurnServers();
  res.json({ iceServers: [...STUN_SERVERS, ...turn] });
});

module.exports = router;
