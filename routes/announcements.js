const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// POST /api/announcements — Create announcement
router.post('/', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const { title, message, priority, targetSubjectKey, targetGrade } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required.' });
    }

    // Teachers must specify a target class
    if (req.user.role === 'teacher') {
      if (!targetSubjectKey || !targetGrade) {
        return res.status(400).json({ success: false, message: 'Teachers must specify a target subject and grade.' });
      }
      // Verify teacher actually teaches this class
      const assignments = req.user.teacherProfile?.assignments || [];
      const match = assignments.find(
        (a) => a.subjectKey === targetSubjectKey && a.grades.includes(Number(targetGrade))
      );
      if (!match) {
        return res.status(403).json({ success: false, message: 'You do not teach this class.' });
      }
    }

    const announcement = await Announcement.create({
      authorId: req.user._id,
      authorName: req.user.displayName || `${req.user.firstName} ${req.user.lastName}`,
      authorRole: req.user.role,
      institutionId: req.user.institutionId || null,
      targetSubjectKey: targetSubjectKey || null,
      targetGrade: targetGrade ? Number(targetGrade) : null,
      title: title.trim(),
      message,
      priority: priority || 'medium',
    });

    res.status(201).json({ success: true, announcement });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ success: false, message: 'Failed to create announcement.' });
  }
});

// GET /api/announcements/feed — Student announcement feed
router.get('/feed', protect, async (req, res) => {
  try {
    const user = req.user;
    const conditions = [];

    if (user.institutionId) {
      // Institution student: see teacher announcements matching their institution + grade + subjects
      const studentSubjects = user.studentProfile?.subjects || [];
      const studentGrade = user.studentProfile?.grade;

      if (studentSubjects.length > 0 && studentGrade) {
        conditions.push({
          institutionId: user.institutionId,
          targetSubjectKey: { $in: studentSubjects },
          targetGrade: studentGrade,
        });
      }

      // Also see system-wide announcements (from admins with no institution scope)
      conditions.push({
        authorRole: { $in: ['admin'] },
        institutionId: null,
      });
    } else {
      // Independent student: only system-wide admin announcements
      conditions.push({
        authorRole: { $in: ['admin'] },
        institutionId: null,
      });
    }

    const announcements = await Announcement.find(
      conditions.length === 1 ? conditions[0] : { $or: conditions }
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, announcements });
  } catch (error) {
    console.error('Fetch feed error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch announcements.' });
  }
});

// GET /api/announcements/my — Teacher's own announcements
router.get('/my', protect, restrictTo('teacher', 'admin', 'hod', 'principal'), async (req, res) => {
  try {
    const announcements = await Announcement.find({ authorId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ success: true, announcements });
  } catch (error) {
    console.error('Fetch my announcements error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch announcements.' });
  }
});

// DELETE /api/announcements/:id — Delete own announcement
router.delete('/:id', protect, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    // Only the author can delete their own announcement
    if (announcement.authorId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own announcements.' });
    }

    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Announcement deleted.' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete announcement.' });
  }
});

module.exports = router;
