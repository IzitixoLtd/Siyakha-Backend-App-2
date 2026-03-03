const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const sendVerificationEmail = async ({ to, firstName, verificationToken }) => {
  // Dev mode — skip real email, just log the token
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-gmail@gmail.com') {
    console.log('\n📧 [DEV MODE] Email verification — no email sent');
    console.log(`   Token for ${to}: ${verificationToken}`);
    console.log(`   Verify URL: ${process.env.API_BASE_URL}/api/auth/verify-email/${verificationToken}\n`);
    return { skipped: true };
  }

  const verificationUrl = `${process.env.API_BASE_URL}/api/auth/verify-email/${verificationToken}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '✅ Verify your Siyakha account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0c3352; padding: 30px; text-align: center;">
          <h1 style="color: #fff; margin: 0;">Siyakha</h1>
          <p style="color: #a4c2db; margin: 8px 0 0;">Empowering Education</p>
        </div>
        <div style="padding: 30px; background: #fff;">
          <h2 style="color: #0c3352;">Hi ${firstName}! 👋</h2>
          <p style="color: #444; line-height: 1.6;">
            Welcome to Siyakha! Please verify your email address to get started.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}"
               style="background: #0075b2; color: #fff; padding: 14px 32px; border-radius: 8px;
                      text-decoration: none; font-size: 16px; font-weight: bold; display: inline-block;">
              ✅ Verify My Email
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">
            This link expires in 24 hours. If you didn't sign up, ignore this email.
          </p>
        </div>
        <div style="background: #f9f9f9; padding: 16px; text-align: center;">
          <p style="color: #aaa; font-size: 12px; margin: 0;">Made with ❤️ by the Siyakha Team</p>
        </div>
      </div>
    `,
  });
  return { sent: true };
};

const sendPasswordResetEmail = async ({ to, firstName, resetToken, resetOTP }) => {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your-gmail@gmail.com') {
    console.log('\n📧 [DEV MODE] Password reset — no email sent');
    console.log(`   Reset token for ${to}: ${resetToken}`);
    console.log(`   Reset OTP for ${to}: ${resetOTP}\n`);
    return { skipped: true };
  }

  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '🔑 Reset your Siyakha password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0c3352; padding: 30px; text-align: center;">
          <h1 style="color: #fff; margin: 0;">Siyakha</h1>
          <p style="color: #a4c2db; margin: 8px 0 0;">Password Reset</p>
        </div>
        <div style="padding: 30px; background: #fff;">
          <h2 style="color: #0c3352;">Hi ${firstName}!</h2>
          <p style="color: #444; line-height: 1.6;">
            We received a request to reset your password. Use the code below in the app:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background: #f5f5f5; border: 2px dashed #0075b2; border-radius: 12px;
                        padding: 20px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; color: #0c3352; letter-spacing: 8px;">
                ${resetOTP}
              </span>
            </div>
          </div>
          <p style="color: #444; line-height: 1.6;">
            Or click the button below to reset via the web:
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetUrl}" style="background: #bd850c; color: #fff; padding: 14px 32px;
               border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;
               display: inline-block;">
              Reset My Password
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">
            This code and link expire in 1 hour. If you didn't request this, ignore this email.
          </p>
        </div>
        <div style="background: #f9f9f9; padding: 16px; text-align: center;">
          <p style="color: #aaa; font-size: 12px; margin: 0;">Made with ❤️ by the Siyakha Team</p>
        </div>
      </div>
    `,
  });
  return { sent: true };
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };