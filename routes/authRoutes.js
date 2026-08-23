const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connectDB = require('../config/db');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { publicUser } = require('../utils/helpers');
const { JWT_SECRET } = require('../config/jwt');

const router = express.Router();

router.post('/register', upload.single('picture'), async (req, res) => {
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

router.post('/login', async (req, res) => {
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

router.get('/profile', auth, async (req, res) => {
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

router.put('/profile', auth, upload.single('picture'), async (req, res) => {
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

router.delete('/profile', auth, async (req, res) => {
  try {
    await connectDB();
    await User.findByIdAndDelete(req.user.id);
    res.json({ message: 'Account deleted' });
  } catch (e) {
    console.error('Delete error:', e.message);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

module.exports = router;
