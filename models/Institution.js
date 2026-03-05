const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Institution name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Institution code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['high_school', 'college', 'university'],
      default: 'high_school',
    },
    province: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

institutionSchema.index({ isActive: 1 });

module.exports = mongoose.model('Institution', institutionSchema);
