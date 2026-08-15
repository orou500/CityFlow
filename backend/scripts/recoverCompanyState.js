import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import zlib from 'zlib';
import readline from 'readline';
import mongoose from 'mongoose';
import { EJSON } from 'bson';

// Resolve the model from cwd so it works both as a script (cwd=backend) and
// streamed via stdin (cwd=/app inside the pod, where the repo's src/ exists).
const RealEstateCompany = (
  await import(pathToFileURL(path.join(process.cwd(), 'src/models/RealEstateCompany.js')).href)
).default;

// Restores a company to the founder's exact pre-leave ownership state.
// DRY RUN by default — pass --apply to actually write. The pre-leave backup is
// the source of truth for the founder's role, shares and founderId.
// Fully self-contained except for the RealEstateCompany model (relative import
// resolves from cwd in stdin mode, and the model lives in src/models).
//   Get-Content backend\scripts\recoverCompanyState.js -Raw | kubectl exec -i -n cityflow deploy/cityflow-backend -- node --input-type=module - --name="Horizon Builders" [--apply]
// Args: [--name="Horizon Builders"] [--file=<backup.json.gz>] [--backup-dir=<dir>]
//       [--founder-shares=<N>] [--founder-role=<role>] [--demote-role=<role>] [--apply]
// When no backup contains the company (e.g. it was founded after the last backup),
// the founder's pre-leave values must be provided explicitly with --founder-shares
// (and optionally --founder-role / --demote-role) — derived from audited evidence.

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const nameArg = process.argv.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Horizon Builders';
const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1] || null;
const founderSharesArg = process.argv.find((a) => a.startsWith('--founder-shares='))?.split('=')[1] || null;
const founderRoleArg = process.argv.find((a) => a.startsWith('--founder-role='))?.split('=')[1] || null;
const demoteRoleArg = process.argv.find((a) => a.startsWith('--demote-role='))?.split('=')[1] || null;
const applyMode = process.argv.includes('--apply');

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
  if (applyMode) {
    console.log('APPLY MODE — writes will be executed.');
  } else {
    console.log('DRY RUN — nothing will be written. Re-run with --apply to execute.');
  }
  console.log('NOTE: create a fresh backup first (the game keeps one automatically, but do it explicitly).');

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const liveCompanies = await db
    .collection('realestatecompanies')
    .find({ name: { $regex: esc(nameArg), $options: 'i' } })
    .toArray();
  if (!liveCompanies.length) {
    console.log(`\n!!! No company matching "${nameArg}" found in the live DB. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const live = liveCompanies[0];
  const nameRe = new RegExp(esc(live.name), 'i');

  let pre;
  if (fileArg) {
    const filepath = path.isAbsolute(fileArg) ? fileArg : path.join(backupDir, fileArg);
    const doc = await findCompanyInBackup(filepath, nameRe);
    if (!doc) {
      console.log(`Company "${live.name}" not found in ${filepath}. Aborting.`);
      await mongoose.disconnect();
      process.exit(1);
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
      if (founderSharesArg === null) {
        console.log(
          'ABORT: the pre-leave backup is required unless --founder-shares=<N> (and optionally --founder-role / --demote-role) are provided from audited evidence.',
        );
        await mongoose.disconnect();
        process.exit(1);
      }
    }
  }

  if (pre) {
    const backupMeta = pre.meta ? `${pre.meta.filename} (createdAt: ${pre.meta.createdAt})` : pre.filepath;
    console.log(
      pre.preLeave
        ? `\nUsing pre-leave backup: ${backupMeta}`
        : `\nNote: ${backupMeta} contains the company but is NOT a pre-leave state (founder not CEO in it).`,
    );
  }

  // ---- Compute the plan -----------------------------------------------------
  const founderId = live.founderId;
  const founderStr = sid(founderId);

  // Source of truth: the pre-leave backup when one is found, otherwise explicit
  // --founder-shares/--founder-role/--demote-role args. A backup that contains
  // the company but is NOT pre-leave (founder not CEO in it — e.g. a fresh
  // safety backup taken after the leave) must never be used as evidence.
  let X;
  let founderRole = 'ceo';
  let preFounder = null;
  if (pre?.preLeave) {
    preFounder = (pre.doc.members || []).find((m) => sid(m.userId) === founderStr);
    if (!preFounder) {
      console.log(
        `ABORT: founder (${founderStr}) is not a member in the pre-leave backup — cannot derive original shares.`,
      );
      await mongoose.disconnect();
      process.exit(1);
    }
    X = preFounder.shares;
    founderRole = preFounder.role;
  } else if (founderSharesArg !== null) {
    X = Number(founderSharesArg);
    if (!Number.isInteger(X) || X < 1) {
      console.log(`ABORT: invalid --founder-shares value "${founderSharesArg}".`);
      await mongoose.disconnect();
      process.exit(1);
    }
    if (founderRoleArg) founderRole = founderRoleArg;
    if (pre) {
      console.log(
        `WARNING: newest backup containing the company (${pre.meta?.filename || pre.filepath}) is NOT pre-leave (founder not CEO in it). Using explicit --founder-shares=${X} / --founder-role=${founderRole} / --demote-role=${demoteRoleArg || 'director'}.`,
      );
    }
  } else {
    console.log('ABORT: no pre-leave backup found and --founder-shares=<N> was not provided. Refusing to guess.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const liveMembers = (live.members || []).map((m) => ({ ...m, userId: sid(m.userId) }));
  const liveFounder = liveMembers.find((m) => m.userId === founderStr);
  const otherMembersSum = liveMembers.filter((m) => m.userId !== founderStr).reduce((s, m) => s + (m.shares || 0), 0);
  const newTreasury = (live.shares?.totalShares ?? 0) - (otherMembersSum + X);
  const demotionTargets = liveMembers.filter((m) => m.role === 'ceo' && m.userId !== founderStr);
  const founderIdChanged = founderStr !== sid(live.founderId);

  if (!liveFounder && liveMembers.length >= (live.maxMembers || 10)) {
    console.log(`ABORT: company is at maxMembers (${live.maxMembers}) and the founder must be added as a new member.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // ---- Dry-run report --------------------------------------------------------
  console.log('\n=== RECOVERY PLAN ===');
  console.log(
    `  1) founder membership: ${
      liveFounder
        ? `update member ${founderStr} -> role '${founderRole}', shares ${liveFounder.shares || 0} -> ${X}`
        : `add member { userId: ${founderStr}, role: '${founderRole}', shares: ${X} }`
    }`,
  );
  console.log('  2) demote non-founder CEO(s) to their pre-leave role:');
  if (demotionTargets.length) {
    for (const m of demotionTargets) {
      const targetRole =
        (pre?.preLeave ? (pre.doc.members || []).find((mm) => sid(mm.userId) === m.userId)?.role : null) ||
        demoteRoleArg ||
        'director';
      console.log(`     - ${m.userId}: 'ceo' -> '${targetRole}'`);
    }
  } else {
    console.log('     (none)');
  }
  console.log(`  3) founderId: ${founderIdChanged ? `${sid(live.founderId)} -> ${founderStr}` : 'unchanged'}`);
  console.log(`  4) treasuryShares: ${live.shares?.treasuryShares} -> ${newTreasury}`);
  const userBefore = await db.collection('users').findOne({ _id: founderId });
  console.log(
    `  5) user ${founderStr}: companyId ${sid(userBefore?.companyId) || 'null'} -> ${sid(live._id)}${
      userBefore ? '' : '  (WARNING: user not found)'
    }`,
  );
  console.log('  Documents touched: realestatecompanies (1) + users (1, the founder account only).');
  console.log('  Everything else (balances, properties, loans, transactions, XP, other members) is untouched.');

  if (!applyMode) {
    console.log('\nDRY RUN COMPLETE — no writes performed. Review and approve, then re-run with --apply.');
    await mongoose.disconnect();
    return;
  }

  // ---- Execute ----------------------------------------------------------------
  const company = await RealEstateCompany.findById(live._id);
  if (!company) {
    console.log('ABORT: company vanished between read and apply.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const founderMember = company.members.find((m) => sid(m.userId) === founderStr);
  if (founderMember) {
    founderMember.role = founderRole;
    founderMember.shares = X;
  } else {
    company.members.push({ userId: founderId, role: founderRole, shares: X, invitedBy: company.founderId });
  }
  for (const m of company.members) {
    if (m.role === 'ceo' && sid(m.userId) !== founderStr) {
      const targetRole =
        (pre?.preLeave ? (pre.doc.members || []).find((mm) => sid(mm.userId) === sid(m.userId))?.role : null) ||
        demoteRoleArg ||
        'director';
      m.role = targetRole;
    }
  }
  company.shares.treasuryShares = newTreasury;
  await company.save();
  await db.collection('users').updateOne({ _id: founderId }, { $set: { companyId: live._id } });

  // ---- Verify -----------------------------------------------------------------
  console.log('\n=== VERIFICATION ===');
  const v = await RealEstateCompany.findById(live._id);
  const fails = [];
  const check = (label, ok, detail) => {
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) fails.push(label);
  };
  const vCeos = (v.members || []).filter((m) => m.role === 'ceo');
  check('exactly one CEO', vCeos.length === 1, vCeos.map((m) => sid(m.userId)).join(', ') || 'none');
  check('CEO is the founder', vCeos.length === 1 && sid(vCeos[0].userId) === founderStr);
  const vFounder = (v.members || []).find((m) => sid(m.userId) === founderStr);
  check('founder is a member', !!vFounder);
  check('founder role restored', vFounder?.role === founderRole, `${vFounder?.role}`);
  check('founder shares restored', vFounder?.shares === X, `${vFounder?.shares}`);
  check('founderId restored', sid(v.founderId) === founderStr);
  check(
    'treasuryShares adjusted',
    v.shares?.treasuryShares === newTreasury,
    `${v.shares?.treasuryShares} (expected ${newTreasury})`,
  );
  const vSum = (v.members || []).reduce((s, m) => s + (m.shares || 0), 0);
  check(
    'share accounting consistent',
    vSum + (v.shares?.treasuryShares ?? 0) === (v.shares?.totalShares ?? 0),
    `members ${vSum} + treasury ${v.shares?.treasuryShares} vs total ${v.shares?.totalShares}`,
  );
  const vUser = await db.collection('users').findOne({ _id: founderId });
  check('user companyId restored', sid(vUser?.companyId) === sid(live._id), sid(vUser?.companyId) || 'null');

  if (fails.length) {
    console.log(`\nRECOVERY FAILED VERIFICATION (${fails.length}): ${fails.join(', ')}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('\nRECOVERY COMPLETE — all checks passed.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('Recovery failed:', e);
  process.exit(1);
});
