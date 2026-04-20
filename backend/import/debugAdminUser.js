require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';

async function main() {
  await mongoose.connect(MONGO_URI);

  const admin = await User.findOne({ username: 'admin' });
  console.log('ADMIN_EXISTS', !!admin);

  if (admin) {
    console.log('ADMIN_ROLE', admin.role);
    console.log('ADMIN_DEPARTMENT', admin.department);
    console.log('ADMIN_ACTIVE', admin.isActive);
    console.log('ADMIN_EMAIL', admin.email);
    console.log('ADMIN_PASSWORD_OK', await admin.comparePassword('Welcome@123'));
  }

  const sample = await User.find({}, 'username role department isActive')
    .sort({ username: 1 })
    .limit(15)
    .lean();
  console.log(JSON.stringify(sample, null, 2));

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
