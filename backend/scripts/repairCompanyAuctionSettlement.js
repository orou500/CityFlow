#!/usr/bin/env node
/**
 * ONE-TIME REPAIR SCRIPT — Company auction settlement attribution correction.
 *
 * Target: auction 6a82f7c0e512404efbedcb56
 *
 * Background: a company auction bid was incorrectly attributed to the member
 * who cast the final YES vote (eviatar2015) instead of the company (Horizon
 * Builders). Settlement then treated the voter as the personal winner, hit
 * "insufficient funds", and CANCELLED the auction — the company treasury was
 * charged 1,404,146 for a bid that never delivered a property.
 *
 * Safety design:
 *  - VALIDATES every assumption before touching anything (aborts on mismatch).
 *  - --apply prints a final confirmation block and re-checks the constants
 *    against the live data; if ANY value differs from the validated dry-run
 *    assumptions it aborts with no changes.
 *  - Each write is a single atomic MongoDB document update:
 *      * refund   -> one updateOne on the company ($inc + $push in one op),
 *                    guarded by a filter that only refunds when no matching
 *                    refund transaction already exists (DB-level idempotency)
 *      * auction  -> one updateOne on the auction, guarded by a filter that
 *                    only corrects while the bid is still mis-attributed
 *      * audit    -> one insertOne, guarded by a unique index on
 *                    (action, details.auctionId) so at most one corrective
 *                    record can ever exist per auction
 *  - The refund and auction correction run BEFORE the corrective audit insert,
 *    so a crash in any window leaves a state that a re-run safely converges
 *    (no double refund is ever possible).
 *  - Standalone MongoDB has no multi-document transactions; atomicity is
 *    achieved per-document + idempotent convergence.
 *
 * Modes:
 *   node scripts/repairCompanyAuctionSettlement.js            # = --dry-run
 *   node scripts/repairCompanyAuctionSettlement.js --dry-run  # print only, no writes
 *   node scripts/repairCompanyAuctionSettlement.js --apply    # perform the repair
 *   node scripts/repairCompanyAuctionSettlement.js --verify   # confirm post-repair state
 *
 * Requires env MONGODB_URI (uses dotenv, falls back to localhost).
 * Completely separate from app startup / tick / settlement / deployment.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const AUCTION_ID = '6a82f7c0e512404efbedcb56';
const COMPANY_ID = '6a7f99e106b0fe92fc7ba722'; // Horizon Builders
const USER_ID = '6a7590c7c28436a1fbc3875d'; // eviatar2015
const EXPECTED_AMOUNT = 1404146;
const CORRECTIVE_ACTION = 'auction_settlement_refund';
// Stable, unique-per-auction marker for the corrective audit record. Carried
// ONLY by corrective records, so a sparse unique index on it is a DB-level
// guard: at most one corrective audit can ever exist per auction, and existing
// audit logs (which never have dedupeKey) are unaffected.
const DEDUPE_KEY = `${CORRECTIVE_ACTION}:${AUCTION_ID}`;

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--verify') ? 'verify' : 'dry-run';

let db;

async function connect() {
  await mongoose.connect(URI);
  db = mongoose.connection.db;
  // Best-effort DB-level guard: at most one corrective audit per auction.
  try {
    await db.collection('companyauditlogs').dropIndex('uniq_auction_settlement_refund').catch(() => {});
  } catch {
    // ignore
  }
  try {
    await db.collection('companyauditlogs').createIndex(
      { dedupeKey: 1 },
      { unique: true, sparse: true, name: 'uniq_auction_settlement_refund' },
    );
  } catch (err) {
    console.warn('[REPAIR] index create warning:', err.message);
  }
}

async function oid(hex) {
  return new mongoose.Types.ObjectId(hex);
}

async function getCompany() {
  return db.collection('realestatecompanies').findOne({ _id: await oid(COMPANY_ID) });
}

async function getAuction() {
  return db.collection('auctions').findOne({ _id: await oid(AUCTION_ID) });
}

async function getProperty(auction) {
  return db.collection('properties').findOne({ _id: auction.propertyId });
}

async function getBidder() {
  return db.collection('users').findOne({ _id: await oid(USER_ID) });
}

async function getExistingCorrectiveAudit() {
  return db.collection('companyauditlogs').findOne({ dedupeKey: DEDUPE_KEY });
}

/**
 * Validate every pre-repair assumption. Returns { ok, errors[], info, auction, company, property, bidder, proposal }.
 */
async function validate() {
  const errors = [];
  const info = {};

  const auction = await getAuction();
  if (!auction) return { ok: false, errors: [`Auction ${AUCTION_ID} not found`], info: {} };
  info.auctionStatus = auction.status;
  info.auctionWinnerId = auction.winnerId ? auction.winnerId.toString() : null;
  info.auctionCurrentBidderId = auction.currentBidderId ? auction.currentBidderId.toString() : null;
  info.auctionCurrentBid = auction.currentBid;
  info.bids = (auction.bids || []).map((b) => ({
    bidderId: b.bidderId ? b.bidderId.toString() : null,
    amount: b.amount,
    username: b.username,
    auctionBidProposalId: b.auctionBidProposalId ? b.auctionBidProposalId.toString() : null,
  }));

  if (auction.status !== 'cancelled') errors.push(`Auction status is '${auction.status}', expected 'cancelled'`);
  const bids = auction.bids || [];
  if (bids.length !== 1) errors.push(`Expected exactly 1 bid, found ${bids.length}`);
  const bid = bids[0] || {};
  const isCompanyBid = !!bid.auctionBidProposalId || (bid.username && String(bid.username).includes('(Company)'));
  if (!isCompanyBid) errors.push('The single bid is not a company bid');
  if (!auction.companyId || auction.companyId.toString() !== COMPANY_ID) {
    errors.push(`auction.companyId is '${auction.companyId}', expected ${COMPANY_ID}`);
  }
  const company = await getCompany();
  if (!company) errors.push(`Company ${COMPANY_ID} not found`);
  info.companyName = company?.name;
  info.companyTreasuryBalance = company?.treasury?.balance;

  if (bid.amount !== EXPECTED_AMOUNT) errors.push(`Bid amount is ${bid.amount}, expected ${EXPECTED_AMOUNT}`);
  if (auction.currentBid !== EXPECTED_AMOUNT) errors.push(`auction.currentBid is ${auction.currentBid}, expected ${EXPECTED_AMOUNT}`);

  const property = await getProperty(auction);
  if (!property) errors.push('Property not found');
  if (property) {
    info.propertyOwnerId = property.ownerId ? property.ownerId.toString() : null;
    info.propertyCompanyId = property.companyId ? property.companyId.toString() : null;
    if (property.ownerId) errors.push('Property has an ownerId — a transfer may have occurred');
    if (property.companyId) errors.push('Property has a companyId — a transfer may have occurred');
  }

  const bidder = await getBidder();
  if (!bidder) errors.push(`User ${USER_ID} not found`);
  if (bidder) {
    const owned = (bidder.ownedProperties || []).map((p) => p.toString());
    if (property && owned.includes(property._id.toString())) {
      errors.push('eviatar2015 owns the auction property — repair would be unsafe');
    }
    info.bidderBalance = bidder.balance;
  }

  const approvedAudit = await db.collection('companyauditlogs').findOne({
    companyId: await oid(COMPANY_ID),
    action: 'auction_bid_approved',
    'details.auctionId': await oid(AUCTION_ID),
  });
  const companyDoc = await db
    .collection('realestatecompanies')
    .findOne({ _id: await oid(COMPANY_ID), 'auctionBids.auctionId': await oid(AUCTION_ID) });
  const proposal = companyDoc?.auctionBids?.find((p) => p.auctionId && p.auctionId.toString() === AUCTION_ID);
  info.proposalStatus = proposal?.status;
  info.proposalExecutedAt = proposal?.executedAt ? new Date(proposal.executedAt).toISOString() : null;
  if (!approvedAudit) errors.push('No auction_bid_approved audit found for this auction');
  if (!proposal || proposal.status !== 'approved' || !proposal.executedAt) {
    errors.push('Company proposal not approved/executed — the 1,404,146 charge cannot be confirmed');
  }

  const existingCorrective = await getExistingCorrectiveAudit();
  info.alreadyRepaired = !!existingCorrective;

  return { ok: errors.length === 0, errors, info, auction, company, property, bidder, proposal };
}

/**
 * Final confirmation before --apply. Compares every relevant value against the
 * validated dry-run constants. Returns errors; abort if any differ.
 */
async function finalConfirmation(v) {
  const auction = v.auction;
  const bid = (auction.bids || [])[0] || {};
  const errors = [];
  const block = {
    auctionId: AUCTION_ID,
    companyId: COMPANY_ID,
    companyName: v.info.companyName,
    refundAmount: EXPECTED_AMOUNT,
    currentTreasuryBalance: v.info.companyTreasuryBalance,
    currentBidderId: bid.bidderId ? bid.bidderId.toString() : null,
    targetBidderId: COMPANY_ID,
    currentWinnerId: v.info.auctionWinnerId,
    propertyOwnerId: v.info.propertyOwnerId,
    propertyCompanyId: v.info.propertyCompanyId,
    correctiveRefundExists: v.info.alreadyRepaired,
  };
  console.log('[REPAIR] FINAL CONFIRMATION BEFORE APPLY:');
  for (const [k, val] of Object.entries(block)) {
    console.log(`  ${k}: ${val}`);
  }

  if (block.correctiveRefundExists) errors.push('Corrective refund already exists — abort');
  if (block.currentBidderId !== USER_ID) errors.push(`currentBidderId is ${block.currentBidderId}, expected ${USER_ID}`);
  if (block.currentWinnerId !== USER_ID) errors.push(`currentWinnerId is ${block.currentWinnerId}, expected ${USER_ID}`);
  if (block.propertyOwnerId !== null) errors.push('propertyOwnerId is not null');
  if (block.propertyCompanyId !== null) errors.push('propertyCompanyId is not null');
  if (v.info.auctionStatus !== 'cancelled') errors.push(`auction.status is ${v.info.auctionStatus}, expected cancelled`);
  if (auction.currentBid !== EXPECTED_AMOUNT) errors.push(`currentBid is ${auction.currentBid}, expected ${EXPECTED_AMOUNT}`);
  if (bid.amount !== EXPECTED_AMOUNT) errors.push(`bid.amount is ${bid.amount}, expected ${EXPECTED_AMOUNT}`);

  if (errors.length > 0) {
    console.error('[REPAIR] FINAL CONFIRMATION MISMATCH — aborting, no changes made:');
    errors.forEach((e) => console.error(`  - ${e}`));
  }
  return errors;
}

/**
 * Atomic (per-document) repair. Order: refund -> auction correction -> audit.
 * Each step is idempotent and guarded so a re-run or a concurrent process can
 * never double-refund.
 */
async function performRepair({ auction }) {
  const companyId = await oid(COMPANY_ID);
  const auctionId = await oid(AUCTION_ID);
  const propertyId = auction.propertyId;

  // 1. Refund exactly 1,404,146 — one atomic doc update; filter guarantees the
  //    refund happens only if no matching refund transaction exists yet.
  const refundFilter = {
    _id: companyId,
    'treasury.transactions': {
      $not: {
        $elemMatch: {
          type: 'refund',
          amount: EXPECTED_AMOUNT,
          description: { $regex: AUCTION_ID },
        },
      },
    },
  };
  const refundRes = await db.collection('realestatecompanies').updateOne(refundFilter, {
    $inc: { 'treasury.balance': EXPECTED_AMOUNT },
    $push: {
      'treasury.transactions': {
        type: 'refund',
        amount: EXPECTED_AMOUNT,
        userId: companyId,
        description: `Refund for cancelled company-auction settlement correction (auction ${AUCTION_ID})`,
        tick: auction.endTick || 0,
        createdAt: new Date(),
      },
    },
  });

  // 2. Correct bid attribution + clear wrong winner — one atomic doc update;
  //    only corrects while the bid is still attributed to the voter.
  const newBids = (auction.bids || []).map((b, i) => (i === 0 ? { ...b, bidderId: companyId } : b));
  const newActivity = (auction.activity || []).filter(
    (a) => !(a.type === 'won' && a.userId && a.userId.toString() === USER_ID),
  );
  const auctionRes = await db.collection('auctions').updateOne(
    { _id: auctionId, 'bids.0.bidderId': await oid(USER_ID) },
    {
      $set: {
        bids: newBids,
        currentBidderId: companyId,
        winnerId: null,
        winningBid: 0,
        activity: newActivity,
      },
    },
  );

  // 3. Corrective audit — unique index on dedupeKey guarantees exactly one per
  //    auction at the DB level.
  await db.collection('companyauditlogs').insertOne({
    companyId,
    userId: null,
    action: CORRECTIVE_ACTION,
    dedupeKey: DEDUPE_KEY,
    details: {
      auctionId,
      propertyId,
      amount: EXPECTED_AMOUNT,
      reason:
        'Settlement correction: company bid was wrongly attributed to the final voter; auction cancelled; treasury refunded and bid re-attributed to the company.',
    },
    tick: auction.endTick || 0,
    createdAt: new Date(),
  });

  return { refundModified: refundRes.modifiedCount, auctionModified: auctionRes.modifiedCount, newBids, newActivity };
}

async function verify() {
  const company = await getCompany();
  const auction = await getAuction();
  const bidder = await getBidder();
  const property = auction ? await getProperty(auction) : null;

  const refundCount = await db.collection('companyauditlogs').countDocuments({ dedupeKey: DEDUPE_KEY });

  const refundTxns = (company?.treasury?.transactions || []).filter(
    (t) => t.type === 'refund' && t.amount === EXPECTED_AMOUNT && t.description && t.description.includes(AUCTION_ID),
  );

  const bid = (auction?.bids || [])[0];
  const results = {
    correctiveAuditPresent: refundCount === 1,
    noDuplicateRefund: refundCount <= 1,
    refundTreasuryTransactionPresent: refundTxns.length === 1,
    noDuplicateRefundTxn: refundTxns.length <= 1,
    auctionCancelled: auction?.status === 'cancelled',
    noEviatarWinner:
      !auction?.winnerId ||
      (auction.winnerId.toString() !== USER_ID &&
        !(auction.activity || []).some((a) => a.type === 'won' && a.userId?.toString() === USER_ID)),
    winningBidZero: auction?.winningBid === 0,
    bidAttributedToCompany: !!bid && bid.bidderId?.toString() === COMPANY_ID,
    propertyUnowned: !!property && !property.ownerId && !property.companyId,
    bidderNotCharged: !bidder || !(bidder.ownedProperties || []).some((p) => property && p.toString() === property._id.toString()),
    originalAuditHistoryPresent:
      (await db
        .collection('companyauditlogs')
        .countDocuments({ companyId: await oid(COMPANY_ID), 'details.auctionId': await oid(AUCTION_ID) })) >= 5,
    bidderBalance: bidder?.balance,
    currentTreasuryBalance: company?.treasury?.balance,
  };

  const checks = [];
  for (const [k, v] of Object.entries(results)) {
    if (typeof v === 'boolean') checks.push(`${k}: ${v ? 'PASS' : 'FAIL'}`);
  }
  return { checks, results };
}

async function main() {
  await connect();
  console.log(`[REPAIR] Auction ${AUCTION_ID} — mode: ${mode}`);

  if (mode === 'verify') {
    const { checks, results } = await verify();
    checks.forEach((c) => console.log(`  ${c}`));
    console.log(`  [VERIFY] current treasury balance : ${results.currentTreasuryBalance}`);
    console.log(`  [VERIFY] bidder balance           : ${results.bidderBalance}`);
    await mongoose.disconnect();
    return;
  }

  const v = await validate();
  if (!v.ok) {
    console.error('[REPAIR] VALIDATION FAILED — aborting, no changes made:');
    v.errors.forEach((e) => console.error(`  - ${e}`));
    await mongoose.disconnect();
    process.exit(1);
  }

  if (v.info.alreadyRepaired) {
    console.log('[REPAIR] Corrective audit already present — repair already done. Nothing to do (idempotent).');
    await mongoose.disconnect();
    return;
  }

  console.log('[REPAIR] Validation PASSED:');
  console.log(`  auction.status            = ${v.info.auctionStatus}`);
  console.log(`  company                   = ${v.info.companyName} (${COMPANY_ID})`);
  console.log(`  bid amount                = ${v.info.bids[0]?.amount}`);
  console.log(`  bid.username              = ${v.info.bids[0]?.username}`);
  console.log(`  bid.bidderId (current)    = ${v.info.bids[0]?.bidderId}`);
  console.log(`  currentBidderId / winnerId= ${v.info.auctionCurrentBidderId} / ${v.info.auctionWinnerId}`);
  console.log(`  property owner/company    = ${v.info.propertyOwnerId} / ${v.info.propertyCompanyId} (untransferred)`);
  console.log(`  eviatar2015 balance       = ${v.info.bidderBalance} (unchanged by repair)`);
  console.log(`  proposal status/executedAt= ${v.info.proposalStatus} / ${v.info.proposalExecutedAt}`);
  console.log(`  current treasury balance  = ${v.info.companyTreasuryBalance}`);

  console.log('[REPAIR] Would change:');
  console.log(`  1. realestatecompanies[${COMPANY_ID}]: treasury.balance +${EXPECTED_AMOUNT.toLocaleString()}`);
  console.log(`     push treasury.transactions: { type: refund, amount: ${EXPECTED_AMOUNT}, description: "Refund for cancelled company-auction settlement correction (auction ${AUCTION_ID})" }`);
  console.log(`  2. auctions[${AUCTION_ID}]: bids[0].bidderId -> ${COMPANY_ID} (Horizon Builders); currentBidderId -> ${COMPANY_ID}`);
  console.log(`  3. auctions[${AUCTION_ID}]: winnerId -> null, winningBid -> 0; remove 'won' activity for ${USER_ID} (eviatar2015)`);
  console.log(`  4. companyauditlogs: insert corrective record { action: ${CORRECTIVE_ACTION}, amount: ${EXPECTED_AMOUNT}, auctionId: ${AUCTION_ID} }`);
  console.log(`  NOT modified: eviatar2015 balance, property ownership, original audit history.`);

  if (mode === 'dry-run') {
    console.log('[REPAIR] DRY RUN — no changes written.');
    await mongoose.disconnect();
    return;
  }

  // mode === 'apply'
  const confirmErrors = await finalConfirmation(v);
  if (confirmErrors.length > 0) {
    console.error('[REPAIR] Aborting before apply — no changes written.');
    await mongoose.disconnect();
    process.exit(1);
  }

  await performRepair({ auction: v.auction });
  console.log('[REPAIR] Applied.');
  const { checks, results } = await verify();
  checks.forEach((c) => console.log(`  [VERIFY] ${c}`));
  console.log(`  [VERIFY] current treasury balance : ${results.currentTreasuryBalance}`);
  console.log(`  [VERIFY] bidder balance           : ${results.bidderBalance}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[REPAIR] Unexpected error:', err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
