const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema(
  {
    // The RoadResQ user account that owns this provider profile (optional for seed data)
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    name: { type: String, required: true, trim: true },
    businessName: { type: String, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['mechanic', 'puncture', 'towing', 'fuel', 'hospital', 'battery', 'police', 'general'],
      index: true,
    },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, trim: true },
    photoUrl: { type: String },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, default: 0 },
    open: { type: Boolean, default: true, index: true },
    // GeoJSON point for $near queries — [longitude, latitude]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    // The provider's live streaming location (updated via Socket.IO)
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number] },
    },
    serviceRadius: { type: Number, default: 15 }, // km
    verified: { type: Boolean, default: false },
    // The request this provider is currently handling (null if free)
    activeRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', default: null },
  },
  { timestamps: true }
);

providerSchema.index({ location: '2dsphere' });
providerSchema.index({ category: 1, open: 1 });

module.exports = mongoose.model('Provider', providerSchema);
