const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const Review = require('../models/Review');
const Request = require('../models/Request');
const Provider = require('../models/Provider');

const router = express.Router();

/**
 * POST /api/reviews — submit a post-service review.
 * Rules:
 *  - Request must be in 'completed' status
 *  - Request must belong to the authenticated user
 *  - Request must have an assigned provider
 *  - One review per completed request (enforced by unique index on Review.request)
 */
router.post(
  '/',
  requireAuth,
  [
    body('requestId').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('text').optional().isString().isLength({ max: 1000 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', details: errors.array() });
      }

      const { requestId, rating, text } = req.body;
      const reqDoc = await Request.findOne({ _id: requestId, user: req.user._id, status: 'completed' });
      if (!reqDoc) {
        return res.status(404).json({ success: false, message: 'Completed request not found for this user' });
      }
      if (!reqDoc.provider) {
        return res.status(400).json({ success: false, message: 'Request has no assigned provider to review' });
      }

      const review = await Review.create({
        request: reqDoc._id,
        user: req.user._id,
        provider: reqDoc.provider,
        rating,
        text: text || '',
      });

      // Recompute provider's running average rating atomically
      const stats = await Review.aggregate([
        { $match: { provider: reqDoc.provider } },
        { $group: { _id: '$provider', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]);
      if (stats.length) {
        await Provider.findByIdAndUpdate(reqDoc.provider, {
          rating: Math.round(stats[0].avg * 10) / 10,
          reviewCount: stats[0].count,
        });
      }

      res.status(201).json({ success: true, data: { review } });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'This request has already been reviewed' });
      }
      console.error('[reviews] create error:', err);
      res.status(500).json({ success: false, message: 'Failed to submit review' });
    }
  }
);

/**
 * GET /api/reviews/provider/:providerId
 * Returns the last 20 reviews for a provider (public endpoint).
 */
router.get('/provider/:providerId', async (req, res) => {
  try {
    const reviews = await Review.find({ provider: req.params.providerId })
      .populate('user', 'name photoUrl')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, data: { reviews } });
  } catch (err) {
    console.error('[reviews] get provider reviews error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

module.exports = router;
