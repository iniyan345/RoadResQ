const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const EmergencyContact = require('../models/EmergencyContact');
const Request = require('../models/Request');

const router = express.Router();

// ─────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────

/**
 * GET /api/users/me
 * Returns the authenticated user's full profile.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[users] get profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

/**
 * PATCH /api/users/me
 * Update mutable profile fields (name, phone, notificationPreferences).
 * Users cannot change email or firebaseUid here — those are managed by Firebase.
 */
router.patch(
  '/me',
  requireAuth,
  [
    body('name').optional().trim().isLength({ min: 1, max: 80 }),
    body('phone').optional().trim().isLength({ max: 20 }),
    body('notificationPreferences.email').optional().isBoolean(),
    body('notificationPreferences.push').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const allowed = ['name', 'phone', 'notificationPreferences'];
      const updates = {};
      allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { new: true, runValidators: true, select: '-passwordHash' }
      );
      res.json({ success: true, data: { user } });
    } catch (err) {
      console.error('[users] update profile error:', err);
      res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
  }
);

// ─────────────────────────────────────────
// VEHICLES
// ─────────────────────────────────────────

/**
 * GET /api/users/me/vehicles
 */
router.get('/me/vehicles', requireAuth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ user: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, data: { vehicles } });
  } catch (err) {
    console.error('[users] list vehicles error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch vehicles' });
  }
});

/**
 * POST /api/users/me/vehicles
 */
router.post(
  '/me/vehicles',
  requireAuth,
  [
    body('plateNumber').trim().notEmpty().toUpperCase(),
    body('vehicleType').isIn(['car', 'bike', 'suv', 'truck', 'auto', 'other']),
    body('make').optional().trim().isLength({ max: 50 }),
    body('model').optional().trim().isLength({ max: 50 }),
    body('year').optional().isInt({ min: 1980, max: new Date().getFullYear() + 1 }),
    body('fuelType').optional().isIn(['petrol', 'diesel', 'electric', 'cng', 'hybrid']),
    body('isDefault').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const { plateNumber, vehicleType, make, model, year, fuelType, isDefault } = req.body;

      // If this is default, un-set any existing default
      if (isDefault) {
        await Vehicle.updateMany({ user: req.user._id, isDefault: true }, { $set: { isDefault: false } });
      }

      const vehicle = await Vehicle.create({
        user: req.user._id,
        plateNumber,
        vehicleType,
        make,
        model,
        year,
        fuelType,
        isDefault: isDefault || false,
      });

      res.status(201).json({ success: true, data: { vehicle } });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'A vehicle with this plate number already exists in your account' });
      }
      console.error('[users] add vehicle error:', err);
      res.status(500).json({ success: false, message: 'Failed to add vehicle' });
    }
  }
);

/**
 * PATCH /api/users/me/vehicles/:id
 */
router.patch(
  '/me/vehicles/:id',
  requireAuth,
  [
    param('id').isMongoId(),
    body('plateNumber').optional().trim().notEmpty().toUpperCase(),
    body('vehicleType').optional().isIn(['car', 'bike', 'suv', 'truck', 'auto', 'other']),
    body('make').optional().trim().isLength({ max: 50 }),
    body('model').optional().trim().isLength({ max: 50 }),
    body('year').optional().isInt({ min: 1980, max: new Date().getFullYear() + 1 }),
    body('fuelType').optional().isIn(['petrol', 'diesel', 'electric', 'cng', 'hybrid']),
    body('isDefault').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const vehicle = await Vehicle.findOne({ _id: req.params.id, user: req.user._id });
      if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

      if (req.body.isDefault) {
        await Vehicle.updateMany({ user: req.user._id, isDefault: true }, { $set: { isDefault: false } });
      }

      const allowed = ['plateNumber', 'vehicleType', 'make', 'model', 'year', 'fuelType', 'isDefault'];
      allowed.forEach(k => { if (req.body[k] !== undefined) vehicle[k] = req.body[k]; });
      await vehicle.save();

      res.json({ success: true, data: { vehicle } });
    } catch (err) {
      console.error('[users] update vehicle error:', err);
      res.status(500).json({ success: false, message: 'Failed to update vehicle' });
    }
  }
);

/**
 * DELETE /api/users/me/vehicles/:id
 */
router.delete('/me/vehicles/:id', requireAuth, [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid vehicle ID' });
    }

    const result = await Vehicle.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!result) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    res.json({ success: true, message: 'Vehicle deleted' });
  } catch (err) {
    console.error('[users] delete vehicle error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete vehicle' });
  }
});

// ─────────────────────────────────────────
// EMERGENCY CONTACTS
// ─────────────────────────────────────────

/**
 * GET /api/users/me/emergency-contacts
 */
router.get('/me/emergency-contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await EmergencyContact.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { contacts } });
  } catch (err) {
    console.error('[users] list contacts error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch emergency contacts' });
  }
});

/**
 * POST /api/users/me/emergency-contacts
 */
router.post(
  '/me/emergency-contacts',
  requireAuth,
  [
    body('name').trim().notEmpty().isLength({ max: 80 }),
    body('phone').trim().notEmpty().isLength({ max: 20 }),
    body('relationship').optional().trim().isLength({ max: 40 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      // Limit to 5 emergency contacts per user
      const count = await EmergencyContact.countDocuments({ user: req.user._id });
      if (count >= 5) {
        return res.status(400).json({ success: false, message: 'Maximum 5 emergency contacts allowed' });
      }

      const contact = await EmergencyContact.create({
        user: req.user._id,
        name: req.body.name,
        phone: req.body.phone,
        relationship: req.body.relationship,
      });

      res.status(201).json({ success: true, data: { contact } });
    } catch (err) {
      console.error('[users] add contact error:', err);
      res.status(500).json({ success: false, message: 'Failed to add emergency contact' });
    }
  }
);

/**
 * DELETE /api/users/me/emergency-contacts/:id
 */
router.delete('/me/emergency-contacts/:id', requireAuth, [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid contact ID' });
    }

    const result = await EmergencyContact.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!result) return res.status(404).json({ success: false, message: 'Contact not found' });

    res.json({ success: true, message: 'Emergency contact deleted' });
  } catch (err) {
    console.error('[users] delete contact error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete emergency contact' });
  }
});

// ─────────────────────────────────────────
// REQUEST HISTORY
// ─────────────────────────────────────────

/**
 * GET /api/users/me/requests
 * Returns the authenticated user's request history (latest 50).
 */
router.get('/me/requests', requireAuth, async (req, res) => {
  try {
    const requests = await Request.find({ user: req.user._id })
      .populate('provider', 'name category phone rating')
      .populate('vehicle', 'plateNumber vehicleType make model')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: { requests } });
  } catch (err) {
    console.error('[users] request history error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch request history' });
  }
});

module.exports = router;
