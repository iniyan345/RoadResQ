const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
    type: {
      type: String,
      required: true,
      enum: [
        'request_created',
        'provider_assigned',
        'provider_arriving',
        'provider_arrived',
        'service_started',
        'request_completed',
        'request_cancelled',
        'sos_activated',
        'new_message',
        'review_received',
      ],
      index: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    channels: {
      push: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
    },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
