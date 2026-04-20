const AuditLog = require('../models/AuditLog');

function extractIp(req) {
  if (!req) return '';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

async function logAudit({
  req,
  user,
  action,
  status = 'success',
  entityType = '',
  entityId = '',
  message = '',
  metadata = {},
  actor = {},
}) {
  try {
    await AuditLog.create({
      actorId: user?._id?.toString?.() || actor.id || '',
      actorUsername: user?.username || actor.username || '',
      actorName: user?.name || actor.name || '',
      actorRole: user?.role || actor.role || '',
      department: user?.department || actor.department || '',
      action,
      entityType,
      entityId: entityId ? String(entityId) : '',
      status,
      message,
      metadata,
      ipAddress: extractIp(req) || actor.ipAddress || '',
      userAgent: req?.headers?.['user-agent'] || actor.userAgent || '',
    });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAudit };
