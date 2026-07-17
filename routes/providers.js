const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const Provider = require('../models/Provider');

const router = express.Router();

// ─── GET /api/providers/nearby ────────────────────────────────────────────────
router.get(
  '/nearby',
  [
    query('lat').isFloat({ min: -90, max: 90 }),
    query('lng').isFloat({ min: -180, max: 180 }),
    query('category').optional().isIn([
      'mechanic', 'puncture', 'towing', 'fuel', 'hospital', 'battery', 'police', 'general',
    ]),
    query('radiusKm').optional().isFloat({ min: 0.1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const { lat, lng, category, radiusKm = 15 } = req.query;
      const filter = {
        open: true,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
            $maxDistance: parseFloat(radiusKm) * 1000,
          },
        },
      };
      if (category) filter.category = category;

      const providers = await Provider.find(filter)
        .select('-owner -currentLocation')
        .limit(50);

      res.json({ success: true, data: { providers } });
    } catch (err) {
      console.error('[providers] nearby error:', err);
      res.status(500).json({ success: false, message: 'Failed to search nearby providers' });
    }
  }
);

// ─── GET /api/providers/:id ───────────────────────────────────────────────────
router.get('/:id', [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid provider ID' });

    const provider = await Provider.findById(req.params.id).select('-owner');
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
    res.json({ success: true, data: { provider } });
  } catch (err) {
    console.error('[providers] get error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch provider' });
  }
});

// ─── POST /api/providers — register as a service provider ────────────────────
router.post(
  '/',
  requireAuth,
  [
    body('name').trim().notEmpty().isLength({ max: 80 }),
    body('businessName').optional().trim().isLength({ max: 100 }),
    body('category').isIn(['mechanic', 'puncture', 'towing', 'fuel', 'hospital', 'battery', 'general']),
    body('phone').trim().notEmpty(),
    body('coordinates').isArray({ min: 2, max: 2 }),
    body('coordinates.*').isFloat(),
    body('address').optional().trim().isLength({ max: 200 }),
    body('serviceRadius').optional().isFloat({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      // One provider profile per user
      const existing = await Provider.findOne({ owner: req.user._id });
      if (existing) {
        return res.status(409).json({ success: false, message: 'You already have a provider profile' });
      }

      const { name, businessName, category, phone, coordinates, address, serviceRadius } = req.body;
      const provider = await Provider.create({
        owner: req.user._id,
        name,
        businessName,
        category,
        phone,
        email: req.user.email,
        address,
        location: { type: 'Point', coordinates },
        serviceRadius: serviceRadius || 15,
        open: true,
      });

      // Update user role
      req.user.role = 'provider';
      await req.user.save();

      res.status(201).json({ success: true, data: { provider } });
    } catch (err) {
      console.error('[providers] create error:', err);
      res.status(500).json({ success: false, message: 'Failed to create provider profile' });
    }
  }
);

// ─── PATCH /api/providers/me/availability — toggle online/offline ─────────────
router.patch('/me/availability', requireAuth, [body('open').isBoolean()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed' });

    const provider = await Provider.findOneAndUpdate(
      { owner: req.user._id },
      { $set: { open: req.body.open } },
      { new: true }
    );
    if (!provider) return res.status(404).json({ success: false, message: 'Provider profile not found' });

    res.json({ success: true, data: { provider } });
  } catch (err) {
    console.error('[providers] availability error:', err);
    res.status(500).json({ success: false, message: 'Failed to update availability' });
  }
});

module.exports = router;
