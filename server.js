const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// State
let waitingUsers = []; // [{id, name}]
let matches = {};      // socketId -> {partnerId, accepted: bool}
let userNames = {};    // socketId -> name

const REQUIRED_USERS = 3;

function tryMatch() {
  if (waitingUsers.length < 2) return;

  // Pick two random users from waiting pool
  const pool = [...waitingUsers];
  const idx1 = Math.floor(Math.random() * pool.length);
  let idx2;
  do { idx2 = Math.floor(Math.random() * pool.length); } while (idx2 === idx1);

  const user1 = pool[idx1];
  const user2 = pool[idx2];

  // Remove them from waiting
  waitingUsers = waitingUsers.filter(u => u.id !== user1.id && u.id !== user2.id);

  // Store pending match
  matches[user1.id] = { partnerId: user2.id, accepted: false };
  matches[user2.id] = { partnerId: user1.id, accepted: false };

  // Send each user the other's profile
  io.to(user1.id).emit('show_profile', { name: user2.name, partnerId: user2.id });
  io.to(user2.id).emit('show_profile', { name: user1.name, partnerId: user1.id });

  console.log(`Matched: ${user1.name} <-> ${user2.name}`);
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('join_waiting', ({ name }) => {
    userNames[socket.id] = name;
    waitingUsers.push({ id: socket.id, name });
    console.log(`${name} joined waiting. Total waiting: ${waitingUsers.length}`);

    // Broadcast updated waiting count to all waiting users
    broadcastWaitingCount();

    tryMatch();
  });

  socket.on('accept', () => {
    const match = matches[socket.id];
    if (!match) return;

    match.accepted = true;
    const partnerMatch = matches[match.partnerId];

    if (partnerMatch && partnerMatch.accepted) {
      // Both accepted! Start call.
      // Designate caller/callee
      io.to(socket.id).emit('start_call', { initiator: false, partnerId: match.partnerId });
      io.to(match.partnerId).emit('start_call', { initiator: true, partnerId: socket.id });
      console.log(`Call started: ${userNames[socket.id]} <-> ${userNames[match.partnerId]}`);
    } else {
      // Notify partner that this person accepted
      io.to(match.partnerId).emit('partner_accepted');
    }
  });

  socket.on('decline', () => {
    const match = matches[socket.id];
    if (!match) return;

    io.to(match.partnerId).emit('partner_declined');

    // Put both back in waiting
    const user = { id: socket.id, name: userNames[socket.id] };
    const partner = { id: match.partnerId, name: userNames[match.partnerId] };

    delete matches[socket.id];
    delete matches[match.partnerId];

    waitingUsers.push(user);
    waitingUsers.push(partner);

    io.to(socket.id).emit('back_to_waiting');
    io.to(partner.id).emit('back_to_waiting');

    broadcastWaitingCount();
    tryMatch();
  });

  // WebRTC Signaling
  socket.on('webrtc_offer', ({ offer, to }) => {
    io.to(to).emit('webrtc_offer', { offer, from: socket.id });
  });

  socket.on('webrtc_answer', ({ answer, to }) => {
    io.to(to).emit('webrtc_answer', { answer, from: socket.id });
  });

  socket.on('webrtc_ice', ({ candidate, to }) => {
    io.to(to).emit('webrtc_ice', { candidate, from: socket.id });
  });

  socket.on('chat_message', ({ message, to }) => {
    const name = userNames[socket.id];
    io.to(to).emit('chat_message', { message, name });
  });

  socket.on('end_call', () => {
    const match = matches[socket.id];
    if (match) {
      io.to(match.partnerId).emit('call_ended');
      delete matches[match.partnerId];
      delete matches[socket.id];
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', userNames[socket.id] || socket.id);
    // Remove from waiting
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);

    // Notify partner if in a match
    const match = matches[socket.id];
    if (match) {
      io.to(match.partnerId).emit('call_ended');
      delete matches[match.partnerId];
    }
    delete matches[socket.id];
    delete userNames[socket.id];
    broadcastWaitingCount();
  });

  function broadcastWaitingCount() {
    io.emit('waiting_count', { count: waitingUsers.length });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`SparkMatch running at http://localhost:${PORT}`);
});
