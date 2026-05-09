// socket.js: shared Socket.io client connection instance (requires socket.io script loaded before modules)
// Prefer WebSocket; avoids Safari/proxy issues where long-polling requests may hit different server instances
export const socket = window.io({ transports: ['websocket', 'polling'], upgrade: true });
