const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const token = generateToken(user._id);
  res.status(statusCode).json({
    success: true,
    message,
    token,
    user: user.toSafeObject(),
  });
};

// ── SIGNUP ────────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, grade, subjects, school, province, department } = req.body;

    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Please provide firstName, lastName, email, password, and role.' });
    }
    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be student or teacher.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (role === 'student' && !grade) {
      return res.status(400).json({ success: false, message: 'Students must provide a grade.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const userData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
      joinedVia: 'independent',
    };

    if (role === 'student') {
      userData.studentProfile = {
        grade: parseInt(grade, 10),
        subjects: subjects || [],
        school: school || null,
        province: province || null,
      };
    } else if (role === 'teacher') {
      userData.teacherProfile = { department: department || null, employeeId: null, assignments: [] };
    }

    const user = await User.create(userData);

    try {
      await sendVerificationEmail({ to: user.email, firstName: user.firstName, verificationToken });
    } catch (emailError) {
      console.error('⚠️  Email send failed:', emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Account created! Please check your email to verify your account, then sign in.',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join('. ') });
    }
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── SIGNIN ────────────────────────────────────────────────────────────────────
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account has been deactivated.' });
    }
    const isCorrect = await user.comparePassword(password);
    if (!isCorrect) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    sendTokenResponse(user, 200, res, 'Signed in successfully!');
  } catch (error) {
    console.error('Signin error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── VERIFY EMAIL ──────────────────────────────────────────────────────────────
router.get('/verify-email/:token', async (req, res) => {
  try {
    const user = await User.findOne({
      emailVerificationToken: req.params.token,
      emailVerificationExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Verification link is invalid or has expired.' });
    }
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save({ validateBeforeSave: false });
    return res.status(200).json({ success: true, message: '🎉 Email verified! You can now sign in.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── RESEND VERIFICATION ───────────────────────────────────────────────────────
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user || user.isEmailVerified) {
      return res.status(200).json({ success: true, message: 'If registered and unverified, a new link has been sent.' });
    }
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendVerificationEmail({ to: user.email, firstName: user.firstName, verificationToken });
    return res.status(200).json({ success: true, message: 'Verification email sent!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET CURRENT USER ──────────────────────────────────────────────────────────
router.get('/me', protect, (req, res) => {
  return res.status(200).json({ success: true, user: req.user.toSafeObject() });
});

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendPasswordResetEmail({ to: user.email, firstName: user.firstName, resetToken });
    return res.status(200).json({ success: true, message: 'Password reset email sent!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── RESET PASSWORD ────────────────────────────────────────────────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const user = await User.findOne({
      passwordResetToken: req.params.token,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.' });
    }
    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
    sendTokenResponse(user, 200, res, 'Password reset successfully!');
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── SIGNOUT ───────────────────────────────────────────────────────────────────
router.post('/signout', protect, (req, res) => {
  return res.status(200).json({ success: true, message: 'Signed out successfully.' });
});

module.exports = router;