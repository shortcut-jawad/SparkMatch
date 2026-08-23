const connectDB = require('../config/db');
const Match = require('../models/Match');
const PermanentMessage = require('../models/PermanentMessage');
const { haversineKm } = require('../utils/geo');

let waitingUsers = [];
let matches = {};
let socketProfiles = {};
let userSockets = {};
let chatCalls = {};

function tryMatch(io) {
  if (waitingUsers.length < 2) return;

  let u1, u2;
  const withLoc = waitingUsers.filter(u => u.lat != null && u.lng != null);

  if (withLoc.length >= 2) {
    let minDist = Infinity;
    for (let i = 0; i < withLoc.length; i++) {
      for (let j = i + 1; j < withLoc.length; j++) {
        const d = haversineKm(withLoc[i].lat, withLoc[i].lng, withLoc[j].lat, withLoc[j].lng);
        if (d < minDist) { minDist = d; u1 = withLoc[i]; u2 = withLoc[j]; }
      }
    }
  } else {
    const pool = [...waitingUsers];
    const i1 = Math.floor(Math.random() * pool.length);
    let i2;
    do { i2 = Math.floor(Math.random() * pool.length); } while (i2 === i1);
    u1 = pool[i1]; u2 = pool[i2];
  }

  waitingUsers = waitingUsers.filter(u => u.id !== u1.id && u.id !== u2.id);
  matches[u1.id] = { partnerId: u2.id, accepted: false };
  matches[u2.id] = { partnerId: u1.id, accepted: false };
  io.to(u1.id).emit('show_profile', { partnerId: u2.id, displayName: u2.displayName, picture: u2.picture, bio: u2.bio, city: u2.city || '' });
  io.to(u2.id).emit('show_profile', { partnerId: u1.id, displayName: u1.displayName, picture: u1.picture, bio: u1.bio, city: u1.city || '' });
}

function broadcastCount(io) {
  io.emit('waiting_count', { count: waitingUsers.length });
}

function initSockets(io) {
  io.on('connection', (socket) => {
    socket.emit('waiting_count', { count: waitingUsers.length });

    socket.on('identify', ({ userId }) => {
      if (!userId) return;
      socket.userId = userId;
      userSockets[userId] = socket.id;
    });

    socket.on('join_waiting', (profile) => {
      waitingUsers = waitingUsers.filter(u => u.id !== socket.id); // dedup
      if (profile.userId) {
        socket.userId = profile.userId;
        userSockets[profile.userId] = socket.id;
      }
      socketProfiles[socket.id] = profile;
      waitingUsers.push({ id: socket.id, ...profile });
      broadcastCount(io);
      tryMatch(io);
    });

    socket.on('leave_waiting', () => {
      waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
      broadcastCount(io);
    });

    socket.on('accept', () => {
      const m = matches[socket.id];
      if (!m) return;
      m.accepted = true;
      const pm = matches[m.partnerId];
      if (pm?.accepted) {
        io.to(socket.id).emit('start_call', { initiator: false, partnerId: m.partnerId });
        io.to(m.partnerId).emit('start_call', { initiator: true, partnerId: socket.id });
      } else {
        io.to(m.partnerId).emit('partner_accepted');
      }
    });

    socket.on('decline', () => {
      const m = matches[socket.id];
      if (!m) return;
      io.to(m.partnerId).emit('partner_declined');
      const me = { id: socket.id, ...socketProfiles[socket.id] };
      const partner = { id: m.partnerId, ...socketProfiles[m.partnerId] };
      delete matches[socket.id];
      delete matches[m.partnerId];
      io.to(socket.id).emit('back_to_waiting');
      io.to(partner.id).emit('back_to_waiting');
      // Put partner back immediately; stagger self re-entry so the same pair
      // isn't instantly re-matched with each other when they're the only two online
      waitingUsers = waitingUsers.filter(u => u.id !== partner.id);
      waitingUsers.push(partner);
      broadcastCount(io);
      setTimeout(() => {
        if (socketProfiles[socket.id] && !matches[socket.id]) {
          waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
          waitingUsers.push(me);
          broadcastCount(io);
          tryMatch(io);
        }
      }, 2000);
    });

    socket.on('like_user', async () => {
      const m = matches[socket.id];
      if (!m) return;
      if (!m.likes) m.likes = {};
      if (m.likes[socket.id]) return;
      m.likes[socket.id] = true;

      const myName = socketProfiles[socket.id]?.displayName || 'Someone';
      io.to(m.partnerId).emit('partner_liked_you', { displayName: myName });

      const pm = matches[m.partnerId];
      if (pm?.likes?.[m.partnerId]) {
        const myUserId = socketProfiles[socket.id]?.userId;
        const partnerUserId = socketProfiles[m.partnerId]?.userId;
        if (myUserId && partnerUserId) {
          try {
            await connectDB();
            let existingMatch = await Match.findOne({ users: { $all: [myUserId, partnerUserId] } });
            if (!existingMatch) existingMatch = await Match.create({ users: [myUserId, partnerUserId] });
            const mid = existingMatch._id.toString();
            io.to(socket.id).emit('mutual_like', {
              matchId: mid,
              partnerDisplayName: socketProfiles[m.partnerId]?.displayName,
              partnerPicture:     socketProfiles[m.partnerId]?.picture,
              partnerId:          partnerUserId,
            });
            io.to(m.partnerId).emit('mutual_like', {
              matchId: mid,
              partnerDisplayName: socketProfiles[socket.id]?.displayName,
              partnerPicture:     socketProfiles[socket.id]?.picture,
              partnerId:          myUserId,
            });
          } catch (e) {
            console.error('Match creation error:', e);
          }
        }
      }
    });

    socket.on('join_match_room', ({ matchId }) => {
      if (matchId) socket.join(`match_${matchId}`);
    });

    socket.on('permanent_message', async ({ matchId, text }) => {
      if (!text?.trim() || !matchId || !socket.userId) return;
      try {
        await connectDB();
        const match = await Match.findOne({ _id: matchId, users: socket.userId });
        if (!match) return;
        const msg = await PermanentMessage.create({
          matchId,
          senderId:   socket.userId,
          senderName: socketProfiles[socket.id]?.displayName || 'Unknown',
          text:       text.trim().slice(0, 1000),
        });
        io.to(`match_${matchId}`).emit('permanent_message', {
          id:         msg._id,
          matchId,
          senderId:   socket.userId,
          senderName: msg.senderName,
          text:       msg.text,
          createdAt:  msg.createdAt,
        });
      } catch (e) {
        console.error('Permanent message error:', e);
      }
    });

    socket.on('webrtc_offer',   ({ offer, to })      => io.to(to).emit('webrtc_offer',   { offer, from: socket.id }));
    socket.on('webrtc_answer',  ({ answer, to })     => io.to(to).emit('webrtc_answer',  { answer, from: socket.id }));
    socket.on('webrtc_ice',     ({ candidate, to })  => io.to(to).emit('webrtc_ice',     { candidate, from: socket.id }));

    // ── Chat Call Signaling ──
    socket.on('chat_call_invite', async ({ matchId, type, callerName, callerPicture }) => {
      if (!socket.userId || !matchId) return;
      try {
        await connectDB();
        const match = await Match.findOne({ _id: matchId, users: socket.userId });
        if (!match) return;
        const partnerId      = match.users.find(u => u.toString() !== socket.userId.toString());
        if (!partnerId) return;
        const partnerSocket  = userSockets[partnerId.toString()];
        if (!partnerSocket) { socket.emit('chat_call_unavailable', { matchId }); return; }
        chatCalls[matchId] = { caller: socket.id, callee: null, type };
        
        io.to(partnerSocket).emit('chat_call_incoming', {
          matchId,
          type,
          callerName:    callerName || socketProfiles[socket.id]?.displayName || 'Someone',
          callerPicture: callerPicture || socketProfiles[socket.id]?.picture || null,
        });
      } catch (e) { console.error('Chat call invite error:', e); }
    });

    socket.on('chat_call_accept', ({ matchId }) => {
      const call = chatCalls[matchId];
      if (!call) return;
      call.callee = socket.id;
      io.to(call.caller).emit('chat_call_accepted', { matchId });
    });

    socket.on('chat_call_reject', ({ matchId }) => {
      const call = chatCalls[matchId];
      if (!call) return;
      io.to(call.caller).emit('chat_call_rejected', { matchId });
      delete chatCalls[matchId];
    });

    socket.on('chat_call_offer', ({ offer, matchId }) => {
      const call = chatCalls[matchId];
      if (!call) return;
      const target = socket.id === call.caller ? call.callee : call.caller;
      if (target) io.to(target).emit('chat_call_offer', { offer });
    });

    socket.on('chat_call_answer', ({ answer, matchId }) => {
      const call = chatCalls[matchId];
      if (!call) return;
      const target = socket.id === call.callee ? call.caller : call.caller;
      if (target) io.to(target).emit('chat_call_answer', { answer });
    });

    socket.on('chat_call_ice', ({ candidate, matchId }) => {
      const call = chatCalls[matchId];
      if (!call) return;
      const target = socket.id === call.caller ? call.callee : call.caller;
      if (target) io.to(target).emit('chat_call_ice', { candidate });
    });

    socket.on('chat_call_end', ({ matchId }) => {
      const call = chatCalls[matchId];
      if (!call) return;
      const target = socket.id === call.caller ? call.callee : call.caller;
      if (target) io.to(target).emit('chat_call_ended', { matchId });
      delete chatCalls[matchId];
    });

    socket.on('chat_message', ({ message, to }) => {
      const name = socketProfiles[socket.id]?.displayName || 'Unknown';
      io.to(to).emit('chat_message', { message, name });
    });

    socket.on('end_call', () => {
      const m = matches[socket.id];
      if (m) {
        io.to(m.partnerId).emit('call_ended');
        delete matches[m.partnerId];
        delete matches[socket.id];
      }
    });

    socket.on('disconnect', () => {
      waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
      if (socket.userId) delete userSockets[socket.userId];
      const m = matches[socket.id];
      if (m) {
        io.to(m.partnerId).emit('call_ended');
        delete matches[m.partnerId];
      }
      delete matches[socket.id];
      delete socketProfiles[socket.id];
      broadcastCount(io);

      // Clean up any active chat calls involving this socket
      for (const [matchId, call] of Object.entries(chatCalls)) {
        if (call.caller === socket.id || call.callee === socket.id) {
          const target = call.caller === socket.id ? call.callee : call.caller;
          if (target) io.to(target).emit('chat_call_ended', { matchId });
          delete chatCalls[matchId];
        }
      }
    });
  });
}

module.exports = initSockets;
