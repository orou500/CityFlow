import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import User from '../src/models/User.js';
import Donation from '../src/models/Donation.js';

/**
 * READ-ONLY audit: are any supporter-related stored values corrupted
 * (mojibake) or holding emoji where only ids should exist?
 */
const MOJI_RE = /[\u00C0-\u00FF\u2018\u2019\u201C\u201D\u2026\u2013\u2014]{2,}|[\uFFFD]/;
const VALID_BADGES = new Set(['none', 'supporter', 'early_supporter', 'founding_supporter']);

async function run() {
  await mongoose.connect(config.mongodbUri);
  const report = { badges: [], titles: [], donationTitles: [], cosmeticIds: [], weird: [] };

  const users = await User.find({
    $or: [{ supporter: { $ne: null } }, { donationStats: { $ne: null } }, { cosmetics: { $ne: null } }],
  })
    .select('username supporter donationStats cosmetics')
    .lean();

  for (const u of users) {
    const badge = u.supporter?.badge;
    if (badge && !VALID_BADGES.has(badge)) report.badges.push({ u: u.username, badge });
    if (u.supporter?.title && MOJI_RE.test(u.supporter.title)) {
      report.titles.push({ u: u.username, title: u.supporter.title.slice(0, 40) });
    }
    if (u.donationStats?.totalDonated) {
      // donorSince is a Date; nothing emoji-able. totalDonated is a number.
    }
    const cos = u.cosmetics || {};
    for (const [k, v] of Object.entries(cos)) {
      if (k === 'usernameStyle') {
        if (MOJI_RE.test(JSON.stringify(v))) report.cosmeticIds.push({ u: u.username, field: k, v });
        continue;
      }
      if (typeof v === 'string' && MOJI_RE.test(v)) report.cosmeticIds.push({ u: u.username, field: k, v: v.slice(0, 40) });
    }
  }

  const donations = await Donation.find({}).select('paypalOrderId amount status').lean();
  const donationWithEmoji = donations.filter((d) => MOJI_RE.test(JSON.stringify(d))).length;

  console.log('users scanned:', users.length);
  console.log('donations scanned:', donations.length);
  console.log('invalid badge ids:', JSON.stringify(report.badges));
  console.log('mojibake supporter titles:', JSON.stringify(report.titles));
  console.log('mojibake cosmetics:', JSON.stringify(report.cosmeticIds));
  console.log('donations with mojibake:', donationWithEmoji);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});