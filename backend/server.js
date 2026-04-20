require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const authRoutes    = require('./routes/auth');
const auditRoutes   = require('./routes/audit');
const reportRoutes  = require('./routes/reports');
const studentRoutes = require('./routes/students');
const aiRoutes      = require('./routes/Airoutes');
const alertRoutes   = require('./routes/alerts');
const importRoutes  = require('./routes/import');
const { startScheduleCron } = require('./scheduleCron');

const app = express();
app.set('trust proxy', 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 25 : 250,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.path === '/api/health',
  message: { message: 'Too many API requests. Please slow down and try again later.' },
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Restrict CORS to the configured frontend origin (never use '*' in production)
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS blocked"));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use('/api', apiLimiter);

// Refuse to boot with a predictable JWT configuration.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in the environment');
}

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    startScheduleCron();   // start after DB is ready
  })
  .catch(err => console.error('❌ MongoDB Error:', err));

app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/audit',    auditRoutes);
app.use('/api/reports',  reportRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/ai',       aiRoutes);
app.use('/api/alerts',   alertRoutes);
app.use('/api/import',   importRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'DEO Reports API Running' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));