import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import '../src/config/index.js';
import User from '../src/models/User.js';
import RealEstateCompany from '../src/models/RealEstateCompany.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const company = await RealEstateCompany.findOne({ name: 'SizEx LTD' });
  if (!company) {
    console.error('Company "SizEx LTD" not found');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Found company: ${company.name} (founder: ${company.founderId})`);

  const existingIds = new Set(company.members.map((m) => m.userId.toString()));
  console.log(`Existing members: ${company.members.length}`);

  const needed = 5 - company.members.length;

  if (needed <= 0) {
    console.log(`Already have ${company.members.length} members, no more needed.`);
    await mongoose.disconnect();
    return;
  }

  const usersWithoutCompany = await User.find({
    _id: { $nin: [...existingIds].map((id) => new mongoose.Types.ObjectId(id)) },
  }).limit(needed);

  const toAdd = [];

  for (const user of usersWithoutCompany) {
    toAdd.push(user);
  }

  const toCreate = needed - toAdd.length;
  for (let i = 0; i < toCreate; i++) {
    const idx = i + 1;
    const username = `SizExMember${idx}`;
    const email = `sizexmember${idx}@cityflow.ai`;
    const password = await bcrypt.hash('member12345', 10);
    const user = await User.create({
      username,
      normalizedUsername: username.toLowerCase(),
      email,
      password,
      balance: 50000,
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
    });
    console.log(`Created user "${user.username}" (${user._id})`);
    toAdd.push(user);
  }

  for (const user of toAdd) {
    company.members.push({
      userId: user._id,
      role: 'member',
      joinedAt: new Date(),
    });
    user.companyId = company._id;
    await user.save();
    console.log(`Added user "${user.username}" (${user._id}) as member`);
  }

  await company.save();
  console.log(`Done! Total members: ${company.members.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
