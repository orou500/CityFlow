#!/usr/bin/env node
/**
 * AUCTION SETTLEMENT AUDIT — read-only production reconciliation report.
 *
 * Scans the auction system for every integrity category defined in the
 * production incident review:
 *
 *   1. Settled correctly (winner -> property transferred, settledAt stamped)
 *   2. Winner determined but property NOT transferred
 *   3. Expired (endTick passed) but still 'active'
 *   4. Claimed ('ending') but never settled (no settledAt)
 *   5. Winner notification missing for an ended auction with a winner
 *   6. Dangling reservations on ended/cancelled auctions
 *   7. 'ended'/'cancelled' auctions that still carry winner fields
 *
 * The script NEVER writes. It prints counts per category, the exact offending
 * documents, and a verdict: whether any data repair is required.
 *
 * Modes:
 *   node scripts/auditAuctionSettlement.js          # full audit report
 *   node scripts/auditAuctionSettlement.js --verify # targeted check of the
 *                                                   # incident auction (sizex)
 *   node scripts/auditAuctionSettlement.js --help   # usage
 *
 * Requires env MONGODB_URI (uses dotenv, falls back to localhost).
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const INCIDENT_AUCTION_ID = '6a92c9c0033c55e618a6fbc2';
const INCIDENT_PROPERTY_ID = '6a92c9c0033c55e618a6fbbf';
const INCIDENT_USER_ID = '6a4fd8000f9b538943e05fd5'; // sizex

const mode = process.argv.includes('--verify') ? 'verify' : process.argv.includes('--help') ? 'help' : 'audit';

if (mode === 'help') {
  console.log(`Usage:
  node scripts/auditAuctionSettlement.js            full audit report (read-only)
  node scripts/auditAuctionSettlement.js --verify   verify the incident auction (sizex)
`);
  process.exit(0);
}

await mongoose.connect(URI);
const db = mongoose.connection.db;

async function count(collection, filter) {
  return db.collection(collection).countDocuments(filter);
}

async function audit() {
  console.log('=== AUCTION SETTLEMENT AUDIT (read-only) ===\n');
  const currentTick = await db.collection('gamestates').findOne({ key: 'global' });
  const tick = currentTick?.tickNumber ?? 0;
  console.log(`Current tick: ${tick}\n`);

  const statusCounts = {};
  for (const s of ['upcoming', 'active', 'ending', 'ended', 'cancelled']) {
    statusCounts[s] = await count('auctions', { status: s });
  }
  console.log(`Auctions by status: ${JSON.stringify(statusCounts)}`);

  // 1. Ended with winner -> expect winningBid > 0
  const endedWinnerNoBid = await db
    .collection('auctions')
    .find({ status: 'ended', winnerId: { $ne: null }, winningBid: { $lte: 0 } })
    .project({ _id: 1, winnerId: 1, winningBid: 1 })
    .toArray();
  console.log(`\n[1] Ended WITH winner but winningBid <= 0 (corrupt): ${endedWinnerNoBid.length}`);
  endedWinnerNoBid.forEach((a) => console.log(`    ${a._id} winner=${a.winnerId}`));

  // 2. Ended/cancelled with winnerId -> property should belong to winner
  const wonAuctions = await db
    .collection('auctions')
    .find({ status: { $in: ['ended', 'cancelled'] }, winnerId: { $ne: null } })
    .project({ _id: 1, winnerId: 1, propertyId: 1, status: 1 })
    .toArray();
  const propertyMismatch = [];
  for (const a of wonAuctions) {
    const prop = await db.collection('properties').findOne({ _id: a.propertyId });
    if (!prop) {
      propertyMismatch.push({ auctionId: a._id, problem: 'property missing' });
    } else if (!prop.ownerId && !prop.companyId) {
      propertyMismatch.push({ auctionId: a._id, problem: 'property ownerless' });
    } else if (a.status === 'ended' && prop.companyId && !a.companyId) {
      propertyMismatch.push({ auctionId: a._id, problem: 'company-owned but auction has no companyId' });
    }
  }
  console.log(`\n[2] Winner recorded but property NOT transferred/missing: ${propertyMismatch.length}`);
  propertyMismatch.forEach((m) => console.log(`    ${m.auctionId} -> ${m.problem}`));

  // 3. Expired but still active
  const expiredActive = await db
    .collection('auctions')
    .find({ status: 'active', endTick: { $lte: tick } })
    .project({ _id: 1, endTick: 1 })
    .toArray();
  console.log(`\n[3] Expired (endTick <= currentTick) but still 'active': ${expiredActive.length}`);
  expiredActive.forEach((a) => console.log(`    ${a._id} endTick=${a.endTick}`));

  // 4. Claimed ('ending') but never settled
  const unsettledEnding = await db
    .collection('auctions')
    .find({ status: 'ending', settledAt: null })
    .project({ _id: 1, endingStartedAt: 1, currentBidderId: 1, winnerId: 1, propertyId: 1 })
    .toArray();
  console.log(`\n[4] 'ending' without settledAt (claim crashed / legacy): ${unsettledEnding.length}`);
  unsettledEnding.forEach((a) =>
    console.log(
      `    ${a._id} endingStartedAt=${a.endingStartedAt} bidder=${a.currentBidderId} winner=${a.winnerId} (stale=${a.endingStartedAt != null && a.endingStartedAt <= tick - 2})`,
    ),
  );

  // 5. Winner notification missing for ended auctions with a winner
  const notifications = await db
    .collection('notifications')
    .find({ eventKey: { $regex: '^auction:.+:won:' } })
    .project({ eventKey: 1 })
    .toArray();
  const notifiedWins = new Set(notifications.map((n) => n.eventKey));
  const missingNotif = [];
  for (const a of wonAuctions.filter((x) => x.status === 'ended')) {
    const key = `auction:${a._id}:won:${a.winnerId}`;
    if (!notifiedWins.has(key)) missingNotif.push({ auctionId: a._id, winnerId: a.winnerId });
  }
  console.log(`\n[5] Ended auctions with winner but no 'won' notification: ${missingNotif.length}`);
  missingNotif.slice(0, 20).forEach((m) => console.log(`    ${m.auctionId} winner=${m.winnerId}`));

  // 6. Dangling reservations on non-active auctions
  const reservations = await db
    .collection('auctionreservations')
    .find({})
    .project({ auctionId: 1, userId: 1 })
    .toArray();
  const dangling = [];
  for (const r of reservations) {
    const a = await db.collection('auctions').findOne({ _id: r.auctionId }, { projection: { status: 1 } });
    if (!a || (a.status !== 'active' && a.status !== 'upcoming' && a.status !== 'ending')) {
      dangling.push({ auctionId: r.auctionId, userId: r.userId, auctionStatus: a?.status ?? 'missing' });
    }
  }
  console.log(`\n[6] Dangling reservations on ended/cancelled/missing auctions: ${dangling.length}`);
  dangling
    .slice(0, 20)
    .forEach((d) => console.log(`    auction=${d.auctionId} user=${d.userId} status=${d.auctionStatus}`));

  // 7. Cancelled auctions still carrying winner fields
  const cancelledWithWinner = await db
    .collection('auctions')
    .find({ status: 'cancelled', $or: [{ winnerId: { $ne: null } }, { winningBid: { $gt: 0 } }] })
    .project({ _id: 1, winnerId: 1, winningBid: 1 })
    .toArray();
  console.log(`\n[7] Cancelled auctions still carrying winner fields: ${cancelledWithWinner.length}`);
  cancelledWithWinner.forEach((a) => console.log(`    ${a._id} winner=${a.winnerId} bid=${a.winningBid}`));

  const issues =
    endedWinnerNoBid.length +
    propertyMismatch.length +
    expiredActive.length +
    unsettledEnding.filter((a) => a.endingStartedAt != null && a.endingStartedAt <= tick - 2).length +
    missingNotif.length +
    dangling.length;
  console.log(
    `\n=== VERDICT: ${issues === 0 ? 'CLEAN — no data repair required' : `${issues} issue(s) found — see report`} ===`,
  );
}

async function verify() {
  console.log('=== INCIDENT AUCTION VERIFICATION (read-only) ===\n');
  const auction = await db.collection('auctions').findOne({ _id: new mongoose.Types.ObjectId(INCIDENT_AUCTION_ID) });
  if (!auction) {
    console.log(`Auction ${INCIDENT_AUCTION_ID} not found.`);
    process.exit(1);
  }

  console.log('Auction (6a92c9c0033c55e618a6fbc2):');
  console.log(
    `  status=${auction.status} winnerId=${auction.winnerId} winningBid=${auction.winningBid} currentBidderId=${auction.currentBidderId}`,
  );
  console.log(
    `  auctionType=${auction.auctionType} reservePrice=${auction.reservePrice} reserveMet=${auction.reserveMet} currentBid=${auction.currentBid}`,
  );
  console.log(
    `  endTick=${auction.endTick} originalEndTick=${auction.originalEndTick} endingStartedAt=${auction.endingStartedAt} extensionCount=${auction.extensionCount}`,
  );
  console.log(`  bids=${auction.bids?.length} totalBids=${auction.totalBids} watchers=${auction.watchers?.length}`);

  const property = await db.collection('properties').findOne({ _id: auction.propertyId });
  console.log('\nProperty (6a92c9c0033c55e618a6fbbf):');
  if (!property) {
    console.log('  LIVE DOCUMENT DELETED (expected for a bank no-winner recycle) — snapshot preserved on auction.');
    console.log(`  propertySnapshot present: ${!!auction.propertySnapshot}`);
  } else {
    console.log(
      `  ownerId=${property.ownerId} companyId=${property.companyId} forSale=${property.forSale} auctionId=${property.auctionId}`,
    );
  }

  const user = await db
    .collection('users')
    .findOne(
      { _id: new mongoose.Types.ObjectId(INCIDENT_USER_ID) },
      { projection: { username: 1, balance: 1, reservedAuctionFunds: 1, ownedProperties: 1 } },
    );
  console.log('\nUser sizex (6a4fd8000f9b538943e05fd5):');
  console.log(
    `  username=${user?.username} balance=${user?.balance} reservedAuctionFunds=${user?.reservedAuctionFunds}`,
  );
  const ownsIncidentProperty = (user?.ownedProperties || []).some((p) => p.toString() === INCIDENT_PROPERTY_ID);
  console.log(`  owns incident property: ${ownsIncidentProperty}`);

  const reservation = await db.collection('auctionreservations').findOne({
    userId: new mongoose.Types.ObjectId(INCIDENT_USER_ID),
    auctionId: new mongoose.Types.ObjectId(INCIDENT_AUCTION_ID),
  });
  console.log(
    `\nReservation for incident auction: ${reservation ? `STILL HELD ${JSON.stringify(reservation)}` : 'released (none)'}`,
  );

  const notifCount = await db.collection('notifications').countDocuments({
    userId: new mongoose.Types.ObjectId(INCIDENT_USER_ID),
    eventKey: { $regex: `^auction:${INCIDENT_AUCTION_ID}:` },
  });
  const noWinnerNotifs = await db
    .collection('notifications')
    .find({ eventKey: `auction:${INCIDENT_AUCTION_ID}:no_winner:${INCIDENT_USER_ID}` })
    .project({ _id: 1, eventKey: 1 })
    .toArray();
  console.log(`\nNotifications for sizex on this auction: ${notifCount}`);
  noWinnerNotifs.forEach((n) => console.log(`  ${n.eventKey} -> ${n._id}`));

  const outcome =
    auction.winnerId === null && auction.currentBidderId === null && auction.reserveMet === false && !reservation;
  console.log(
    `\n=== VERDICT ===\n${
      outcome
        ? 'CONSISTENT — reserve auction correctly settled with NO WINNER (bid below reserve). No repair required.'
        : 'INCONSISTENT — manual review required.'
    }`,
  );
}

try {
  if (mode === 'verify') {
    await verify();
  } else {
    await audit();
  }
} finally {
  await mongoose.disconnect();
}
