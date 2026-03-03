/**
 * Dev utility: Reset a user's password directly in MongoDB.
 *
 * Usage:
 *   node scripts/reset-password.js <email> <newPassword>
 *
 * Example:
 *   node scripts/reset-password.js john@example.com MyNewPass123
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-password.js <email> <newPassword>');
  process.exit(1);
}
if (newPassword.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const users = db.collection('users');

    const user = await users.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      console.error(`No user found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.firstName} ${user.lastName} (${user.email}), role: ${user.role}`);

    const newHash = await bcrypt.hash(newPassword, 12);
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: newHash,
          isEmailVerified: true,  // also mark as verified
        },
      }
    );

    console.log(`Password reset successfully for ${user.email}`);
    console.log(`Email verification: marked as verified`);
    console.log(`\nYou can now sign in with:`);
    console.log(`  Email:    ${user.email}`);
    console.log(`  Password: ${newPassword}`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();
