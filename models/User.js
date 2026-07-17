const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, unique: true, sparse: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
      index: true,
    },
    // Only populated for legacy/email-password accounts created outside Firebase.
    // Firebase-authenticated users never store a password here.
    passwordHash: { type: String, select: false },
    phone: { type: String, trim: true },
    photoUrl: { type: String },
    role: {
      type: String,
      enum: ['user', 'provider', 'admin'],
      default: 'user',
      index: true,
    },
    authProvider: { type: String, enum: ['firebase', 'google', 'legacy'], default: 'firebase' },
    savedProviders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Provider' }],
    lastLoginAt: { type: Date },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
