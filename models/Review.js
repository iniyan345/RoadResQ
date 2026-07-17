const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, trim: true, maxlength: 1000 },
    imageUrls: [{ type: String }], // populated after upload to your cloud storage (S3/Cloudinary/etc.)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
