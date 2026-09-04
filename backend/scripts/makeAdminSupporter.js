import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import User from '../src/models/User.js';

/**
 * One-off admin support script: marks every User.role === 'admin' as a
 * founding_supporter so they can use full supporter cosmetics in the app.
 * Run: npm run admin-support:users  (or: node scripts/makeAdminSupporter.js)
 */
async function run() {
  await mongoose.connect(config.mongodbUri);

  const today = new Date();
  const admins = await User.find({ role: 'admin' });

  if (!admins.length) {
    console.log('No admin users found (role === \'admin\'). Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  for (const admin of admins) {
    admin.supporter = {
      badge: 'founding_supporter',
      title: 'Founder Supporter',
      isAnonymous: false,
    };
    admin.donationStats = {
      totalDonated: 100,
      donorSince: admin.donationStats?.donorSince || today,
      donationCount: admin.donationStats?.donationCount || 1,
    };
    // Ensure the cosmetics subdoc exists so the UI can render the badge/frame.
    if (!admin.cosmetics) {
      admin.cosmetics = {};
    }
    await admin.save();
    console.log(`Updated admin ${admin.username} (${admin._id}) -> founding_supporter`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
