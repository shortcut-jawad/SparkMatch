const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

const Match = mongoose.models.Match || mongoose.model('Match', matchSchema);

module.exports = Match;
