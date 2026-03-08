const mongoose = require('mongoose');

const questionResultSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    options: { type: [String], default: [] },
    selectedAnswer: { type: String, default: null },
    correctAnswer: { type: String, required: true },
    isCorrect: { type: Boolean, required: true },
  },
  { _id: false }
);

const quizResultSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
    grade: { type: Number, enum: [10, 11, 12], required: true },
    subjectKey: { type: String, required: true },
    subjectLabel: { type: String, required: true },
    quizTitle: { type: String, required: true, trim: true },
    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    score: { type: Number, required: true }, // percentage 0-100
    timeTakenSeconds: { type: Number, default: null },
    questions: { type: [questionResultSchema], default: [] },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

quizResultSchema.index({ studentId: 1, completedAt: -1 });
quizResultSchema.index({ studentId: 1, subjectKey: 1, grade: 1 });
quizResultSchema.index({ institutionId: 1, subjectKey: 1, grade: 1, completedAt: -1 });

module.exports = mongoose.model('QuizResult', quizResultSchema);
