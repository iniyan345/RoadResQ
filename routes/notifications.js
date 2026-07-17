const express = require('express');
const { param, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();

/**
 * GET /api/notifications
 * Returns the authenticated user's notifications (latest 50, newest first).
 * Query params:
 *   ?unread=true  — only unread notifications
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.unread === 'true') filter.read = false;

    const notifications = await Notification.find(filter)
      .populate('request', 'requestCode status issue')
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });

    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (err) {
    console.error('[notifications] list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', requireAuth, [param('id').isMongoId()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });

    res.json({ success: true, data: { notification: notif } });
  } catch (err) {
    console.error('[notifications] mark-read error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark ALL of the user's notifications as read.
 */
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true, message: `${result.modifiedCount} notifications marked as read` });
  } catch (err) {
    console.error('[notifications] read-all error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark notifications as read' });
  }
});

module.exports = router;
