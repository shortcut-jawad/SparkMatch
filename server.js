require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const createMatchRouter = require('./routes/matchRoutes');
const initSockets = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

app.set('io', io);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api', authRoutes);
app.use('/api/matches', createMatchRouter(io));

// ── Socket / Matchmaking ──
initSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SparkMatch running at http://localhost:${PORT}`));

module.exports = server;
