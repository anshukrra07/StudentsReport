require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes    = require('./routes/auth');
const reportRoutes  = require('./routes/reports');
const studentRoutes = require('./routes/students');
const aiRoutes      = require('./routes/Airoutes');
const { startScheduleCron } = require('./scheduleCron');

const app = express();

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

// Warn loudly if JWT_SECRET is not set in environment
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET not set in .env — using insecure default. Set it before deploying!');
}

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    startScheduleCron();   // start after DB is ready
  })
  .catch(err => console.error('❌ MongoDB Error:', err));

app.use('/api/auth',     authRoutes);
app.use('/api/reports',  reportRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/ai',       aiRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'DEO Reports API Running' }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));