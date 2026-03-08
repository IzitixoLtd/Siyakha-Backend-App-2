const express = require('express');
const router = express.Router();
const User = require('../models/User');
const QuizResult = require('../models/QuizResult');
const TeacherNotification = require('../models/TeacherNotification');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// POST /api/quiz/submit
// Student submits a completed quiz
router.post('/submit', protect, restrictTo('student'), async (req, res) => {
  try {
    const {
      grade,
      subjectKey,
      subjectLabel,
      quizTitle,
      totalQuestions,
      correctAnswers,
      score,
      timeTakenSeconds,
      questions,
    } = req.body;

    const student = req.user;

    // Basic validation
    if (!grade || !subjectKey || !subjectLabel || !quizTitle || totalQuestions == null || correctAnswers == null || score == null) {
      return res.status(400).json({ success: false, message: 'Missing required quiz fields.' });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'questions array is required and must not be empty.' });
    }

    // Save quiz result
    const quizResult = await QuizResult.create({
      studentId: student._id,
      institutionId: student.institutionId || null,
      grade,
      subjectKey,
      subjectLabel,
      quizTitle,
      totalQuestions,
      correctAnswers,
      score,
      timeTakenSeconds: timeTakenSeconds || null,
      questions,
      completedAt: new Date(),
    });

    // Notify all teachers at the same institution who teach this subject + grade
    if (student.institutionId) {
      const teachers = await User.find({
        role: 'teacher',
        institutionId: student.institutionId,
        isActive: true,
        'teacherProfile.assignments': {
          $elemMatch: {
            subjectKey,
            grades: grade,
          },
        },
      }).select('_id');

      if (teachers.length > 0) {
        const notifications = teachers.map((teacher) => ({
          teacherId: teacher._id,
          type: 'quiz_completed',
          studentId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          subjectKey,
          subjectLabel,
          grade,
          quizTitle,
          score,
          quizResultId: quizResult._id,
        }));

        await TeacherNotification.insertMany(notifications);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Quiz submitted successfully.',
      result: {
        id: quizResult._id,
        score: quizResult.score,
        correctAnswers: quizResult.correctAnswers,
        totalQuestions: quizResult.totalQuestions,
        completedAt: quizResult.completedAt,
      },
    });
  } catch (error) {
    console.error('Quiz submit error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/quiz/my-results
// Student gets their quiz history (summary list)
router.get('/my-results', protect, restrictTo('student'), async (req, res) => {
  try {
    const { subjectKey, grade, limit = 20, page = 1 } = req.query;

    const filter = { studentId: req.user._id };
    if (subjectKey) filter.subjectKey = subjectKey;
    if (grade) filter.grade = parseInt(grade, 10);

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [results, total] = await Promise.all([
      QuizResult.find(filter)
        .select('-questions')
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      QuizResult.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      results: results.map((r) => ({
        id: r._id,
        subjectKey: r.subjectKey,
        subjectLabel: r.subjectLabel,
        grade: r.grade,
        quizTitle: r.quizTitle,
        score: r.score,
        correctAnswers: r.correctAnswers,
        totalQuestions: r.totalQuestions,
        timeTakenSeconds: r.timeTakenSeconds,
        completedAt: r.completedAt,
      })),
    });
  } catch (error) {
    console.error('Get my results error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/quiz/result/:id
// Student gets full details of a specific quiz result (including wrong answers)
router.get('/result/:id', protect, async (req, res) => {
  try {
    const result = await QuizResult.findById(req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, message: 'Quiz result not found.' });
    }

    // Students can only view their own results; teachers/admins can view any
    const isStudent = req.user.role === 'student';
    if (isStudent && result.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const wrongAnswers = result.questions.filter((q) => !q.isCorrect);
    const correctAnswers = result.questions.filter((q) => q.isCorrect);

    return res.status(200).json({
      success: true,
      result: {
        id: result._id,
        subjectKey: result.subjectKey,
        subjectLabel: result.subjectLabel,
        grade: result.grade,
        quizTitle: result.quizTitle,
        score: result.score,
        correctAnswers: result.correctAnswers,
        totalQuestions: result.totalQuestions,
        timeTakenSeconds: result.timeTakenSeconds,
        completedAt: result.completedAt,
        questions: result.questions,
        wrongAnswers,
        correctCount: correctAnswers.length,
        wrongCount: wrongAnswers.length,
      },
    });
  } catch (error) {
    console.error('Get quiz result error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
