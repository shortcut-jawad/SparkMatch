const mongoose = require('mongoose');

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

module.exports = connectDB;
