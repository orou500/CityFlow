import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

// READ-ONLY — compares the pre-leave backup state against the live production
// state and prints the exact before/after values plus the recovery plan preview.
// Never writes. Fully self-contained so it can be streamed into the backend pod:
//   Get-Content backend\scripts\compareCompanyState.js -Raw | kubectl exec -i -n cityflow deploy/cityflow-backend -- node --input-type=module - --name="Horizon Builders"
// Args: [--name="Horizon Builders"] [--file=<backup.json.gz>] [--backup-dir=<dir>]

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const nameArg = process.argv.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Horizon Builders';
const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1] || null;

const sid = (v) => (v && typeof v.toString === 'function' ? v.toString() : null);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const backupDir = process.env.BACKUP_DIR
  ? process.env.BACKUP_DIR
  : process.argv.find((a) => a.startsWith('--backup-dir='))?.split('=')[1] ||
    (process.env.KUBERNETES_SERVICE_HOST ? '/app/backups' : path.resolve(process.cwd(), 'backups'));

async function readBackupFile(filepath, onLine) {
  if (!fs.existsSync(filepath)) return false;
  const rl = readline.createInterface({ input: fs.createReadStream(filepath).pipe(zlib.createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      onLine(EJSON.parse(line));
    } catch {
      /* skip malformed line */
    }
  }
  return true;
}

async function findCompanyInBackup(filepath, nameRe) {
  let result = null;
  const opened = await readBackupFile(filepath, (data) => {
    if (data.header === true || data.collection !== 'realestatecompanies') return;
    for (const doc of data.documents || []) {
      if (!result && nameRe.test(doc.name || '')) result = doc;
    }
  });
  return opened ? result : null;
}

// Newest completed backup where the founder (matched by the live founderId) is
// still an active CEO member — i.e. the state immediately before the founder left.
async function detectPreLeaveBackup(db, dir, nameRe, founderId) {
  const founderStr = sid(founderId);
  let fallback = null;
  const meta = await db
    .collection('backups')
    .find({}, { projection: { _id: 1, filename: 1, createdAt: 1, status: 1, backupVersion: 1 } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  for (const m of meta) {
    if (m.status === 'failed' || !m.filename) continue;
    const filepath = path.join(dir, m.filename);
    const doc = await findCompanyInBackup(filepath, nameRe);
    if (!doc) continue;
    if (!fallback) fallback = { meta: m, doc, filepath };
    const founderMember = (doc.members || []).find((mm) => sid(mm.userId) === founderStr);
    if (founderMember && founderMember.role === 'ceo') {
      return { meta: m, doc, filepath, preLeave: true };
    }
  }
  if (fallback) return { ...fallback, preLeave: false };
  return null;
}

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const liveCompanies = await db
    .collection('realestatecompanies')
    .find({ name: { $regex: esc(nameArg), $options: 'i' } })
    .toArray();
  if (!liveCompanies.length) {
    console.log(`\n!!! No company matching "${nameArg}" found in the live DB.`);
    const all = await db
      .collection('realestatecompanies')
      .find({}, { projection: { name: 1, active: 1 } })
      .toArray();
    console.log('All companies:', all.map((c) => c.name).join(', '));
    await mongoose.disconnect();
    return;
  }
  const live = liveCompanies[0];
  const nameRe = new RegExp(esc(live.name), 'i');

  let pre;
  if (fileArg) {
    const filepath = path.isAbsolute(fileArg) ? fileArg : path.join(backupDir, fileArg);
    const doc = await findCompanyInBackup(filepath, nameRe);
    if (!doc) {
      console.log(`Company "${live.name}" not found in ${filepath}`);
      await mongoose.disconnect();
      return;
    }
    pre = { filepath, doc, meta: null, preLeave: false };
  } else {
    pre = await detectPreLeaveBackup(db, backupDir, nameRe, live.founderId);
    if (!pre) {
      console.log(`\n!!! No backup containing "${live.name}" was found.`);
      try {
        console.log(
          'Backup files on disk:',
          fs
            .readdirSync(backupDir)
            .filter((f) => f.endsWith('.gz'))
            .join(', '),
        );
      } catch {
        /* ignore */
      }
      await mongoose.disconnect();
      return;
    }
  }

  const backupMeta = pre.meta
    ? `file: ${pre.meta.filename}  (createdAt: ${pre.meta.createdAt}, status: ${pre.meta.status}, version: ${pre.meta.backupVersion ?? '?'})`
    : `file: ${pre.filepath} (--file override)`;

  const founderId = sid(pre.doc.founderId) || sid(live.founderId);
  const memberIds = [
    ...new Set(
      [
        ...(pre.doc.members || []).map((m) => sid(m.userId)),
        ...(live.members || []).map((m) => sid(m.userId)),
        founderId,
      ].filter(Boolean),
    ),
  ];
  const users = await db
    .collection('users')
    .find({ _id: { $in: memberIds } }, { projection: { _id: 1, username: 1 } })
    .toArray();
  const uname = new Map(users.map((u) => [sid(u._id), u.username]));
  const nameOf = (id) => (uname.get(sid(id)) ? `${uname.get(sid(id))} (${sid(id)})` : sid(id));
  const founderMember = (members) => (members || []).find((m) => sid(m.userId) === founderId);

  console.log('\n====================================================================');
  console.log(`COMPARISON: "${live.name}"  (${sid(live._id)})`);
  console.log('====================================================================');
  console.log('\n=== PRE-LEAVE BACKUP (source of truth for ownership state) ===');
  console.log(backupMeta);
  const preFounder = founderMember(pre.doc.members);
  const preCeo = (pre.doc.members || []).find((m) => m.role === 'ceo');
  console.log('Founder:', preFounder ? `role=${preFounder.role}, shares=${preFounder.shares}` : 'NOT A MEMBER');
  console.log('CEO at backup time:', preCeo ? `${nameOf(preCeo.userId)} role=ceo shares=${preCeo.shares}` : 'none');
  console.log(
    'Members:',
    (pre.doc.members || []).map((m) => `${nameOf(m.userId)} [${m.role}, ${m.shares} sh]`).join(' | ') || '(none)',
  );
  console.log('Shares:', EJSON.stringify(pre.doc.shares));
  const preSum = (pre.doc.members || []).reduce((s, m) => s + (m.shares || 0), 0);
  const preDelta =
    (pre.doc.shares?.totalShares ?? null) === null
      ? null
      : preSum + (pre.doc.shares?.treasuryShares ?? 0) - (pre.doc.shares?.totalShares ?? 0);
  console.log(
    `Share accounting: members ${preSum} + treasury ${pre.doc.shares?.treasuryShares} = ${preSum + (pre.doc.shares?.treasuryShares ?? 0)} vs total ${pre.doc.shares?.totalShares} -> ${
      preDelta === 0 ? 'CONSISTENT' : `INCONSISTENT (delta ${preDelta > 0 ? '+' : ''}${preDelta})`
    }`,
  );

  console.log('\n=== CURRENT PRODUCTION STATE (live DB) ===');
  const liveFounder = founderMember(live.members);
  const liveCeos = (live.members || []).filter((m) => m.role === 'ceo');
  console.log('Founder:', liveFounder ? `role=${liveFounder.role}, shares=${liveFounder.shares}` : 'NOT A MEMBER');
  console.log('CEO(s):', liveCeos.map((m) => `${nameOf(m.userId)} shares=${m.shares}`).join(' | ') || 'NONE');
  console.log(
    'Members:',
    (live.members || []).map((m) => `${nameOf(m.userId)} [${m.role}, ${m.shares} sh]`).join(' | ') || '(none)',
  );
  console.log('Shares:', EJSON.stringify(live.shares));
  const liveSum = (live.members || []).reduce((s, m) => s + (m.shares || 0), 0);
  const liveDelta =
    (live.shares?.totalShares ?? null) === null
      ? null
      : liveSum + (live.shares?.treasuryShares ?? 0) - (live.shares?.totalShares ?? 0);
  console.log(
    `Share accounting: members ${liveSum} + treasury ${live.shares?.treasuryShares} = ${liveSum + (live.shares?.treasuryShares ?? 0)} vs total ${live.shares?.totalShares} -> ${
      liveDelta === 0 ? 'CONSISTENT' : `INCONSISTENT (delta ${liveDelta > 0 ? '+' : ''}${liveDelta})`
    }`,
  );

  console.log('\n=== BEFORE / AFTER COMPARISON ===');
  const curCeo = liveCeos[0];
  const curCeoPreLeaveRole = curCeo
    ? (pre.doc.members || []).find((m) => sid(m.userId) === sid(curCeo.userId))?.role
    : null;
  const rows = [
    ['founderId', sid(pre.doc.founderId) || '(missing)', sid(live.founderId) || '(missing)'],
    [
      'my role (founder)',
      preFounder ? preFounder.role : '(not a member)',
      liveFounder ? liveFounder.role : '(not a member)',
    ],
    [
      'my shares (founder)',
      preFounder ? String(preFounder.shares) : '(not a member)',
      liveFounder ? String(liveFounder.shares) : '(not a member)',
    ],
    ['treasuryShares', String(pre.doc.shares?.treasuryShares ?? '?'), String(live.shares?.treasuryShares ?? '?')],
    ['totalShares', String(pre.doc.shares?.totalShares ?? '?'), String(live.shares?.totalShares ?? '?')],
    [
      'current CEO',
      preCeo ? `${nameOf(preCeo.userId)} [${preCeo.role}, ${preCeo.shares} sh]` : '(none)',
      curCeo ? `${nameOf(curCeo.userId)} [${curCeo.role}, ${curCeo.shares} sh]` : '(none)',
    ],
    [
      'current CEO pre-leave role (demotion target)',
      curCeoPreLeaveRole ? `'${curCeoPreLeaveRole}'` : "(unknown — fallback 'director')",
      '',
    ],
    ['member count', String((pre.doc.members || []).length), String((live.members || []).length)],
  ];
  for (const [label, backup, current] of rows) {
    const marker = backup === current ? 'match' : 'DIFF';
    console.log(`  ${label.padEnd(42)} backup: ${String(backup).padEnd(28)} current: ${current}  (${marker})`);
  }

  console.log('\n=== RECOVERY PLAN PREVIEW (READ-ONLY — nothing executed) ===');
  if (!preFounder) {
    console.log(
      `  ABORT: the founder (${nameOf(founderId)}) is not a member in the pre-leave backup — cannot derive the original share count.`,
    );
    await mongoose.disconnect();
    return;
  }
  const X = preFounder.shares;
  const otherMembersSum = (live.members || [])
    .filter((m) => sid(m.userId) !== founderId)
    .reduce((s, m) => s + (m.shares || 0), 0);
  const newTreasury = (live.shares?.totalShares ?? 0) - (otherMembersSum + X);
  const demotionTargets = (live.members || []).filter((m) => m.role === 'ceo' && sid(m.userId) !== founderId);

  console.log(`  1) Restore founder membership (from backup: role='${preFounder.role}', shares=${X}):`);
  if (liveFounder) {
    console.log(
      `     - $set member ${nameOf(founderId)}: role '${liveFounder.role}' -> '${preFounder.role}', shares ${liveFounder.shares || 0} -> ${X}`,
    );
  } else {
    console.log(
      `     - add member: { userId: ${founderId}, role: '${preFounder.role}', shares: ${X} } (${nameOf(founderId)})`,
    );
  }
  if (demotionTargets.length) {
    console.log('  2) Single-CEO invariant — demote non-founder CEO(s) (shares unchanged):');
    for (const m of demotionTargets) {
      const targetRole = (pre.doc.members || []).find((mm) => sid(mm.userId) === sid(m.userId))?.role || 'director';
      console.log(`     - ${nameOf(m.userId)}: role 'ceo' -> '${targetRole}' (their pre-leave role)`);
    }
  } else {
    console.log('  2) Single-CEO invariant: no non-founder CEO to demote.');
  }
  const founderIdDiffers = sid(pre.doc.founderId) && sid(pre.doc.founderId) !== sid(live.founderId);
  console.log(
    founderIdDiffers
      ? `  3) founderId: ${sid(live.founderId)} -> ${sid(pre.doc.founderId)} (restored from backup)`
      : `  3) founderId: unchanged (${sid(live.founderId)} — matches backup)`,
  );
  console.log(
    `  4) treasuryShares: ${live.shares?.treasuryShares} -> ${newTreasury}  (= totalShares ${live.shares?.totalShares} - membersSum ${otherMembersSum + X} after restore)`,
  );
  const userDoc = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(founderId) });
  if (userDoc) {
    console.log(
      `  5) user ${uname.get(founderId) || founderId}: companyId ${sid(userDoc.companyId) || 'null'} -> ${sid(live._id)}`,
    );
  } else {
    console.log(`  5) WARNING: user ${founderId} not found in the users collection — recovery cannot set companyId.`);
  }
  console.log('\n  Final expected state:');
  console.log(
    `    founderId=${sid(pre.doc.founderId) || sid(live.founderId)}, founder member role='${preFounder.role}' shares=${X}`,
  );
  console.log(`    exactly 1 CEO: ${nameOf(founderId)}`);
  console.log(
    `    treasuryShares=${newTreasury}; members(${otherMembersSum + X}) + treasury = totalShares(${live.shares?.totalShares})`,
  );
  console.log('  Unrelated data (balances, properties, loans, transactions, XP, other members): untouched.');
  console.log('\nCompare complete — nothing was modified.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Comparison failed:', e);
  process.exit(1);
});
