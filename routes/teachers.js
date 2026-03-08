const express = require('express');
const router = express.Router();
const User = require('../models/User');
const QuizResult = require('../models/QuizResult');
const TeacherNotification = require('../models/TeacherNotification');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// GET /api/teachers/class-students?subjectKey=mathematics&grade=12
// Returns students at the same institution matching grade + subject
router.get('/class-students', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const { subjectKey, grade } = req.query;

    if (!subjectKey || !grade) {
      return res.status(400).json({ success: false, message: 'subjectKey and grade are required.' });
    }

    const teacher = req.user;
    if (!teacher.institutionId) {
      return res.status(400).json({ success: false, message: 'You are not linked to an institution.' });
    }

    const gradeNum = parseInt(grade, 10);
    if (![10, 11, 12].includes(gradeNum)) {
      return res.status(400).json({ success: false, message: 'Grade must be 10, 11, or 12.' });
    }

    // Find students at the same institution, same grade, who have this subject
    const students = await User.find({
      role: 'student',
      institutionId: teacher.institutionId,
      'studentProfile.grade': gradeNum,
      'studentProfile.subjects': subjectKey,
      isActive: true,
    })
      .select('firstName lastName displayName email studentProfile.grade studentProfile.subjects createdAt lastLoginAt')
      .sort({ lastName: 1, firstName: 1 });

    return res.status(200).json({
      success: true,
      students: students.map((s) => ({
        id: s._id,
        name: `${s.firstName} ${s.lastName}`,
        displayName: s.displayName,
        email: s.email,
        grade: s.studentProfile?.grade,
        subjects: s.studentProfile?.subjects || [],
        lastActive: s.lastLoginAt || s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get class students error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/teachers/class-summary
// Returns student count per class for the teacher (used for stats on dashboard)
router.get('/class-summary', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const teacher = req.user;
    if (!teacher.institutionId) {
      return res.status(200).json({ success: true, classes: [] });
    }

    const assignments = teacher.teacherProfile?.assignments || [];
    const classSummaries = [];

    for (const assignment of assignments) {
      for (const grade of assignment.grades) {
        const count = await User.countDocuments({
          role: 'student',
          institutionId: teacher.institutionId,
          'studentProfile.grade': grade,
          'studentProfile.subjects': assignment.subjectKey,
          isActive: true,
        });

        classSummaries.push({
          classId: `${assignment.subjectKey}_${grade}`,
          subjectKey: assignment.subjectKey,
          subjectLabel: assignment.subjectLabel,
          grade,
          studentCount: count,
        });
      }
    }

    return res.status(200).json({ success: true, classes: classSummaries });
  } catch (error) {
    console.error('Get class summary error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/teachers/notifications
// Returns quiz completion notifications for the logged-in teacher
router.get('/notifications', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const { unreadOnly, limit = 30, page = 1 } = req.query;

    const filter = { teacherId: req.user._id };
    if (unreadOnly === 'true') filter.isRead = false;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [notifications, total, unreadCount] = await Promise.all([
      TeacherNotification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      TeacherNotification.countDocuments(filter),
      TeacherNotification.countDocuments({ teacherId: req.user._id, isRead: false }),
    ]);

    return res.status(200).json({
      success: true,
      total,
      unreadCount,
      page: parseInt(page, 10),
      notifications: notifications.map((n) => ({
        id: n._id,
        type: n.type,
        studentId: n.studentId,
        studentName: n.studentName,
        subjectKey: n.subjectKey,
        subjectLabel: n.subjectLabel,
        grade: n.grade,
        quizTitle: n.quizTitle,
        score: n.score,
        quizResultId: n.quizResultId,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/teachers/notifications/:id/read
// Mark a single notification as read
router.patch('/notifications/:id/read', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const notification = await TeacherNotification.findOneAndUpdate(
      { _id: req.params.id, teacherId: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/teachers/notifications/read-all
// Mark all notifications as read for this teacher
router.patch('/notifications/read-all', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    await TeacherNotification.updateMany(
      { teacherId: req.user._id, isRead: false },
      { isRead: true }
    );

    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/teachers/student-performance/:studentId
// Returns a student's quiz history (for teacher view under "View Students")
router.get('/student-performance/:studentId', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const teacher = req.user;
    const { studentId } = req.params;
    const { subjectKey, grade } = req.query;

    // Verify the student exists and belongs to the same institution
    const student = await User.findOne({
      _id: studentId,
      role: 'student',
      institutionId: teacher.institutionId,
      isActive: true,
    }).select('firstName lastName displayName email studentProfile');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found in your institution.' });
    }

    const filter = { studentId };
    if (subjectKey) filter.subjectKey = subjectKey;
    if (grade) filter.grade = parseInt(grade, 10);

    const results = await QuizResult.find(filter)
      .select('-questions')
      .sort({ completedAt: -1 })
      .limit(50);

    // Compute per-subject averages
    const subjectMap = {};
    for (const r of results) {
      if (!subjectMap[r.subjectKey]) {
        subjectMap[r.subjectKey] = { subjectKey: r.subjectKey, subjectLabel: r.subjectLabel, grade: r.grade, scores: [], count: 0 };
      }
      subjectMap[r.subjectKey].scores.push(r.score);
      subjectMap[r.subjectKey].count += 1;
    }

    const subjectSummary = Object.values(subjectMap).map((s) => ({
      subjectKey: s.subjectKey,
      subjectLabel: s.subjectLabel,
      grade: s.grade,
      quizzesTaken: s.count,
      averageScore: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length),
      bestScore: Math.max(...s.scores),
    }));

    return res.status(200).json({
      success: true,
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        displayName: student.displayName,
        email: student.email,
        grade: student.studentProfile?.grade,
        subjects: student.studentProfile?.subjects || [],
      },
      subjectSummary,
      quizHistory: results.map((r) => ({
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
    console.error('Get student performance error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/teachers/quiz-analytics?subjectKey=mathematics&grade=12
// Real-time quiz analytics for a specific subject + grade (aligned to teacher's class)
router.get('/quiz-analytics', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const { subjectKey, grade } = req.query;
    const teacher = req.user;

    if (!subjectKey || !grade) {
      return res.status(400).json({ success: false, message: 'subjectKey and grade are required.' });
    }

    const gradeNum = parseInt(grade, 10);

    if (!teacher.institutionId) {
      return res.status(400).json({ success: false, message: 'You are not linked to an institution.' });
    }

    // Get all students in this class
    const students = await User.find({
      role: 'student',
      institutionId: teacher.institutionId,
      'studentProfile.grade': gradeNum,
      'studentProfile.subjects': subjectKey,
      isActive: true,
    }).select('_id firstName lastName displayName');

    const studentIds = students.map((s) => s._id);
    const totalStudents = studentIds.length;

    if (totalStudents === 0) {
      return res.status(200).json({
        success: true,
        subjectKey,
        grade: gradeNum,
        totalStudents: 0,
        studentsAttempted: 0,
        analytics: null,
      });
    }

    // Get all quiz results for this subject + grade within this institution
    const results = await QuizResult.find({
      institutionId: teacher.institutionId,
      subjectKey,
      grade: gradeNum,
    }).sort({ completedAt: -1 });

    const studentsAttempted = new Set(results.map((r) => r.studentId.toString())).size;
    const totalAttempts = results.length;

    if (totalAttempts === 0) {
      return res.status(200).json({
        success: true,
        subjectKey,
        grade: gradeNum,
        totalStudents,
        studentsAttempted: 0,
        analytics: null,
      });
    }

    const scores = results.map((r) => r.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    // Score distribution buckets
    const distribution = { '0-49': 0, '50-59': 0, '60-69': 0, '70-79': 0, '80-89': 0, '90-100': 0 };
    for (const score of scores) {
      if (score < 50) distribution['0-49']++;
      else if (score < 60) distribution['50-59']++;
      else if (score < 70) distribution['60-69']++;
      else if (score < 80) distribution['70-79']++;
      else if (score < 90) distribution['80-89']++;
      else distribution['90-100']++;
    }

    // Per-student latest score summary
    const studentLatestMap = {};
    for (const r of results) {
      const sid = r.studentId.toString();
      if (!studentLatestMap[sid]) {
        studentLatestMap[sid] = { score: r.score, quizTitle: r.quizTitle, completedAt: r.completedAt };
      }
    }

    const studentBreakdown = students.map((s) => {
      const latest = studentLatestMap[s._id.toString()];
      return {
        studentId: s._id,
        name: `${s.firstName} ${s.lastName}`,
        displayName: s.displayName,
        attempted: !!latest,
        latestScore: latest ? latest.score : null,
        latestQuizTitle: latest ? latest.quizTitle : null,
        lastAttemptAt: latest ? latest.completedAt : null,
      };
    });

    return res.status(200).json({
      success: true,
      subjectKey,
      subjectLabel: results[0]?.subjectLabel || subjectKey,
      grade: gradeNum,
      totalStudents,
      studentsAttempted,
      totalAttempts,
      analytics: {
        averageScore: avgScore,
        highestScore,
        lowestScore,
        passRate: Math.round((scores.filter((s) => s >= 50).length / scores.length) * 100),
        distribution,
      },
      studentBreakdown,
    });
  } catch (error) {
    console.error('Get quiz analytics error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
