const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // AUTHENTICATION
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
    },
    phoneNumber: { type: String, default: null },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: null },
    emailVerificationExpires: { type: Date, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetOTP: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    refreshToken: { type: String, default: null },
    refreshTokenExpires: { type: Date, default: null },

    // PROFILE
    firstName: { type: String, required: [true, 'First name is required'], trim: true },
    lastName: { type: String, required: [true, 'Last name is required'], trim: true },
    displayName: { type: String, trim: true },
    avatarUrl: { type: String, default: null },

    // ROLE
    role: {
      type: String,
      enum: ['student', 'teacher', 'admin', 'hod', 'principal', 'secretary'],
      required: [true, 'Role is required'],
    },

    // INSTITUTION
    institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
    joinedVia: {
      type: String,
      enum: ['institution_code', 'independent', 'invitation'],
      default: 'independent',
    },

    // STUDENT PROFILE
    studentProfile: {
      grade: { type: Number, enum: [10, 11, 12], default: null },
      subjects: { type: [String], default: [] },
      school: { type: String, default: null },
      province: { type: String, default: null },
    },

    // TEACHER PROFILE
    teacherProfile: {
      assignments: [{ subjectKey: String, subjectLabel: String, grades: [Number] }],
      employeeId: { type: String, default: null },
      department: { type: String, default: null },
    },

    // ADMIN PROFILE
    adminProfile: {
      permissions: [{
        type: String,
        enum: [
          'manage_teachers',
          'manage_students',
          'manage_resources',
          'view_analytics',
          'post_announcements',
          'manage_institution',
        ],
      }],
      departmentSubjects: { type: [String], default: [] },
    },

    // PREFERENCES
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      notifications: {
        announcements: { type: Boolean, default: true },
        quizReminders: { type: Boolean, default: true },
        newResources: { type: Boolean, default: true },
      },
      language: { type: String, default: 'en' },
    },

    // MISC
    lastSyncedAt: { type: Date, default: null },
    deviceTokens: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phoneNumber: 1 }, { sparse: true });
userSchema.index({ institutionId: 1, role: 1 });
userSchema.index({ institutionId: 1, 'studentProfile.grade': 1 });
userSchema.index({ 'teacherProfile.assignments.subjectKey': 1 });

// Auto-compute displayName before saving
userSchema.pre('save', function (next) {
  if (this.firstName && this.lastName) {
    this.displayName = `${this.firstName} ${this.lastName.charAt(0)}.`;
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Return safe user object (no sensitive fields)
userSchema.methods.toSafeObject = function () {
  const obj = {
    id: this._id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    displayName: this.displayName,
    avatarUrl: this.avatarUrl,
    role: this.role,
    isEmailVerified: this.isEmailVerified,
    institutionId: this.institutionId,
    joinedVia: this.joinedVia,
    preferences: this.preferences,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
  if (this.role === 'student') obj.studentProfile = this.studentProfile;
  if (this.role === 'teacher') {
    obj.teacherProfile = this.teacherProfile;
    // Compute flat classes array for the frontend from assignments
    const classes = [];
    if (this.teacherProfile && Array.isArray(this.teacherProfile.assignments)) {
      for (const assignment of this.teacherProfile.assignments) {
        for (const grade of assignment.grades) {
          classes.push({
            id: `${assignment.subjectKey}_${grade}`,
            subject: assignment.subjectLabel,
            grade: `Grade ${grade}`,
            displayName: `Grade ${grade} ${assignment.subjectLabel}`,
          });
        }
      }
    }
    obj.classes = classes;
  }
  if (['admin', 'hod', 'principal'].includes(this.role)) obj.adminProfile = this.adminProfile;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
