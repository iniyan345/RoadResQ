const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const Request = require('../models/Request');
const EmergencyContact = require('../models/EmergencyContact');
const Notification = require('../models/Notification');
const { sendEmail } = require('../services/email');

const router = express.Router();

/**
 * POST /api/sos — one-tap SOS activation.
 *
 * IMPORTANT: This endpoint does NOT automatically dispatch police or ambulance.
 * No real government/emergency dispatch API is integrated.
 * The response provides emergency numbers the user should call directly.
 * `dispatchedAlerts` flags record that an in-app alert was generated, nothing more.
 */
router.post(
  '/',
  requireAuth,
  [body('coordinates').isArray({ min: 2, max: 2 }), body('coordinates.*').isFloat()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const { coordinates } = req.body;
      const [lng, lat] = coordinates;
      const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;

      const sosRequest = await Request.create({
        requestCode: 'SOS-' + Math.floor(10000 + Math.random() * 90000),
        user: req.user._id,
        issue: 'Accident',
        contactName: req.user.name,
        contactPhone: req.user.phone || 'unknown',
        location: { type: 'Point', coordinates },
        status: 'searching',
        isAccident: true,
        // Flags that an IN-APP alert was generated (NOT that emergency services were called)
        dispatchedAlerts: { police: true, ambulance: true, hospital: true },
      });

      const contacts = await EmergencyContact.find({ user: req.user._id });

      await Notification.create({
        user: req.user._id,
        request: sosRequest._id,
        type: 'sos_activated',
        title: 'SOS activated',
        body: `SOS alert created at (${lat.toFixed(4)}, ${lng.toFixed(4)}). Tap Call 112 or 108 to reach emergency services.`,
        channels: { push: true, email: true },
      });

      // Fire-and-forget distress emails to emergency contacts that have an email field
      if (contacts.length) {
        await Promise.allSettled(
          contacts
            .filter(c => c.email)
            .map(c =>
              sendEmail({
                to: c.email,
                subject: `🚨 RoadResQ SOS — ${req.user.name} needs help`,
                text: [
                  `${req.user.name} has triggered an SOS alert on RoadResQ.`,
                  ``,
                  `Live location: ${mapsLink}`,
                  `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                  ``,
                  `Please contact them immediately or call emergency services:`,
                  `  • Police / Unified Emergency: 112`,
                  `  • Ambulance: 108`,
                  `  • Highway Patrol: 1073`,
                ].join('\n'),
              })
            )
        );
      }

      req.app.get('io')?.to(`user:${req.user._id}`).emit('sos:activated', {
        requestId: sosRequest._id,
        coordinates,
        mapsLink,
      });

      res.status(201).json({
        success: true,
        data: {
          request: sosRequest,
          notifiedContacts: contacts.length,
          // These are numbers to CALL — the app does not auto-dispatch
          emergencyNumbers: {
            police: '112',
            ambulance: '108',
            highwayPatrol: '1073',
          },
          mapsLink,
          message: 'SOS alert created. Tap the emergency numbers below to call emergency services directly.',
        },
      });
    } catch (err) {
      console.error('[sos] activation error:', err);
      res.status(500).json({ success: false, message: 'Failed to activate SOS' });
    }
  }
);

module.exports = router;
