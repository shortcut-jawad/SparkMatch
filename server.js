require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB connection caching (serverless-safe) ──
let _mongoCache = null;

async function connectDB() {
  if (_mongoCache && mongoose.connection.readyState === 1) return _mongoCache;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI not set');
  _mongoCache = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  return _mongoCache;
}

// ── Schema ──
const userSchema = new mongoose.Schema({
  username:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:    { type: String, required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 30 },
  picture:     { type: String, default: null },
  bio:         { type: String, default: '', maxlength: 150 },
  city:        { type: String, default: '', maxlength: 100, trim: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'sparkmatch_jwt_secret_2024';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only'));
  }
});

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function publicUser(u) {
  return { id: u._id, username: u.username, displayName: u.displayName, bio: u.bio, picture: u.picture, city: u.city || '' };
}

// ── Routes ──

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.post('/api/register', upload.single('picture'), async (req, res) => {
  try {
    await connectDB();
    const { username, password, displayName, bio, city } = req.body;
    if (!username || !password || !displayName)
      return res.status(400).json({ error: 'Username, password, and display name are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    if (await User.findOne({ username: username.toLowerCase() }))
      return res.status(400).json({ error: 'Username already taken' });

    const picture = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      : null;

    const user = await User.create({
      username: username.toLowerCase(),
      password: await bcrypt.hash(password, 10),
      displayName,
      bio: bio || '',
      city: city || '',
      picture,
    });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error('Register error:', e.message);
    if (e.code === 11000) return res.status(400).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    await connectDB();
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required' });
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ error: 'Invalid username or password' });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

app.get('/api/profile', auth, async (req, res) => {
  try {
    await connectDB();
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(publicUser(user));
  } catch (e) {
    console.error('Profile error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

app.put('/api/profile', auth, upload.single('picture'), async (req, res) => {
  try {
    await connectDB();
    const { displayName, bio, city, currentPassword, newPassword, removePicture } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Not found' });

    if (displayName) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (city !== undefined) user.city = city;

    if (removePicture === 'true') {
      user.picture = null;
    } else if (req.file) {
      user.picture = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });
      if (!(await bcrypt.compare(currentPassword, user.password)))
        return res.status(400).json({ error: 'Current password is incorrect' });
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json(publicUser(user));
  } catch (e) {
    console.error('Update error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

app.delete('/api/profile', auth, async (req, res) => {
  try {
    await connectDB();
    await User.findByIdAndDelete(req.user.id);
    res.json({ message: 'Account deleted' });
  } catch (e) {
    console.error('Delete error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ── Socket / Matchmaking ──
let waitingUsers = [];
let matches = {};
let socketProfiles = {};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tryMatch() {
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

function broadcastCount() {
  io.emit('waiting_count', { count: waitingUsers.length });
}

io.on('connection', (socket) => {
  socket.emit('waiting_count', { count: waitingUsers.length });

  socket.on('join_waiting', (profile) => {
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id); // dedup
    socketProfiles[socket.id] = profile;
    waitingUsers.push({ id: socket.id, ...profile });
    broadcastCount();
    tryMatch();
  });

  socket.on('leave_waiting', () => {
    waitingUsers = waitingUsers.filter(u => u.id !== socket.id);
    broadcastCount();
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
    waitingUsers.push(me, partner);
    io.to(socket.id).emit('back_to_waiting');
    io.to(partner.id).emit('back_to_waiting');
    broadcastCount();
    tryMatch();
  });

  socket.on('webrtc_offer',   ({ offer, to })      => io.to(to).emit('webrtc_offer',   { offer, from: socket.id }));
  socket.on('webrtc_answer',  ({ answer, to })     => io.to(to).emit('webrtc_answer',  { answer, from: socket.id }));
  socket.on('webrtc_ice',     ({ candidate, to })  => io.to(to).emit('webrtc_ice',     { candidate, from: socket.id }));

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
    const m = matches[socket.id];
    if (m) {
      io.to(m.partnerId).emit('call_ended');
      delete matches[m.partnerId];
    }
    delete matches[socket.id];
    delete socketProfiles[socket.id];
    broadcastCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`SparkMatch running at http://localhost:${PORT}`));

module.exports = server;
