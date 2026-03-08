const mongoose = require('mongoose');

const teacherNotificationSchema = new mongoose.Schema(
  {
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['quiz_completed'],
      required: true,
    },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentName: { type: String, required: true },
    subjectKey: { type: String, required: true },
    subjectLabel: { type: String, required: true },
    grade: { type: Number, required: true },
    quizTitle: { type: String, required: true },
    score: { type: Number, required: true }, // percentage
    quizResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuizResult', required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

teacherNotificationSchema.index({ teacherId: 1, isRead: 1, createdAt: -1 });
teacherNotificationSchema.index({ teacherId: 1, createdAt: -1 });

module.exports = mongoose.model('TeacherNotification', teacherNotificationSchema);
