const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, enum: ['teacher', 'admin', 'hod', 'principal'], required: true },
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
    targetSubjectKey: { type: String, default: null },
    targetGrade: { type: Number, default: null },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  },
  { timestamps: true }
);

// Indexes for efficient querying
announcementSchema.index({ institutionId: 1, targetSubjectKey: 1, targetGrade: 1, createdAt: -1 });
announcementSchema.index({ authorId: 1, createdAt: -1 });
announcementSchema.index({ authorRole: 1, institutionId: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
