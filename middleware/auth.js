const admin = require('../config/firebase');
const User = require('../models/User');

/**
 * Verifies the Firebase ID token sent as `Authorization: Bearer <token>`.
 * On success, attaches `req.firebaseUser` (decoded token) and `req.user` (Mongo user doc).
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization bearer token' });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;

    let user = await User.findOne({ firebaseUid: decoded.uid });
    if (!user) {
      // First time we've seen this Firebase user — provision a Mongo profile.
      user = await User.create({
        firebaseUid: decoded.uid,
        name: decoded.name || decoded.email?.split('@')[0] || 'RoadResQ User',
        email: decoded.email,
        authProvider: decoded.firebase?.sign_in_provider === 'google.com' ? 'google' : 'firebase',
        lastLoginAt: new Date(),
      });
    } else {
      user.lastLoginAt = new Date();
      await user.save();
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

module.exports = { requireAuth };
