const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username:    { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:    { type: String, required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 30 },
  picture:     { type: String, default: null },
  bio:         { type: String, default: '', maxlength: 150 },
  city:        { type: String, default: '', maxlength: 100, trim: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
