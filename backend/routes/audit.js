const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function buildAuditFilter(user, query = {}) {
  const filter = {};

  if (user.role !== 'admin') {
    filter.actorUsername = user.username;
  } else if (query.actorUsername) {
    filter.actorUsername = query.actorUsername;
  }

  if (query.action) filter.action = query.action;
  if (query.status) filter.status = query.status;
  if (query.entityType) filter.entityType = query.entityType;

  return filter;
}

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const logs = await AuditLog.find(buildAuditFilter(req.user, req.query))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const filter = buildAuditFilter(req.user, req.query);
    const [total, byAction, byStatus] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      total,
      byAction: byAction.map(item => ({ action: item._id, count: item.count })),
      byStatus: byStatus.map(item => ({ status: item._id, count: item.count })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
