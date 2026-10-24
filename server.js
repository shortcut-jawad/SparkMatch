require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const createMatchRouter = require('./routes/matchRoutes');
const iceRoutes = require('./routes/iceRoutes');
const initSockets = require('./sockets/socketHandler');
const connectDB = require('./config/db');

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
// Pings MongoDB too, so keep-alive monitors also stop Atlas auto-pausing the free cluster
app.get('/api/health', async (_, res) => {
  try {
    await connectDB();
    await mongoose.connection.db.admin().ping();
    res.json({ ok: true, db: 'up' });
  } catch (e) {
    console.error('Health check DB error:', e.message);
    res.status(503).json({ ok: false, db: 'down' });
  }
});
app.use('/api', authRoutes);
app.use('/api/matches', createMatchRouter(io));
app.use('/api/ice-servers', iceRoutes);

// ── Socket / Matchmaking ──
initSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SparkMatch running at http://localhost:${PORT}`));

module.exports = server;
