import RealEstateCompany from '../models/RealEstateCompany.js';
import Auction from '../models/Auction.js';
import CompanyAuditLog from '../models/CompanyAuditLog.js';
import { enqueueNotification } from '../utils/notificationQueue.js';
import { onCompanyVoteCompleted } from '../utils/cacheInvalidation.js';
import { emitAuctionBid } from './auctionProcessing.js';
import { computeAuctionRemaining } from '../utils/auctionTime.js';
import { getGameState, getTickNumber } from '../models/GameState.js';
import { AUCTION_CONFIG } from '../config/auctions.js';

// The company voting period is at most 6 hours (a hard wall-clock cap). It is
// NEVER the full remaining duration of the auction — it is only shortened when
// the auction itself ends before those 6 hours are up.
export const AUCTION_BID_VOTING_DURATION_MS = AUCTION_CONFIG.companyBid.votingDurationMs;

const TICK_DURATION_MS = 6 * 60 * 60 * 1000;

/**
 * Backend-computed voting deadline:
 *
 *   votingEndsAt = MIN(createdAt + 6h, auctionEndsAt)
 *
 * The auction model stores a tick number (endTick), not a wall-clock date, so
 * auctionEndsAt is derived from the persisted tick state:
 *
 *   auctionEndsAt = lastTickAt + (endTick - currentTick) * 6h
 *
 * This guarantees votingEndsAt <= auctionEndsAt ALWAYS — voting can never
 * continue after the auction ends. The client never supplies this value.
 */
export function calculateAuctionBidVotingEndsAt(auction, gameState, now = Date.now()) {
  const currentTick = gameState.tickNumber || 0;
  const lastTickAt = gameState.lastTickAt ? new Date(gameState.lastTickAt).getTime() : now;
  const remainingTicks = Math.max(0, (auction.endTick || currentTick) - currentTick);
  const auctionEndsAt = lastTickAt + remainingTicks * TICK_DURATION_MS;
  const defaultDeadline = now + AUCTION_BID_VOTING_DURATION_MS;
  return new Date(Math.min(defaultDeadline, auctionEndsAt));
}

/** Count explicit + (optionally) missing-as-YES votes for a proposal. */
export function computeAuctionBidTally(company, proposal, applyMissingAsYes) {
  const eligibleVoters = company.members.filter((m) => m.userId?.toString() !== proposal.requestedBy?.toString());
  const totalVoters = eligibleVoters.length;
  const explicitVotes = proposal.votes || [];
  const explicitYes = explicitVotes.filter((v) => v.vote === 'yes').length;
  const explicitNo = explicitVotes.filter((v) => v.vote === 'no').length;
  const missing = applyMissingAsYes ? Math.max(0, totalVoters - explicitVotes.length) : 0;
  return {
    totalVoters,
    explicitYes,
    explicitNo,
    yes: explicitYes + missing,
    no: explicitNo,
    missing,
    threshold: Math.ceil(totalVoters / 2),
  };
}

/** Mutate the auction with a company bid entry (marker for recovery). */
function applyAuctionBid(auction, company, proposal, bidderId, currentTick) {
  const previousBidderId = auction.currentBidderId;
  auction.bids.push({
    bidderId,
    amount: proposal.amount,
    tick: currentTick,
    username: `${company.name} (Company)`,
    auctionBidProposalId: proposal._id,
  });
  auction.currentBid = proposal.amount;
  auction.currentBidderId = bidderId;
  auction.totalBids += 1;
  auction.companyId = company._id;
  auction.uniqueBidders = new Set(auction.bids.map((b) => b.bidderId.toString())).size;

  auction.activity.push({
    type: 'bid',
    userId: bidderId,
    username: `${company.name} (Company)`,
    amount: proposal.amount,
    tick: currentTick,
  });

  return previousBidderId;
}

/** Mutate the company treasury + proposal execution markers (company side). */
function applyCompanyCharge(company, proposal, bidderId) {
  company.treasury.balance -= proposal.amount;
  company.treasury.transactions.push({
    type: 'withdrawal',
    amount: proposal.amount,
    description: 'Auction bid on property',
    performedBy: bidderId,
  });
  proposal.executedBy = bidderId;
  proposal.executedAt = new Date();
}

/**
 * Place the company auction bid using the existing auction machinery.
 *
 * This is the ONLY place that executes an approved company auction bid — both
 * immediate (threshold reached while voting) and deadline (no-vote=YES)
 * resolutions call it, so the bid can never be created twice.
 *
 * Returns { executed: boolean, reason?: string }. The auction remains the
 * authority for status, minimum bid, treasury sufficiency, current bidder and
 * bid amount — this function never overrides auction state.
 */
export async function executeCompanyAuctionBid(company, proposal, actorUserId) {
  const auction = await Auction.findById(proposal.auctionId);
  if (!auction || auction.status !== 'active') {
    return { executed: false, reason: 'auction_not_active' };
  }

  const currentTick = await getTickNumber();
  if (auction.endTick <= currentTick) {
    return { executed: false, reason: 'auction_ended' };
  }

  const minBid = auction.currentBid > 0 ? auction.currentBid + auction.bidIncrement : auction.startingBid;
  if (proposal.amount < minBid) {
    return { executed: false, reason: 'below_min_bid' };
  }

  if (company.treasury.balance < proposal.amount) {
    return { executed: false, reason: 'insufficient_treasury' };
  }

  const bidderId = actorUserId || company._id;
  const previousBidderId = applyAuctionBid(auction, company, proposal, bidderId, currentTick);
  applyCompanyCharge(company, proposal, bidderId);

  await Promise.all([auction.save(), company.save()]);

  if (previousBidderId && previousBidderId.toString() !== bidderId.toString()) {
    await enqueueNotification({
      userId: previousBidderId,
      type: 'system',
      title: 'Outbid by Company',
      message: `${company.name} bid $${proposal.amount.toLocaleString()} on an auction`,
      eventKey: `auction:${auction._id}:outbid:${previousBidderId}`,
      route: `/auctions/${auction._id}`,
      entityType: 'auction',
      entityId: auction._id,
      relatedId: auction._id,
      global: false,
    });
  }

  const timing = computeAuctionRemaining(auction, currentTick);
  emitAuctionBid(auction._id.toString(), {
    currentBid: proposal.amount,
    currentBidderId: bidderId.toString(),
    currentBidderUsername: `${company.name} (Company)`,
    totalBids: auction.totalBids,
    uniqueBidders: auction.uniqueBidders,
    endTick: auction.endTick,
    currentTick: timing.currentTick,
    remainingMonths: timing.remainingMonths,
  });

  return { executed: true };
}

/**
 * Set the terminal status + tally on an already-claimed proposal, persist it,
 * audit, notify the proposer and emit the real-time resolution event.
 */
async function finalizeProposal(company, proposal, outcome, tally, reason, gameState) {
  proposal.status = outcome;
  proposal.resolution = {
    yes: tally.yes,
    no: tally.no,
    missingAsYes: tally.missing,
    threshold: tally.threshold,
    resolvedAt: new Date(),
  };
  proposal.resolvedAt = new Date();
  if (reason) proposal.resolutionReason = reason;

  await company.save();

  await CompanyAuditLog.create({
    companyId: company._id,
    userId: null,
    action:
      outcome === 'approved'
        ? 'auction_bid_approved'
        : outcome === 'rejected'
          ? 'auction_bid_rejected'
          : 'auction_bid_expired',
    details: {
      auctionBidId: proposal._id,
      auctionId: proposal.auctionId,
      amount: proposal.amount,
      yes: tally.yes,
      no: tally.no,
      missingAsYes: tally.missing,
    },
    tick: gameState.tickNumber,
  });

  await enqueueNotification({
    userId: proposal.requestedBy,
    type: 'system',
    title:
      outcome === 'approved'
        ? 'Company Bid Approved'
        : outcome === 'rejected'
          ? 'Company Bid Rejected'
          : 'Company Bid Expired',
    message:
      outcome === 'approved'
        ? `Your company auction bid proposal for $${proposal.amount.toLocaleString()} was approved and executed.`
        : outcome === 'rejected'
          ? `Your company auction bid proposal for $${proposal.amount.toLocaleString()} was rejected.`
          : `Your company auction bid proposal for $${proposal.amount.toLocaleString()} expired before it could be executed.`,
    eventKey: `auction:${proposal.auctionId}:company_bid:${proposal._id}:${proposal.status}:${proposal.requestedBy}`,
    route: `/real-estate-companies/${company._id}`,
    tab: 'auctions',
    entityType: 'company',
    entityId: company._id,
    relatedId: company._id,
    proposalId: proposal._id,
    auctionId: proposal.auctionId,
    global: false,
  });

  await onCompanyVoteCompleted(company._id);

  return {
    outcome,
    status: proposal.status,
    yes: tally.yes,
    no: tally.no,
    missingAsYes: tally.missing,
    threshold: tally.threshold,
    proposal,
  };
}

/**
 * Resolve an already-claimed proposal (count votes, execute the bid if
 * approved, finalize). Shared by the atomic claim path and stale recovery.
 */
async function performResolution(company, proposal, opts) {
  const { applyMissingAsYes = true, actorUserId = null, reason = null } = opts;
  const tally = computeAuctionBidTally(company, proposal, applyMissingAsYes);
  const gameState = await getGameState();

  let outcome;
  if (tally.yes >= tally.threshold) {
    const actor =
      actorUserId ||
      (proposal.votes.length > 0 ? proposal.votes[proposal.votes.length - 1].userId : proposal.requestedBy);
    const exec = await executeCompanyAuctionBid(company, proposal, actor);
    outcome = exec.executed ? 'approved' : 'expired';
  } else {
    outcome = 'rejected';
  }

  return finalizeProposal(company, proposal, outcome, tally, reason, gameState);
}

/**
 * Atomically claim and resolve a pending auction-bid proposal.
 *
 * Multi-instance safety: the claim is a single atomic findOneAndUpdate that
 * transitions the proposal from `pending` → `resolving` and stamps
 * `resolvingAt`. Only one server instance can perform that transition, so
 * exactly one worker executes the resolution — no duplicate auction bids,
 * treasury deductions, transactions, notifications or resolution events. A
 * second caller simply sees `claimed: false` and skips. A worker that crashes
 * after claiming leaves the proposal in `resolving`; the stale-recovery job
 * (recoverStaleAuctionBidProposals) picks it up after the configured timeout.
 *
 * @param {boolean} applyMissingAsYes - deadline resolution (true) converts
 *   every eligible voter who did not vote into a YES. Immediate resolution
 *   (false) only counts explicit votes.
 */
export async function resolveAuctionBidProposal(companyId, proposalId, opts = {}) {
  const { applyMissingAsYes = true } = opts;

  const company = await RealEstateCompany.findOneAndUpdate(
    { _id: companyId, 'auctionBids._id': proposalId, 'auctionBids.status': 'pending' },
    { $set: { 'auctionBids.$.status': 'resolving', 'auctionBids.$.resolvingAt': new Date() } },
    { new: true },
  );

  if (!company) {
    return { claimed: false };
  }

  const proposal = company.auctionBids.id(proposalId);
  if (!proposal) {
    return { claimed: false };
  }

  return {
    claimed: true,
    ...(await performResolution(company, proposal, { applyMissingAsYes })),
  };
}

/**
 * Safely recover ONE stale `resolving` proposal.
 *
 * Idempotency: the re-claim is an atomic renewal of the claim
 * (resolving → resolving with a fresh resolvingAt) restricted to proposals
 * whose resolvingAt is older than the stale timeout, so only one recovery
 * worker ever touches a given proposal. Before retrying any side effect the
 * recovery verifies the persisted auction and company state:
 *
 *   - was the auction bid already created?  (auctionBidProposalId on the bid)
 *   - was the treasury already charged?      (proposal.executedAt, persisted in
 *     the same company.save() as the treasury debit)
 *
 * Depending on which side the crashed worker completed, the recovery finishes
 * the missing side or just finalizes the status — it never re-executes a bid
 * or re-charges the treasury. If the proposal cannot be safely recovered it is
 * marked `expired` with an explicit resolutionReason instead of being left
 * permanently `resolving`.
 */
export async function recoverAuctionBidProposal(companyId, proposalId, now = Date.now()) {
  const staleCutoff = new Date(now - AUCTION_CONFIG.companyBid.resolutionStaleMs);

  const company = await RealEstateCompany.findOneAndUpdate(
    {
      _id: companyId,
      'auctionBids._id': proposalId,
      'auctionBids.status': 'resolving',
      'auctionBids.resolvingAt': { $lt: staleCutoff },
    },
    { $set: { 'auctionBids.$.resolvingAt': new Date(now) } },
    { new: true },
  );

  if (!company) {
    return { recovered: false };
  }

  const proposal = company.auctionBids.id(proposalId);
  if (!proposal) {
    return { recovered: false };
  }

  const gameState = await getGameState();
  const auction = await Auction.findById(proposal.auctionId);
  const bidExists =
    !!auction && (auction.bids || []).some((b) => b.auctionBidProposalId?.toString() === proposalId.toString());
  const treasuryCharged = !!proposal.executedAt;
  const applyMissingAsYes = !proposal.votingEndsAt || new Date(proposal.votingEndsAt).getTime() <= now;
  const actorUserId =
    proposal.executedBy ||
    (proposal.votes.length > 0 ? proposal.votes[proposal.votes.length - 1].userId : proposal.requestedBy);
  const tally = computeAuctionBidTally(company, proposal, applyMissingAsYes);

  let result;
  try {
    if (bidExists && treasuryCharged) {
      // The crashed worker fully executed the bid; just finalize the status.
      result = await finalizeProposal(company, proposal, 'approved', tally, 'recovered_already_executed', gameState);
    } else if (bidExists) {
      // Auction bid exists but the company was never debited — complete the
      // company side exactly once (no new auction bid is pushed).
      applyCompanyCharge(company, proposal, actorUserId);
      result = await finalizeProposal(company, proposal, 'approved', tally, 'recovered_company_side', gameState);
    } else if (treasuryCharged) {
      // Company was debited but the auction bid is missing — complete the
      // auction side exactly once (treasury is not re-charged).
      const currentTick = await getTickNumber();
      if (auction && auction.status === 'active' && auction.endTick > currentTick) {
        applyAuctionBid(auction, company, proposal, actorUserId, currentTick);
        await auction.save();
        result = await finalizeProposal(company, proposal, 'approved', tally, 'recovered_auction_side', gameState);
      } else {
        result = await finalizeProposal(company, proposal, 'expired', tally, 'recovered_auction_ended', gameState);
      }
    } else {
      // Never executed — re-run the full resolution (no-vote=YES only applies
      // once the voting deadline has passed).
      result = await performResolution(company, proposal, { applyMissingAsYes, actorUserId, reason: 'recovered' });
    }

    await CompanyAuditLog.create({
      companyId: company._id,
      userId: null,
      action: 'auction_bid_proposal_recovered',
      details: {
        auctionBidId: proposal._id,
        auctionId: proposal.auctionId,
        amount: proposal.amount,
        outcome: result.outcome,
        reason: proposal.resolutionReason || null,
      },
      tick: gameState.tickNumber,
    });

    return { recovered: true, outcome: result.outcome, status: result.status, reason: proposal.resolutionReason };
  } catch (err) {
    // Cannot recover safely — mark expired with an explicit reason rather than
    // leaving the proposal permanently resolving. If even this fails (e.g. a
    // total DB outage) the next recovery cycle retries.
    console.error(`[AUCTION-BID] Recovery failed for ${companyId}/${proposalId}:`, err.message);
    try {
      const fresh = await RealEstateCompany.findById(companyId);
      const p = fresh?.auctionBids?.id(proposalId);
      if (fresh && p && p.status === 'resolving') {
        p.status = 'expired';
        p.resolutionReason = 'recovery_failed';
        p.resolvedAt = new Date();
        await fresh.save();
      }
    } catch {
      // ignore — retried next cycle
    }
    return { recovered: false, outcome: 'expired', reason: 'recovery_failed', error: err.message };
  }
}

/**
 * Periodically detect and recover stale `resolving` auction-bid proposals.
 *
 * A proposal is stale when it has been `resolving` for longer than
 * AUCTION_CONFIG.companyBid.resolutionStaleMs. Runs from the scheduler.
 */
export async function recoverStaleAuctionBidProposals(now = Date.now()) {
  const staleCutoff = new Date(now - AUCTION_CONFIG.companyBid.resolutionStaleMs);
  const companies = await RealEstateCompany.find({
    'auctionBids.status': 'resolving',
    'auctionBids.resolvingAt': { $lt: staleCutoff },
  }).select('_id auctionBids');

  const results = [];
  for (const company of companies) {
    for (const bid of company.auctionBids) {
      if (
        bid.status === 'resolving' &&
        bid.resolvingAt &&
        new Date(bid.resolvingAt).getTime() < staleCutoff.getTime()
      ) {
        results.push(await recoverAuctionBidProposal(company._id, bid._id, now));
      }
    }
  }
  return results;
}
