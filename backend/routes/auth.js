const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const { logAudit } = require('../lib/auditLogger');

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      await logAudit({
        req,
        actor: { username: username || '', role: 'anonymous' },
        action: 'auth.login',
        status: 'failure',
        entityType: 'auth',
        message: 'Login rejected because username or password was missing.',
        metadata: { attemptedUsername: username || '' },
      });
      return res.status(400).json({ message: 'Username and password required' });
    }

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      await logAudit({
        req,
        actor: { username, role: 'anonymous' },
        action: 'auth.login',
        status: 'failure',
        entityType: 'user',
        message: 'Login failed because the username was not found or inactive.',
        metadata: { attemptedUsername: username },
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logAudit({
        req,
        user,
        action: 'auth.login',
        status: 'failure',
        entityType: 'user',
        entityId: user._id,
        message: 'Login failed because the password was invalid.',
        metadata: { attemptedUsername: username },
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

    await logAudit({
      req,
      user,
      action: 'auth.login',
      status: 'success',
      entityType: 'user',
      entityId: user._id,
      message: 'User logged in successfully.',
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        department: user.department,
        email: user.email
      }
    });
  } catch (err) {
    await logAudit({
      req,
      actor: { username: req.body?.username || '', role: 'anonymous' },
      action: 'auth.login',
      status: 'failure',
      entityType: 'auth',
      message: `Login failed with server error: ${err.message}`,
      metadata: { attemptedUsername: req.body?.username || '' },
    });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  res.json(req.user);
});

// Get all users (admin only)
router.get('/users', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
