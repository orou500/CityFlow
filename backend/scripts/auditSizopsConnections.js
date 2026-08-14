import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

/**
 * Read-only audit of the CityFlow ↔ SizOps connection state.
 *
 * Requires (env):
 *   MONGODB_URI           — CityFlow database (default localhost)
 *   SIZOPS_MONGODB_URI    — SizOps database (used when reachable)
 *   SIZOPS_CONNECTIONS_JSON — OR: JSON array of the SizOps-side CityFlow
 *                             connections, e.g. fetched read-only from the
 *                             SizOps DB when network policies block direct
 *                             cross-namespace access:
 *                               [{"userId":"...","displayName":"...","status":"active","gamePlayerId":"..."}]
 *
 * NEVER writes to either database.
 */

const CF_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const SIZOPS_URI = process.env.SIZOPS_MONGODB_URI || '';
const SIZOPS_CONNECTIONS_JSON = process.env.SIZOPS_CONNECTIONS_JSON || '';

async function loadSizopsConnections() {
  if (SIZOPS_CONNECTIONS_JSON) {
    const list = JSON.parse(SIZOPS_CONNECTIONS_JSON);
    return { gamePlayers: list, sizopsUserById: new Map(), loadedUsers: false };
  }

  const sizopsConn = mongoose.createConnection(SIZOPS_URI, { serverSelectionTimeoutMS: 15000 });
  const SizopsUser = sizopsConn.model('User', CityFlowUserSchema, 'users');
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
    return { gamePlayers: null, sizopsUserById: new Map(), loadedUsers: false };
  }

  const gamePlayers = await SizopsGamePlayer.find({ gameId: cityflowGame._id, status: 'active' }).lean();
  const sizopsUserIds = gamePlayers.map((p) => p.userId.toString());
  const sizopsUsers = await SizopsUser.find({ _id: { $in: sizopsUserIds } }).lean();
  const sizopsUserById = new Map(sizopsUsers.map((u) => [u._id.toString(), u]));
  await sizopsConn.close();
  return { gamePlayers, sizopsUserById, loadedUsers: true };
}

const CityFlowUserSchema = {
  sizopsUserId: { type: String },
  sizopsLinkedAt: { type: Date },
  isDisabled: { type: Boolean },
};

async function main() {
  await mongoose.connect(CF_URI);
  const cfUsers = await User.find({ sizopsUserId: { $exists: true } })
    .select('_id username sizopsUserId sizopsLinkedAt')
    .lean();

  const cfBySizops = new Map();
  const dupSizopsIds = new Set();
  for (const u of cfUsers) {
    if (cfBySizops.has(u.sizopsUserId)) {
      dupSizopsIds.add(u.sizopsUserId);
    }
    cfBySizops.set(u.sizopsUserId, u);
  }

  console.log(`TOTAL CITYFLOW USERS WITH SIZOPS LINK: ${cfUsers.length}`);
  if (dupSizopsIds.size > 0) {
    console.log(`DUPLICATE_SIZOPS_USER_IDS: ${dupSizopsIds.size}`);
    for (const id of dupSizopsIds) {
      const users = cfUsers.filter((u) => u.sizopsUserId === id);
      console.log(`  ${id} -> ${users.map((u) => u._id).join(', ')}`);
    }
  } else {
    console.log('DUPLICATE_SIZOPS_USER_IDS: 0');
  }

  if (!SIZOPS_URI && !SIZOPS_CONNECTIONS_JSON) {
    console.log('\nWARNING: SIZOPS_MONGODB_URI / SIZOPS_CONNECTIONS_JSON not set — cross-system checks skipped.');
    await mongoose.disconnect();
    return;
  }

  const { gamePlayers, sizopsUserById, loadedUsers } = await loadSizopsConnections();
  if (!gamePlayers) {
    console.log('\nSIZOPS GAME "cityflow" NOT FOUND — no connections to cross-check.');
    await mongoose.disconnect();
    return;
  }

  const healthy = [];
  const cfLinkedMissing = [];
  const orphaned = [];
  const invalidPlayers = [];

  for (const u of cfUsers) {
    if (dupSizopsIds.has(u.sizopsUserId)) continue;
    const hasConnection = gamePlayers.some((p) => p.userId.toString() === u.sizopsUserId);
    if (hasConnection) healthy.push(u);
    else cfLinkedMissing.push(u);
  }

  for (const p of gamePlayers) {
    const uid = p.userId.toString();
    const cfLinked = cfUsers.some((u) => u.sizopsUserId === uid);
    if (!cfLinked) {
      orphaned.push({ sizopsUserId: uid, displayName: p.displayName, gamePlayerId: p._id || p.gamePlayerId });
    } else if (loadedUsers) {
      const sizopsUser = sizopsUserById.get(uid);
      if (!sizopsUser) {
        invalidPlayers.push({
          sizopsUserId: uid,
          gamePlayerId: p._id || p.gamePlayerId,
          reason: 'sizops_user_missing',
        });
      } else if (sizopsUser.isDisabled) {
        invalidPlayers.push({
          sizopsUserId: uid,
          gamePlayerId: p._id || p.gamePlayerId,
          reason: 'sizops_user_disabled',
        });
      }
    }
  }

  console.log(`HEALTHY: ${healthy.length}`);
  console.log(`CITYFLOW_LINKED_BUT_SIZOPS_MISSING: ${cfLinkedMissing.length}`);
  for (const u of cfLinkedMissing.slice(0, 20)) {
    console.log(`  cfUser=${u._id} username=${u.username} sizopsUserId=${u.sizopsUserId}`);
  }
  if (cfLinkedMissing.length > 20) console.log(`  ... and ${cfLinkedMissing.length - 20} more`);

  console.log(`SIZOPS_CONNECTION_WITHOUT_CITYFLOW_LINK (orphaned): ${orphaned.length}`);
  for (const o of orphaned.slice(0, 20)) {
    console.log(`  sizopsUserId=${o.sizopsUserId} displayName=${o.displayName} gamePlayer=${o.gamePlayerId}`);
  }
  if (orphaned.length > 20) console.log(`  ... and ${orphaned.length - 20} more`);

  console.log(`INVALID_GAMEPLAYER_CONNECTIONS: ${invalidPlayers.length}`);
  for (const i of invalidPlayers.slice(0, 20)) {
    console.log(`  sizopsUserId=${i.sizopsUserId} gamePlayer=${i.gamePlayerId} reason=${i.reason}`);
  }
  if (invalidPlayers.length > 20) console.log(`  ... and ${invalidPlayers.length - 20} more`);

  console.log(
    `MISMATCHED_USER_IDENTITIES: ${cfLinkedMissing.length + orphaned.length + invalidPlayers.length} ` +
      `(checked ${cfUsers.length} CityFlow links against ${gamePlayers.length} SizOps connections)`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
