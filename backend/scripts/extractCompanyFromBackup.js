import 'dotenv/config';
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import readline from 'readline';
import { EJSON } from 'bson';

// READ-ONLY — extracts a company's exact state from a backup gzip file (pre-leave evidence).
// Usage:
//   node scripts/extractCompanyFromBackup.js --file=<backup.json.gz> [--name="Horizon Builders"]
// The backup file must be reachable from where this runs (on k8s it lives on the backups PVC,
// mounted at /app/backups in the backend pod — the pod also has node/bson to run this).

const BACKUP_DIR =
  process.env.BACKUP_DIR || process.argv.find((a) => a.startsWith('--backup-dir='))?.split('=')[1] || '/app/backups';
const fileArg = process.argv.find((a) => a.startsWith('--file='))?.split('=')[1];
const nameArg = process.argv.find((a) => a.startsWith('--name='))?.split('=')[1] || 'Horizon Builders';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!fileArg) {
  console.error(
    'Usage: node scripts/extractCompanyFromBackup.js --file=<backup.json.gz> [--name="..."] [--backup-dir=<dir>]',
  );
  process.exit(1);
}

const filepath = path.isAbsolute(fileArg) ? fileArg : path.join(BACKUP_DIR, fileArg);
if (!fs.existsSync(filepath)) {
  console.error(`Backup file not found: ${filepath}`);
  console.error('Available backups in backup dir:');
  try {
    for (const f of fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.gz'))) console.error('  ' + f);
  } catch {
    /* ignore */
  }
  process.exit(1);
}

async function main() {
  const rl = readline.createInterface({ input: fs.createReadStream(filepath).pipe(zlib.createGunzip()) });
  const re = new RegExp(esc(nameArg), 'i');
  let found = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let data;
    try {
      data = EJSON.parse(line);
    } catch {
      continue;
    }
    if (data.header === true) {
      console.log(`Backup header: version ${data.backupVersion}, created ${data.createdAt}`);
      continue;
    }
    if (data.collection === 'realestatecompanies') {
      for (const doc of data.documents || []) {
        if (re.test(doc.name || '')) {
          found = true;
          console.log(`\n=== ${doc.name} (as of this backup) ===`);
          console.log(
            EJSON.stringify(
              {
                _id: doc._id,
                name: doc.name,
                founderId: doc.founderId,
                active: doc.active,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                shares: doc.shares,
                members: doc.members,
                treasuryBalance: doc.treasury?.balance,
                ipo: doc.ipo,
              },
              null,
              2,
            ),
          );
        }
      }
    }
  }
  if (!found) console.log(`No company matching "${nameArg}" in this backup file.`);
}

main().catch((e) => {
  console.error('Extract failed:', e);
  process.exit(1);
});
