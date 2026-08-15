import 'dotenv/config';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

// READ-ONLY production audit — uses only find()/aggregate(). Never writes.
// Usage:
//   node scripts/auditCompanyRecovery.js [--name="Horizon Builders"] [--user="username or email"]
// On k8s (inside the backend pod): kubectl exec -it -n cityflow deploy/cityflow-backend -- node scripts/auditCompanyRecovery.js

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const nameArg = process.argv.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Horizon Builders';
const userArg = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1] || null;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const p = (label, obj) => console.log(`\n=== ${label} ===\n${EJSON.stringify(obj, null, 2)}`);
const sid = (v) => (v && typeof v.toString === 'function' ? v.toString() : null);

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const backups = await db
    .collection('backups')
    .find(
      {},
      {
        projection: { _id: 1, filename: 1, createdAt: 1, status: 1, type: 1, size: 1, documents: 1, backupVersion: 1 },
      },
    )
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  p(
    'A. BACKUPS (newest first — metadata only, files live on the backups PVC)',
    backups.map((b) => ({ ...b, _id: sid(b._id) })),
  );

  const companies = await db
    .collection('realestatecompanies')
    .find({ name: { $regex: esc(nameArg), $options: 'i' } })
    .toArray();
  if (!companies.length) {
    console.log(`\n!!! No company matching "${nameArg}" found. Listing all companies:`);
    const all = await db
      .collection('realestatecompanies')
      .find({}, { projection: { name: 1, active: 1, founderId: 1 } })
      .toArray();
    p(
      'ALL COMPANIES',
      all.map((c) => ({ ...c, _id: sid(c._id), founderId: sid(c.founderId) })),
    );
  }
  for (const c of companies) p(`B. COMPANY: ${c.name}`, c);

  const users = await db
    .collection('users')
    .find({}, { projection: { _id: 1, username: 1, email: 1, companyId: 1, role: 1, createdAt: 1, sizopsUserId: 1 } })
    .sort({ username: 1 })
    .toArray();
  p(
    'C. ALL USERS (to identify the affected account)',
    users.map((u) => ({ ...u, _id: sid(u._id), companyId: sid(u.companyId) })),
  );

  for (const c of companies) {
    const logs = await db.collection('companyauditlogs').find({ companyId: c._id }).sort({ createdAt: 1 }).toArray();
    p(
      `D. AUDIT LOG: ${c.name}`,
      logs.map((l) => ({ ...l, _id: sid(l._id), companyId: sid(l.companyId), userId: sid(l.userId) })),
    );
  }

  for (const c of companies) {
    const txs = await db
      .collection('transactions')
      .find({ companyId: c._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    p(
      `E. TRANSACTIONS: ${c.name}`,
      txs.map((t) => ({
        ...t,
        _id: sid(t._id),
        companyId: sid(t.companyId),
        buyerId: sid(t.buyerId),
        sellerId: sid(t.sellerId),
      })),
    );
  }

  if (userArg) {
    const matches = await db
      .collection('users')
      .find({
        $or: [
          { username: { $regex: esc(userArg), $options: 'i' } },
          { email: { $regex: esc(userArg), $options: 'i' } },
        ],
      })
      .toArray();
    p(
      'F. USER FILTER MATCH',
      matches.map((u) => ({ ...u, _id: sid(u._id), companyId: sid(u.companyId) })),
    );
  }

  console.log('\nRead-only audit complete — nothing was modified.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Audit failed:', e);
  process.exit(1);
});
