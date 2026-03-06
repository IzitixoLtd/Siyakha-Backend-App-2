const express = require('express');
const router = express.Router();
const User = require('../models/User');
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

module.exports = router;
