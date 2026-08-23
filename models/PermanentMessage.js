const mongoose = require('mongoose');

const permanentMsgSchema = new mongoose.Schema({
  matchId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  type:       { type: String, enum: ['text', 'voice', 'image'], default: 'text' },
  text:       { type: String, default: '', maxlength: 1000 },
  voiceData:  { type: String, default: null },
  imageData:  { type: String, default: null },
  duration:   { type: Number, default: 0 },
}, { timestamps: true });

const PermanentMessage = mongoose.models.PermanentMessage || mongoose.model('PermanentMessage', permanentMsgSchema);

module.exports = PermanentMessage;
