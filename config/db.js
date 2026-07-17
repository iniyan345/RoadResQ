const mongoose = require('mongoose');

let _connected = false;

async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000, // fail faster for better UX
      heartbeatFrequencyMS: 10000,
    });
    _connected = true;
    console.log(`[db] MongoDB Atlas connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('[db] MongoDB connection error:', err.message);
    console.error('[db] → Check that your current IP is whitelisted in MongoDB Atlas:');
    console.error('[db]   Atlas → Network Access → Add IP Address → Add Current IP Address');
    // Do NOT exit — let the server keep running so /api/config/firebase
    // and static file serving still work. API routes that need MongoDB
    // will return 503 until the connection is established.
  }
}

mongoose.connection.on('connected', () => {
  _connected = true;
  console.log('[db] MongoDB reconnected');
});

mongoose.connection.on('disconnected', () => {
  _connected = false;
  console.warn('[db] MongoDB disconnected — reconnecting…');
});

mongoose.connection.on('error', (err) => {
  console.error('[db] Mongoose runtime error:', err.message);
});

/** Returns true if the database is currently connected */
function isConnected() {
  return _connected;
}

module.exports = connectDB;
module.exports.isConnected = isConnected;
