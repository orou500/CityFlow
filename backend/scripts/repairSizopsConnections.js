import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

/**
 * Repair tool for SizOps ↔ CityFlow connection inconsistencies.
 *
 * Default is DRY RUN (no changes). Only `--apply` makes changes.
 *
 * What it repairs (unambiguous only):
 *   SIZOPS_CONNECTION_WITHOUT_CITYFLOW_LINK — a CityFlow GamePlayer exists on
 *   SizOps but no CityFlow user is linked to that SizOps user id (orphaned).
 *   Removed via the authenticated game API (POST /api/v1/game/games/disconnect
 *   with the CityFlow game API key), which removes ONLY the CityFlow link and
 *   never the SizOps user or other games.
 *
 * What it NEVER touches (reported for manual review):
 *   - DUPLICATE_SIZOPS_USER_IDS (ambiguous which CityFlow account is canonical)
 *   - CITYFLOW_LINKED_BUT_SIZOPS_MISSING (a re-login recreates the connection;
 *     recreating links automatically is not a safe assumption)
 *   - INVALID_GAMEPLAYER_CONNECTIONS (disabled/deleted SizOps users)
 *
 * Requires (env):
 *   MONGODB_URI           — CityFlow database
 *   SIZOPS_MONGODB_URI    — SizOps database (when reachable) OR
 *   SIZOPS_CONNECTIONS_JSON — JSON array of SizOps CityFlow connections, e.g.
 *                             [{"userId":"...","displayName":"...","status":"active"}]
 *                             (read-only fetch, safe behind network policies)
 *   SIZOPS_API_KEY        — CityFlow game API key (--apply only)
 *   SIZOPS_API_BASE_URL or SIZOPS_OIDC_ISSUER — SizOps base URL (--apply only)
 *
 * Idempotent: running with --apply twice makes no second-run changes.
 */

const CF_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const SIZOPS_URI = process.env.SIZOPS_MONGODB_URI || '';
const SIZOPS_CONNECTIONS_JSON = process.env.SIZOPS_CONNECTIONS_JSON || '';
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

const base = (process.env.SIZOPS_API_BASE_URL || process.env.SIZOPS_OIDC_ISSUER || '').replace(/\/+$/, '');
const apiKey = process.env.SIZOPS_API_KEY || '';

async function loadOrphans(cfSizopsIds) {
  if (SIZOPS_CONNECTIONS_JSON) {
    const list = JSON.parse(SIZOPS_CONNECTIONS_JSON);
    return list.filter((p) => !cfSizopsIds.has(String(p.userId)));
  }

  const sizopsConn = mongoose.createConnection(SIZOPS_URI, { serverSelectionTimeoutMS: 15000 });
  const SizopsGame = sizopsConn.model('Game', { slug: String }, 'games');
  const SizopsGamePlayer = sizopsConn.model(
    'GamePlayer',
    {
      gameId: { type: mongoose.Schema.Types.ObjectId },
      userId: { type: mongoose.Schema.Types.ObjectId },
      status: String,
    },
    'gameplayers',
  );

  const cityflowGame = await SizopsGame.findOne({ slug: 'cityflow' });
  if (!cityflowGame) {
    await sizopsConn.close();
    return null;
  }

  const orphans = await SizopsGamePlayer.find({ gameId: cityflowGame._id, status: 'active' }).lean();
  await sizopsConn.close();
  return orphans.filter((p) => !cfSizopsIds.has(p.userId.toString()));
}

async function main() {
  if (!SIZOPS_URI && !SIZOPS_CONNECTIONS_JSON) {
    console.error('SIZOPS_MONGODB_URI or SIZOPS_CONNECTIONS_JSON is required.');
    process.exit(1);
  }
  if (APPLY && (!base || !apiKey)) {
    console.error('--apply requires SIZOPS_API_BASE_URL (or SIZOPS_OIDC_ISSUER) and SIZOPS_API_KEY.');
    process.exit(1);
  }

  await mongoose.connect(CF_URI);
  const cfUsers = await User.find({ sizopsUserId: { $exists: true } })
    .select('_id sizopsUserId')
    .lean();
  const cfSizopsIds = new Set(cfUsers.map((u) => u.sizopsUserId));

  const orphans = await loadOrphans(cfSizopsIds);
  if (!orphans) {
    console.log('SizOps game "cityflow" not found — nothing to repair.');
    await mongoose.disconnect();
    return;
  }
  const orphanList = orphans.filter((p) => p.status === 'active' || p.status === undefined);

  console.log(`Mode: ${DRY ? 'DRY RUN (no changes)' : 'APPLY'}`);
  console.log(`CityFlow linked users: ${cfUsers.length}`);
  console.log(`SizOps CityFlow connections: ${orphans.length}`);
  console.log(`Orphaned connections to remove: ${orphanList.length}`);
  for (const p of orphanList) {
    console.log(
      `  sizopsUserId=${p.userId} gamePlayer=${p._id || p.gamePlayerId || ''} displayName=${p.displayName || ''} status=${p.status || 'active'}`,
    );
  }

  if (orphanList.length === 0) {
    console.log('Nothing to do — state is consistent.');
    await mongoose.disconnect();
    return;
  }

  if (DRY) {
    console.log('\nDRY RUN — re-run with --apply to remove the orphaned CityFlow connections.');
    await mongoose.disconnect();
    return;
  }

  let removed = 0;
  let failed = 0;
  for (const p of orphanList) {
    const userId = p.userId.toString();
    const action = {
      action: 'remove_orphaned_cityflow_connection',
      sizopsUserId: userId,
      game: 'CityFlow',
      reason: 'CityFlow user no longer linked',
    };
    try {
      const res = await fetch(`${base}/api/v1/game/games/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        removed += 1;
        console.log(`OK   ${JSON.stringify(action)}`);
      } else {
        failed += 1;
        console.log(`FAIL ${JSON.stringify({ ...action, httpStatus: res.status })}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`FAIL ${JSON.stringify({ ...action, error: err.message })}`);
    }
  }

  console.log(`\nResult: ${removed} removed, ${failed} failed. Idempotent — re-running finds nothing to do.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
