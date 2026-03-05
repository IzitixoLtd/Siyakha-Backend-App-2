require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const institutionRoutes = require('./routes/institutions');

const app = express();
const PORT = process.env.PORT || 5001;

// MIDDLEWARE
app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:19006', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// DATABASE
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// ROUTES
app.get('/', (_req, res) => {
  res.json({ success: true, message: '🎓 Siyakha API is running!' });
});

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/institutions', institutionRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found.` });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

// START
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Siyakha Backend running on http://localhost:${PORT}\n`);
    console.log('Available endpoints:');
    console.log('  POST  /api/auth/signup');
    console.log('  POST  /api/auth/signin');
    console.log('  GET   /api/auth/verify-email/:token');
    console.log('  POST  /api/auth/resend-verification');
    console.log('  GET   /api/auth/me');
    console.log('  POST  /api/auth/forgot-password');
    console.log('  POST  /api/auth/reset-password/:token');
    console.log('  GET   /api/institutions');
    console.log('  POST  /api/institutions/validate-code\n');
  });
});