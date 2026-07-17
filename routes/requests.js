const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const Request = require('../models/Request');
const Provider = require('../models/Provider');
const Notification = require('../models/Notification');

const router = express.Router();

const ISSUE_TO_CATEGORY = {
  'Flat Tyre': 'puncture',
  'Engine Problem': 'mechanic',
  'Battery Dead': 'battery',
  'Fuel Empty': 'fuel',
  'Accident': 'hospital',
  'Tow Truck': 'towing',
  "Vehicle Won't Start": 'mechanic',
  'Smoke': 'mechanic',
  'Brake Failure': 'mechanic',
  'General Assistance': 'general',
};

function genRequestCode(prefix = 'RR') {
  return prefix + '-' + Math.floor(10000 + Math.random() * 90000);
}

// ─── Helper: create and push a notification ───────────────────────────────────
async function pushNotification(io, userId, requestId, type, title, body) {
  const notif = await Notification.create({ user: userId, request: requestId, type, title, body });
  io?.to(`user:${userId}`).emit('new_notification', { notification: notif });
  return notif;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/requests — create a help request, auto-assign nearest provider
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  [
    body('issue').isIn([
      'Flat Tyre', 'Engine Problem', 'Battery Dead', 'Fuel Empty', 'Accident',
      'Tow Truck', "Vehicle Won't Start", 'Smoke', 'Brake Failure', 'General Assistance',
    ]),
    body('contactName').trim().notEmpty(),
    body('contactPhone').trim().notEmpty(),
    body('vehicleId').optional().isMongoId(),
    body('coordinates').isArray({ min: 2, max: 2 }),
    body('coordinates.*').isFloat(),
    body('category').optional().isIn(['mechanic', 'puncture', 'towing', 'fuel', 'hospital', 'battery', 'general']),
    body('locationLabel').optional().trim().isLength({ max: 200 }),
    body('notes').optional().trim().isLength({ max: 500 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const { issue, contactName, contactPhone, vehicleId, coordinates, locationLabel, notes } = req.body;
      const category = req.body.category || ISSUE_TO_CATEGORY[issue] || 'general';
      const isAccident = issue === 'Accident';
      const io = req.app.get('io');

      // Find nearest open provider in requested category not already handling a request
      const nearestProvider = await Provider.findOne({
        category,
        open: true,
        activeRequest: null,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates },
            $maxDistance: 30000, // 30 km max search radius
          },
        },
      });

      const reqDoc = await Request.create({
        requestCode: genRequestCode(),
        user: req.user._id,
        provider: nearestProvider?._id,
        vehicle: vehicleId || undefined,
        issue,
        contactName,
        contactPhone,
        location: { type: 'Point', coordinates, label: locationLabel },
        status: nearestProvider ? 'assigned' : 'searching',
        notes,
        isAccident,
        // Record that an alert was prepared (NOT that emergency services were dispatched)
        dispatchedAlerts: isAccident ? { police: true, ambulance: true, hospital: true } : {},
        etaMinutes: nearestProvider ? 8 : null,
      });

      // Lock the provider so they can't be double-assigned
      if (nearestProvider) {
        nearestProvider.activeRequest = reqDoc._id;
        await nearestProvider.save();

        await pushNotification(
          io, req.user._id, reqDoc._id,
          'provider_assigned',
          'Provider assigned',
          `${nearestProvider.name} has been assigned to your request (${reqDoc.requestCode}).`
        );

        io?.to(`user:${req.user._id}`).emit('request:update', {
          requestId: reqDoc._id,
          status: reqDoc.status,
          provider: {
            _id: nearestProvider._id,
            name: nearestProvider.name,
            phone: nearestProvider.phone,
            rating: nearestProvider.rating,
            category: nearestProvider.category,
          },
        });
      } else {
        // No provider found — notify user
        await pushNotification(
          io, req.user._id, reqDoc._id,
          'request_created',
          'Request received',
          `Your request ${reqDoc.requestCode} is registered. We are searching for a provider nearby.`
        );
      }

      res.status(201).json({
        success: true,
        data: { request: reqDoc, provider: nearestProvider || null },
      });
    } catch (err) {
      console.error('[requests] create error:', err);
      res.status(500).json({ success: false, message: 'Failed to create request' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/requests — request history for the logged-in user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const list = await Request.find({ user: req.user._id })
      .populate('provider', 'name category phone rating photoUrl')
      .populate('vehicle', 'plateNumber vehicleType make model')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: { requests: list } });
  } catch (err) {
    console.error('[requests] list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch request history' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/requests/:id — fetch a single request
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', requireAuth, [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid request ID' });

    const reqDoc = await Request.findOne({ _id: req.params.id, user: req.user._id })
      .populate('provider', 'name category phone rating photoUrl address currentLocation')
      .populate('vehicle', 'plateNumber vehicleType make model');

    if (!reqDoc) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, data: { request: reqDoc } });
  } catch (err) {
    console.error('[requests] get error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch request' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/status — update request status
// Validates that the transition is allowed before saving.
// ─────────────────────────────────────────────────────────────────────────────

// Valid status transitions
const ALLOWED_TRANSITIONS = {
  pending: ['searching', 'cancelled'],
  searching: ['assigned', 'cancelled'],
  requested: ['assigned', 'cancelled'],
  assigned: ['arriving', 'cancelled'],
  arriving: ['arrived', 'cancelled'],
  arrived: ['active'],
  active: ['completed'],
  completed: [],
  cancelled: [],
};

router.patch(
  '/:id/status',
  requireAuth,
  [
    param('id').isMongoId(),
    body('status').isIn(['searching', 'assigned', 'arriving', 'arrived', 'active', 'completed', 'cancelled']),
    body('cancelReason').optional().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });

      const reqDoc = await Request.findById(req.params.id);
      if (!reqDoc) return res.status(404).json({ success: false, message: 'Request not found' });

      // Authorization: only the owning user can cancel; only assigned provider can advance other statuses
      // For simplicity in this implementation, the user can cancel and update status.
      // Provider-side status changes are made by the same user who created the request
      // (full provider-role separation is a production enhancement).
      if (reqDoc.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this request' });
      }

      const newStatus = req.body.status;
      const allowed = ALLOWED_TRANSITIONS[reqDoc.status] || [];
      if (!allowed.includes(newStatus)) {
        return res.status(400).json({
          success: false,
          message: `Status transition from '${reqDoc.status}' to '${newStatus}' is not allowed`,
        });
      }

      reqDoc.status = newStatus;
      if (newStatus === 'completed') reqDoc.completedAt = new Date();
      if (newStatus === 'cancelled') {
        reqDoc.cancelledAt = new Date();
        reqDoc.cancelReason = req.body.cancelReason;
        // Free up the provider if one was assigned
        if (reqDoc.provider) {
          await Provider.findByIdAndUpdate(reqDoc.provider, { $set: { activeRequest: null } });
        }
      }
      await reqDoc.save();

      const io = req.app.get('io');
      io?.to(`user:${reqDoc.user}`).emit('request:update', { requestId: reqDoc._id, status: reqDoc.status });

      // Create notification for key status changes
      const notifMap = {
        arriving: { type: 'provider_arriving', title: 'Provider on the way', body: 'Your provider is heading to your location.' },
        arrived: { type: 'provider_arrived', title: 'Provider arrived', body: 'Your provider has reached your location.' },
        active: { type: 'service_started', title: 'Service started', body: 'Your roadside service has begun.' },
        completed: { type: 'request_completed', title: 'Service completed', body: 'Your request has been completed. Drive safe!' },
        cancelled: { type: 'request_cancelled', title: 'Request cancelled', body: 'Your request has been cancelled.' },
      };
      const notifData = notifMap[newStatus];
      if (notifData) {
        await pushNotification(io, reqDoc.user, reqDoc._id, notifData.type, notifData.title, notifData.body);
      }

      res.json({ success: true, data: { request: reqDoc } });
    } catch (err) {
      console.error('[requests] status update error:', err);
      res.status(500).json({ success: false, message: 'Failed to update status' });
    }
  }
);

module.exports = router;
