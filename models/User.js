const mongoose = require('mongoose');

const encodingHistorySchema = new mongoose.Schema({
  video: String,
  subtitles: String,
  logo: String,
  outputFileName: String,
  encodedAt: Date,
  downloadLink: String
});

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  encodingHistory: [encodingHistorySchema]
});

const User = mongoose.model('User', userSchema);

module.exports = User;
