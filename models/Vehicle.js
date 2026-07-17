const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plateNumber: { type: String, required: true, trim: true, uppercase: true },
    vehicleType: {
      type: String,
      required: true,
      enum: ['car', 'bike', 'suv', 'truck', 'auto', 'other'],
    },
    make: { type: String, trim: true, maxlength: 50 },
    model: { type: String, trim: true, maxlength: 50 },
    year: { type: Number, min: 1980, max: new Date().getFullYear() + 1 },
    fuelType: {
      type: String,
      enum: ['petrol', 'diesel', 'electric', 'cng', 'hybrid'],
    },
    imageUrl: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

vehicleSchema.index({ user: 1, plateNumber: 1 }, { unique: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
