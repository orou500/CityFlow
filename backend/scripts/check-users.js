import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const total = await User.countDocuments();
  const withCompany = await User.countDocuments({ companyId: { $ne: null } });
  const withoutCompany = await User.countDocuments({ companyId: null });
  const allUsers = await User.find().select('username email companyId banned').lean();
  console.log(`Total users: ${total}`);
  console.log(`With companyId: ${withCompany}`);
  console.log(`Without companyId: ${withoutCompany}`);
  console.log('\nAll users:');
  for (const u of allUsers) {
    console.log(`  ${u.username} (${u.email}) companyId: ${u.companyId} banned: ${u.banned}`);
  }
  await mongoose.disconnect();
}

main().catch(console.error);
