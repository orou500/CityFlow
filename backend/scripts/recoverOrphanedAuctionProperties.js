#!/usr/bin/env node
/**
 * Idempotent migration: recovers properties orphaned by auctions that ended
 * without a winner (no bids or reserve not met).
 *
 *  - Bank-created properties (sellerType 'bank') with no winner → DELETE
 *  - Player-listed properties (sellerType 'player') with no winner → restore
 *    forSale = true so the seller can re-list or sell normally.
 *
 * Usage:
 *   node scripts/recoverOrphanedAuctionProperties.js --dry-run   (default)
 *   node scripts/recoverOrphanedAuctionProperties.js --apply
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/cityflow';
const DRY_RUN = !process.argv.includes('--apply');

async function run() {
  console.log(`[RECOVER] Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'APPLY (will modify DB)'}`);
  console.log(`[RECOVER] Connecting to ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '://***:***@')}...`);

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const properties = await db.collection('properties').find({
    ownerId: null,
    forSale: false,
  }).toArray();

  console.log(`[RECOVER] Found ${properties.length} orphaned properties (ownerId: null, forSale: false)`);

  if (properties.length === 0) {
    console.log('[RECOVER] Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let bankDeleted = 0;
  let playerRestored = 0;
  let skippedNoAuction = 0;
  let skippedActiveAuction = 0;
  let skippedWinnerExists = 0;

  const toDelete = [];
  const toRestore = [];

  for (const prop of properties) {
    const auction = await db.collection('auctions').findOne(
      { propertyId: prop._id },
      { sort: { createdAt: -1 } },
    );

    if (!auction) {
      skippedNoAuction++;
      console.log(`  [SKIP] Property ${prop._id} (${prop.name}): no associated auction found`);
      continue;
    }

    if (auction.status === 'upcoming' || auction.status === 'active' || auction.status === 'ending') {
      skippedActiveAuction++;
      console.log(`  [SKIP] Property ${prop._id} (${prop.name}): auction ${auction._id} is ${auction.status} (in progress)`);
      continue;
    }

    if (auction.winnerId) {
      skippedWinnerExists++;
      console.log(`  [SKIP] Property ${prop._id} (${prop.name}): auction ${auction._id} has winner ${auction.winnerId}`);
      continue;
    }

    if (auction.sellerType === 'bank') {
      bankDeleted++;
      toDelete.push({ propertyId: prop._id, propertyName: prop.name, auctionId: auction._id, auctionType: auction.auctionType });
      console.log(`  [BANK DELETE] Property ${prop._id} (${prop.name}): auction ${auction._id} (${auction.auctionType}) ended with no winner`);
    } else if (auction.sellerType === 'player') {
      playerRestored++;
      toRestore.push({ propertyId: prop._id, propertyName: prop.name, auctionId: auction._id, sellerId: auction.sellerId, auctionType: auction.auctionType });
      console.log(`  [PLAYER RESTORE] Property ${prop._id} (${prop.name}): auction ${auction._id} (${auction.auctionType}) ended with no winner → restoring to marketplace`);
    } else {
      console.log(`  [SKIP] Property ${prop._id} (${prop.name}): unknown sellerType '${auction.sellerType}'`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`  SUMMARY`);
  console.log(`  Total orphaned properties: ${properties.length}`);
  console.log(`  Bank (to delete):          ${bankDeleted}`);
  console.log(`  Player (to restore):       ${playerRestored}`);
  console.log(`  Skipped (no auction):      ${skippedNoAuction}`);
  console.log(`  Skipped (active auction):  ${skippedActiveAuction}`);
  console.log(`  Skipped (has winner):      ${skippedWinnerExists}`);
  console.log('═══════════════════════════════════════════');

  if (DRY_RUN) {
    console.log('');
    console.log('[RECOVER] DRY RUN complete. Re-run with --apply to execute changes.');
    if (toDelete.length > 0) {
      console.log(`[RECOVER] Would DELETE ${toDelete.length} bank properties:`);
      for (const d of toDelete) {
        console.log(`  - ${d.propertyName} (auction ${d.auctionId}, type: ${d.auctionType})`);
      }
    }
    if (toRestore.length > 0) {
      console.log(`[RECOVER] Would RESTORE ${toRestore.length} player properties to marketplace:`);
      for (const r of toRestore) {
        console.log(`  - ${r.propertyName} (auction ${r.auctionId}, seller ${r.sellerId}, type: ${r.auctionType})`);
      }
    }
  } else {
    let deletedCount = 0;
    let restoredCount = 0;

    for (const d of toDelete) {
      await db.collection('properties').deleteOne({ _id: d.propertyId });
      deletedCount++;
    }

    for (const r of toRestore) {
      await db.collection('properties').updateOne(
        { _id: r.propertyId },
        { $set: { forSale: true } },
      );
      restoredCount++;
    }

    console.log('');
    console.log(`[RECOVER] APPLIED: deleted ${deletedCount} bank properties, restored ${restoredCount} player properties`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[RECOVER] Fatal error:', err);
  process.exit(1);
});
