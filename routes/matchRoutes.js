const express = require('express');
const connectDB = require('../config/db');
const User = require('../models/User');
const Match = require('../models/Match');
const PermanentMessage = require('../models/PermanentMessage');
const auth = require('../middleware/auth');
const { upload, audioUpload } = require('../middleware/upload');
const { publicUser } = require('../utils/helpers');

function createMatchRouter(io) {
  const router = express.Router();

  router.get('/', auth, async (req, res) => {
    try {
      await connectDB();
      const userMatches = await Match.find({ users: req.user.id })
        .populate('users', 'displayName picture username bio city')
        .sort({ createdAt: -1 });
      const results = await Promise.all(userMatches.map(async (m) => {
        const lastMsg = await PermanentMessage.findOne({ matchId: m._id }).sort({ createdAt: -1 });
        const partner = m.users.find(u => u._id.toString() !== req.user.id);
        return {
          id: m._id,
          partner: partner ? publicUser(partner) : null,
          lastMessage: lastMsg
            ? { text: lastMsg.type === 'voice' ? '🎤 Voice note' : lastMsg.type === 'image' ? '📷 Photo' : lastMsg.text, senderName: lastMsg.senderName, createdAt: lastMsg.createdAt }
            : null,
          createdAt: m.createdAt,
        };
      }));
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/:matchId/messages', auth, async (req, res) => {
    try {
      await connectDB();
      const match = await Match.findOne({ _id: req.params.matchId, users: req.user.id });
      if (!match) return res.status(404).json({ error: 'Match not found' });
      const messages = await PermanentMessage.find({ matchId: req.params.matchId })
        .sort({ createdAt: 1 }).limit(200);
      res.json(messages.map(m => ({
        id:        m._id,
        senderId:  m.senderId.toString(),
        senderName: m.senderName,
        type:      m.type || 'text',
        text:      m.text || '',
        voiceData: m.voiceData || null,
        imageData: m.imageData || null,
        duration:  m.duration  || 0,
        createdAt: m.createdAt,
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/:matchId/voice-note', auth, audioUpload.single('audio'), async (req, res) => {
    try {
      await connectDB();
      const match = await Match.findOne({ _id: req.params.matchId, users: req.user.id });
      if (!match) return res.status(404).json({ error: 'Match not found' });
      if (!req.file)  return res.status(400).json({ error: 'Audio file required' });

      const voiceData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const duration  = parseFloat(req.body.duration) || 0;
      const user      = await User.findById(req.user.id).select('displayName');

      const msg = await PermanentMessage.create({
        matchId:   req.params.matchId,
        senderId:  req.user.id,
        senderName: user?.displayName || 'Unknown',
        type:      'voice',
        text:      '',
        voiceData,
        duration,
      });

      const payload = {
        id:        msg._id,
        matchId:   req.params.matchId,
        senderId:  req.user.id,
        senderName: msg.senderName,
        type:      'voice',
        voiceData,
        duration,
        createdAt: msg.createdAt,
      };

      const socketIo = io || req.app.get('io');
      if (socketIo) socketIo.to(`match_${req.params.matchId}`).emit('permanent_message', payload);
      res.json(payload);
    } catch (e) {
      console.error('Voice note error:', e.message);
      res.status(500).json({ error: 'Server error: ' + e.message });
    }
  });

  router.post('/:matchId/image', auth, upload.single('picture'), async (req, res) => {
    try {
      await connectDB();
      const match = await Match.findOne({ _id: req.params.matchId, users: req.user.id });
      if (!match) return res.status(404).json({ error: 'Match not found' });
      if (!req.file) return res.status(400).json({ error: 'Image file required' });

      const imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      const user = await User.findById(req.user.id).select('displayName');

      const msg = await PermanentMessage.create({
        matchId:    req.params.matchId,
        senderId:   req.user.id,
        senderName: user?.displayName || 'Unknown',
        type:       'image',
        text:       '',
        imageData,
      });

      const payload = {
        id:         msg._id,
        matchId:    req.params.matchId,
        senderId:   req.user.id,
        senderName: msg.senderName,
        type:       'image',
        imageData,
        createdAt:  msg.createdAt,
      };

      const socketIo = io || req.app.get('io');
      if (socketIo) socketIo.to(`match_${req.params.matchId}`).emit('permanent_message', payload);
      res.json(payload);
    } catch (e) {
      console.error('Chat image error:', e.message);
      res.status(500).json({ error: 'Server error: ' + e.message });
    }
  });

  return router;
}

module.exports = createMatchRouter;
