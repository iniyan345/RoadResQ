const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema(
  {
    requestCode: { type: String, required: true, unique: true, index: true }, // e.g. RR-28451
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', index: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    issue: {
      type: String,
      required: true,
      enum: [
        'Flat Tyre', 'Engine Problem', 'Battery Dead', 'Fuel Empty', 'Accident',
        'Tow Truck', "Vehicle Won't Start", 'Smoke', 'Brake Failure', 'General Assistance',
      ],
    },
    contactName: { type: String, required: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
      label: { type: String },
    },
    status: {
      type: String,
      enum: [
        'pending',       // created, not yet matched
        'searching',     // actively looking for provider
        'requested',     // request sent to provider
        'assigned',      // provider accepted
        'arriving',      // provider is on the way
        'arrived',       // provider reached user
        'active',        // service in progress
        'completed',     // service done
        'cancelled',     // cancelled by user or provider
      ],
      default: 'pending',
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 500 },
    isAccident: { type: Boolean, default: false },
    // These flags record whether alerts were sent (not whether emergency services were actually dispatched)
    dispatchedAlerts: {
      police: { type: Boolean, default: false },
      ambulance: { type: Boolean, default: false },
      hospital: { type: Boolean, default: false },
    },
    etaMinutes: { type: Number },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
  },
  { timestamps: true }
);

requestSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Request', requestSchema);
