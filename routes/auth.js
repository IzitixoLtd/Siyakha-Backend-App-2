const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Institution = require('../models/Institution');
const { protect } = require('../middleware/authMiddleware');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

// Short-lived access token (15 minutes)
const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// Long-lived refresh token (random string, stored in DB)
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

const sendTokenResponse = async (user, statusCode, res, message = 'Success') => {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  // Store refresh token in DB with 7-day expiry
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  res.status(statusCode).json({
    success: true,
    message,
    token: accessToken,
    refreshToken,
    user: user.toSafeObject(),
  });
};

// ── SIGNUP ────────────────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const {
      firstName, lastName, email, password, role,
      grade, subjects, school, province, department,
      institutionCode, assignments,
    } = req.body;

    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Please provide firstName, lastName, email, password, and role.' });
    }
    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be student or teacher.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    // Teachers MUST have an institution code
    if (role === 'teacher' && !institutionCode) {
      return res.status(400).json({ success: false, message: 'Teachers must sign up with an institution code.' });
    }
    if (role === 'teacher' && (!assignments || !Array.isArray(assignments) || assignments.length === 0)) {
      return res.status(400).json({ success: false, message: 'Teachers must select at least one subject and grade.' });
    }
    if (role === 'student' && !grade) {
      return res.status(400).json({ success: false, message: 'Students must provide a grade.' });
    }

    // Validate institution code if provided
    let institution = null;
    if (institutionCode) {
      institution = await Institution.findOne({
        code: institutionCode.toUpperCase().trim(),
        isActive: true,
      });
      if (!institution) {
        return res.status(400).json({ success: false, message: 'Invalid institution code. Please check and try again.' });
      }
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
      joinedVia: institution ? 'institution_code' : 'independent',
      institutionId: institution ? institution._id : null,
    };

    if (role === 'student') {
      userData.studentProfile = {
        grade: parseInt(grade, 10),
        subjects: subjects || [],
        school: institution ? institution.name : (school || null),
        province: institution ? institution.province : (province || null),
      };
    } else if (role === 'teacher') {
      userData.teacherProfile = {
        department: department || null,
        employeeId: null,
        assignments: assignments.map((a) => ({
          subjectKey: a.subjectKey,
          subjectLabel: a.subjectLabel,
          grades: a.grades,
        })),
      };
    }

    const user = await User.create(userData);

    try {
      await sendVerificationEmail({ to: user.email, firstName: user.firstName, verificationToken });
    } catch (emailError) {
      console.error('⚠️  Email send failed:', emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! You can now sign in.',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
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
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
    }
    const isCorrect = await user.comparePassword(password);
    if (!isCorrect) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    user.lastLoginAt = new Date();
    await sendTokenResponse(user, 200, res, 'Signed in successfully!');
  } catch (error) {
    console.error('Signin error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── REFRESH TOKEN ─────────────────────────────────────────────────────────────
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required.' });
    }
    const user = await User.findOne({
      refreshToken,
      refreshTokenExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please sign in again.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated.' });
    }

    // Rotate: issue new access token + new refresh token
    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken();
    user.refreshToken = newRefreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: 'Token refreshed.',
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
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
    return res.status(200).json({ success: true, message: 'Email verified! You can now sign in.' });
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

// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
router.patch('/me', protect, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber } = req.body;
    const user = req.user;

    if (firstName !== undefined) {
      if (!firstName.trim()) return res.status(400).json({ success: false, message: 'First name cannot be empty.' });
      user.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (!lastName.trim()) return res.status(400).json({ success: false, message: 'Last name cannot be empty.' });
      user.lastName = lastName.trim();
    }
    if (phoneNumber !== undefined) {
      user.phoneNumber = phoneNumber.trim() || null;
    }

    await user.save({ validateBeforeSave: false });
    return res.status(200).json({ success: true, message: 'Profile updated successfully.', user: user.toSafeObject() });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetOTP = Math.floor(100000 + Math.random() * 900000).toString();
    user.passwordResetToken = resetToken;
    user.passwordResetOTP = resetOTP;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });
    await sendPasswordResetEmail({ to: user.email, firstName: user.firstName, resetToken, resetOTP });
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
    user.passwordResetOTP = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
    await sendTokenResponse(user, 200, res, 'Password reset successfully!');
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── RESET PASSWORD VIA OTP ────────────────────────────────────────────────────
router.post('/reset-password-otp', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide email, OTP, and new password.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      passwordResetOTP: otp,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code. Please request a new one.' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.passwordResetToken = null;
    user.passwordResetOTP = null;
    user.passwordResetExpires = null;
    await user.save({ validateBeforeSave: false });
    await sendTokenResponse(user, 200, res, 'Password reset successfully!');
  } catch (error) {
    console.error('Reset password OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── SIGNOUT ───────────────────────────────────────────────────────────────────
router.post('/signout', protect, async (req, res) => {
  try {
    // Invalidate refresh token
    req.user.refreshToken = null;
    req.user.refreshTokenExpires = null;
    await req.user.save({ validateBeforeSave: false });
    return res.status(200).json({ success: true, message: 'Signed out successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
