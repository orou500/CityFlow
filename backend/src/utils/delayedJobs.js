import { addJob, QUEUE_NAMES, getQueue } from './jobQueue.js';
import { isRedisConnected } from '../config/redis.js';

const TICK_DURATION_MS = 6 * 60 * 60 * 1000;

export async function scheduleVoteExpiration(companyId, proposalType, proposalId, ticksUntilExpiry) {
  if (!isRedisConnected()) return null;
  const delayMs = ticksUntilExpiry * TICK_DURATION_MS;
  return addJob(
    QUEUE_NAMES.NOTIFICATIONS,
    'vote:expire',
    {
      companyId: companyId.toString(),
      proposalType,
      proposalId: proposalId.toString(),
      expiresAt: new Date(Date.now() + delayMs).toISOString(),
    },
    {
      delay: delayMs,
      jobId: `vote:${proposalType}:${proposalId}`,
      removeOnComplete: 50,
    },
  );
}

/**
 * Schedule auction-bid proposal resolution at an exact wall-clock deadline.
 *
 * The company voting deadline for auction bids is a wall-clock timestamp
 * (votingEndsAt = MIN(createdAt + 6h, auctionEndsAt)) which may be shorter
 * than one 6-hour tick, so the tick-based scheduleVoteExpiration is not
 * precise enough. The job triggers the atomic resolution that applies the
 * "no vote = YES" rule and executes the bid if approved.
 */
export async function scheduleAuctionBidResolution(companyId, proposalId, votingEndsAt) {
  if (!isRedisConnected()) return null;
  const delayMs = new Date(votingEndsAt).getTime() - Date.now();
  if (delayMs <= 0) return null;
  return addJob(
    QUEUE_NAMES.NOTIFICATIONS,
    'vote:expire',
    {
      companyId: companyId.toString(),
      proposalType: 'auctionBid',
      proposalId: proposalId.toString(),
      expiresAt: new Date(votingEndsAt).toISOString(),
    },
    {
      delay: delayMs,
      jobId: `vote:auctionBid:${proposalId}`,
      removeOnComplete: 50,
    },
  );
}

export async function scheduleContractCompletion(contractId, companyId, durationTicks, startTick) {
  if (!isRedisConnected()) return null;
  const delayMs = durationTicks * TICK_DURATION_MS;
  return addJob(
    QUEUE_NAMES.NOTIFICATIONS,
    'contract:complete',
    {
      contractId: contractId.toString(),
      companyId: companyId.toString(),
      endTick: startTick + durationTicks,
    },
    {
      delay: delayMs,
      jobId: `contract:${contractId}`,
      removeOnComplete: 50,
    },
  );
}

export async function scheduleInvestmentMaturity(investmentId, companyId, durationTicks) {
  if (!isRedisConnected()) return null;
  const delayMs = durationTicks * TICK_DURATION_MS;
  return addJob(
    QUEUE_NAMES.NOTIFICATIONS,
    'investment:mature',
    {
      investmentId: investmentId.toString(),
      companyId: companyId.toString(),
    },
    {
      delay: delayMs,
      jobId: `investment:${investmentId}`,
      removeOnComplete: 50,
    },
  );
}

export async function schedulePropertyOfferExpiration(offerId, expiresAt) {
  if (!isRedisConnected()) return null;
  const delayMs = new Date(expiresAt).getTime() - Date.now();
  if (delayMs <= 0) return null;
  return addJob(
    QUEUE_NAMES.NOTIFICATIONS,
    'offer:expire',
    {
      offerId: offerId.toString(),
    },
    {
      delay: delayMs,
      jobId: `offer:${offerId}`,
      removeOnComplete: 50,
    },
  );
}

export async function cancelDelayedJob(jobId) {
  if (!isRedisConnected()) return;
  const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
  if (!queue) return;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  } catch (err) {
    console.error(`[DELAYED JOBS] Cancel ${jobId} error:`, err.message);
  }
}

export async function getDelayedJobCount() {
  if (!isRedisConnected()) return 0;
  const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
  if (!queue) return 0;
  try {
    const jobs = await queue.getJobs(['delayed']);
    return jobs.length;
  } catch {
    return 0;
  }
}
