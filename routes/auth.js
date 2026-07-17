const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

/**
 * POST /api/auth/sync
 *
 * Called by the frontend immediately after Firebase login.
 * Updates the Mongo user document with the latest profile data from the
 * Firebase ID token (name, email, photoUrl, phone) and returns the full
 * profile so the frontend can display it without a second round-trip.
 *
 * The requireAuth middleware already creates the user if this is their
 * first ever login. This endpoint only enriches / refreshes the record.
 */
router.post(
  '/sync',
  requireAuth,
  [
    body('name').optional().trim().isLength({ max: 80 }),
    body('photoUrl').optional().isURL(),
    body('phone').optional().trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const decoded = req.firebaseUser;
      const updates = {
        lastLoginAt: new Date(),
      };

      // Use values from Firebase token if not overridden by body
      if (decoded.name || req.body.name) updates.name = req.body.name || decoded.name;
      if (decoded.picture || req.body.photoUrl) updates.photoUrl = req.body.photoUrl || decoded.picture;
      if (req.body.phone) updates.phone = req.body.phone;

      // Set authProvider based on Firebase sign-in method
      const signInProvider = decoded.firebase?.sign_in_provider;
      if (signInProvider === 'google.com') updates.authProvider = 'google';
      else if (signInProvider === 'password') updates.authProvider = 'firebase';

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { new: true, runValidators: true, select: '-passwordHash' }
      );

      res.json({ success: true, data: { user } });
    } catch (err) {
      console.error('[auth] sync error:', err);
      res.status(500).json({ success: false, message: 'Failed to sync user profile' });
    }
  }
);

/**
 * GET /api/auth/me
 * Returns the current authenticated user's Mongo profile.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[auth] me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

module.exports = router;
