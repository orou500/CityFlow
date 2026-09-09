import Company from '../models/Company.js';
import StockHolding from '../models/StockHolding.js';
import StockMarketEvent from '../models/StockMarketEvent.js';
import User from '../models/User.js';
import { publish, CHANNELS } from '../utils/pubsub.js';
import { emitToAll } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { CORPORATE_ACTIONS as ACTIONS } from '../config/stockMarket.js';

const HOLDINGS_BATCH_SIZE = 500;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function money(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic fundamental valuation (no randomness).
 *
 * intrinsic = cash + (revenue × revenueMultiple) + real-estate assets − debt
 *
 * The revenue multiple is conservative and size-scaled, so the same company
 * state always produces the same intrinsic value. This is the anchor the
 * market price drifts toward; the market price itself retains volatility.
 */
export function computeFundamentalValue(company) {
  const revenueMultipleBySize = {
    startup: 3.0,
    small: 2.5,
    medium: 2.2,
    large: 2.0,
    corporation: 1.8,
  };
  const multiple = revenueMultipleBySize[company.size] || 2.2;
  const revenueValue = (company.revenue || 0) * multiple;
  // For IPO companies backed by a real-estate company, property assets count.
  const propertyValue = company._propertyValue || 0;
  const intrinsic = Math.max(0, (company.cash || 0) + revenueValue + propertyValue - (company.debt || 0));
  return intrinsic;
}

async function recordCorporateEvent(company, tick, type, severity, headline, description, metadata = {}) {
  try {
    await StockMarketEvent.create({
      companyId: company._id,
      tick,
      type,
      severity,
      headline,
      description,
      metadata,
    });
  } catch (err) {
    console.error(`[CORPORATE] Error recording ${type} event for ${company.ticker}:`, err.message);
  }
  publish(CHANNELS.PUBLIC_COMPANY_EVENT, {
    tick,
    events: [{ companyId: company._id, type, severity, headline, tick }],
  }).catch(() => {});
  emitToAll(SOCKET_EVENTS.PUBLIC_COMPANY_EVENT, {
    tickNumber: tick,
    events: [{ companyId: company._id, type, severity, headline }],
  });
}

/**
 * Capital raise via new share issuance. Server-authoritative and guarded:
 * a cooldown, a cash-thinness trigger, and a hard cumulative dilution cap
 * relative to the original float (enforced DB-side). Re-running the same tick
 * never re-issues because lastShareIssuanceTick is stamped atomically.
 */
export async function issueShares(company, currentTick) {
  if (!ACTIONS.issuance.enabled) return null;
  if (company.isIPO) return null; // IPO float is managed by its own lifecycle
  if (currentTick - (company.lastShareIssuanceTick || 0) < ACTIONS.issuance.cooldownTicks) return null;

  const revenue = company.revenue || 1;
  if ((company.cash || 0) >= revenue * ACTIONS.issuance.minCashToRevenueRatio) return null;

  // Legacy companies without a recorded initial float: freeze the current
  // share count as the baseline before any issuance (one-time, safe backfill).
  if (!company.initialSharesOutstanding) {
    await Company.updateOne(
      { _id: company._id, initialSharesOutstanding: null },
      { $set: { initialSharesOutstanding: company.sharesOutstanding || 1 } },
    ).catch(() => {});
    company.initialSharesOutstanding = company.sharesOutstanding || 1;
  }

  const initial = company.initialSharesOutstanding || company.sharesOutstanding;
  const newShares = Math.max(
    1,
    Math.round((company.sharesOutstanding || 0) * ACTIONS.issuance.issueSizePctOfOutstanding),
  );
  const issuePrice = Math.max(0.01, money((company.sharePrice || 0) * ACTIONS.issuance.issuePriceDiscount));
  const proceeds = Math.round(newShares * issuePrice);
  if (proceeds <= 0) return null;

  // The DB-level guard enforces the cumulative dilution cap exactly (the new
  // shares must fit entirely within the cap), and the cooldown makes the
  // action idempotent against concurrent/retried runs.
  const maxCumulativeIssued = initial * ACTIONS.issuance.maxCumulativeIssuancePctOfInitial;
  const updated = await Company.findOneAndUpdate(
    {
      _id: company._id,
      lastShareIssuanceTick: { $lte: currentTick - ACTIONS.issuance.cooldownTicks },
      isIPO: { $ne: true },
      $expr: {
        $lte: [
          {
            $add: [
              { $subtract: ['$sharesOutstanding', { $ifNull: ['$initialSharesOutstanding', '$sharesOutstanding'] }] },
              newShares,
            ],
          },
          maxCumulativeIssued,
        ],
      },
    },
    {
      $inc: { sharesOutstanding: newShares, cash: proceeds, capitalRaised: proceeds },
      $set: { lastShareIssuanceTick: currentTick },
    },
    { new: true },
  );
  if (!updated) return null; // concurrent/retried run already issued this cycle

  await recordCorporateEvent(
    updated,
    currentTick,
    'share_issuance',
    'positive',
    `${updated.ticker} raised $${proceeds.toLocaleString()} by issuing ${newShares.toLocaleString()} new shares`,
    `${updated.name} issued ${newShares.toLocaleString()} new shares at $${issuePrice.toFixed(2)} each, raising $${proceeds.toLocaleString()}. Existing shareholders are diluted proportionally.`,
    { sharesIssued: newShares, issuePrice, proceeds },
  );

  return { sharesIssued: newShares, issuePrice, proceeds, sharesOutstanding: updated.sharesOutstanding };
}

/**
 * Share buyback. Treasury cash pays market price (+ small premium) to retire
 * shares; the share count falls and every holder's ownership percentage rises.
 * Guarded by cooldown, cash requirements, and a post-buyback cash floor.
 */
export async function executeBuyback(company, currentTick) {
  if (!ACTIONS.buyback.enabled) return null;
  if (company.isIPO) return null;
  if (currentTick - (company.lastBuybackTick || 0) < ACTIONS.buyback.cooldownTicks) return null;

  const revenue = company.revenue || 1;
  const cash = company.cash || 0;
  if (cash < revenue * ACTIONS.buyback.minCashToRevenueRatio) return null;

  const buyShares = Math.max(1, Math.round((company.sharesOutstanding || 0) * ACTIONS.buyback.buybackPctOfOutstanding));
  const cost = Math.round(buyShares * (company.sharePrice || 0) * ACTIONS.buyback.pricePremium);
  if (cost <= 0) return null;
  if (cash - cost < revenue * ACTIONS.buyback.minCashToRevenueAfterRatio) return null;
  if ((company.sharesOutstanding || 0) - buyShares < 1) return null;

  const updated = await Company.findOneAndUpdate(
    {
      _id: company._id,
      lastBuybackTick: { $lte: currentTick - ACTIONS.buyback.cooldownTicks },
      isIPO: { $ne: true },
      sharesOutstanding: { $gte: buyShares + 1 },
      $expr: {
        $and: [
          {
            $gte: [
              { $subtract: ['$cash', cost] },
              { $multiply: ['$revenue', ACTIONS.buyback.minCashToRevenueAfterRatio] },
            ],
          },
        ],
      },
    },
    {
      $inc: { cash: -cost, sharesOutstanding: -buyShares, sharesBoughtBack: buyShares },
      $set: { lastBuybackTick: currentTick },
    },
    { new: true },
  );
  if (!updated) return null;

  await recordCorporateEvent(
    updated,
    currentTick,
    'buyback',
    'positive',
    `${updated.ticker} bought back ${buyShares.toLocaleString()} shares for $${cost.toLocaleString()}`,
    `${updated.name} repurchased ${buyShares.toLocaleString()} shares at $${money(company.sharePrice * ACTIONS.buyback.pricePremium).toFixed(2)} each, reducing shares outstanding to ${updated.sharesOutstanding.toLocaleString()}.`,
    { sharesBoughtBack: buyShares, cost, price: money(company.sharePrice * ACTIONS.buyback.pricePremium) },
  );

  return { sharesBoughtBack: buyShares, cost, sharesOutstanding: updated.sharesOutstanding };
}

/**
 * Stock split / reverse split. Multiplies (or divides) the share count and
 * inversely scales the price so total holder value is unchanged. Historical
 * price series, 52-week range, IPO reference price and holdings are rebased
 * so splits never create fake gains/losses. Fractional shares from a reverse
 * split are compensated in cash at the post-split price (never silently
 * deleted).
 */
export async function executeStockSplit(company, currentTick, ratio) {
  if (!ACTIONS.splits.enabled) return null;
  if (currentTick - (company.lastSplitTick || 0) < ACTIONS.splits.cooldownTicks) return null;
  if (ratio <= 0) return null;

  const forward = ratio > 1;
  const reverse = ratio < 1;
  if (!forward && !reverse) return null;

  const newShares = Math.max(1, Math.round((company.sharesOutstanding || 0) * ratio));
  if (newShares === (company.sharesOutstanding || 0)) return null;

  const newPrice = Math.max(0.01, money((company.sharePrice || 0) / ratio));
  const priceScale = newPrice / Math.max(0.01, company.sharePrice || 0.01);
  const ipoPrice = (company.ipoPrice || company.sharePrice || 0) > 0 ? money((company.ipoPrice || 0) / ratio) : 0;
  const high52Week = (company.high52Week || 0) > 0 ? money((company.high52Week || 0) / ratio) : 0;
  const low52Week = (company.low52Week || 0) > 0 ? money((company.low52Week || 0) / ratio) : 0;

  const updated = await Company.findOneAndUpdate(
    {
      _id: company._id,
      lastSplitTick: { $lte: currentTick - ACTIONS.splits.cooldownTicks },
    },
    {
      $set: {
        sharesOutstanding: newShares,
        sharePrice: newPrice,
        previousSharePrice: newPrice,
        ipoPrice: ipoPrice || undefined,
        high52Week,
        low52Week,
        lastSplitTick: currentTick,
        dayChange: 0,
        dayChangePercent: 0,
        // Rebase performance history so charts/returns don't show a fake crash/spike.
        // (Explicit field extraction: spreading mongoose subdocs would leak
        // internal `_doc` state and shadow the rebased price.)
        performance: (company.performance || []).map((p) => ({
          tick: p.tick,
          price: money(p.price * priceScale),
        })),
        marketCap: Math.round(newShares * newPrice),
      },
    },
    { new: true },
  );
  if (!updated) return null;

  // Rebase every holding and compensate fractional remainder (reverse splits).
  let skip = 0;
  let hasMore = true;
  const compensationOps = [];
  while (hasMore) {
    const holdings = await StockHolding.find({ companyId: company._id, shares: { $gt: 0 } })
      .skip(skip)
      .limit(HOLDINGS_BATCH_SIZE)
      .lean();
    if (holdings.length === 0) {
      break;
    }
    const bulkOps = [];
    for (const h of holdings) {
      const scaled = h.shares * ratio;
      const whole = Math.floor(scaled);
      const fraction = scaled - whole;
      if (fraction > 0 && forward) {
        // Forward split fractions are still integer-friendly; keep as-is.
        bulkOps.push({
          updateOne: {
            filter: { _id: h._id },
            update: { $set: { shares: scaled } },
          },
        });
        continue;
      }
      if (fraction > 0 && reverse) {
        // Pay cash for the fractional remainder at the post-split price.
        const compensation = money(fraction * newPrice);
        compensationOps.push({ userId: h.userId, amount: compensation });
      }
      bulkOps.push({
        updateOne: {
          filter: { _id: h._id },
          update: { $set: { shares: Math.max(0, whole) } },
        },
      });
    }
    await StockHolding.bulkWrite(bulkOps);
    skip += HOLDINGS_BATCH_SIZE;
  }

  if (compensationOps.length > 0) {
    const userOps = new Map();
    for (const c of compensationOps) {
      userOps.set(c.userId.toString(), (userOps.get(c.userId.toString()) || 0) + c.amount);
    }
    const bulkOps = [];
    for (const [userId, amount] of userOps) {
      if (amount > 0) {
        bulkOps.push({ updateOne: { filter: { _id: userId }, update: { $inc: { balance: money(amount) } } } });
      }
    }
    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }
  }

  await recordCorporateEvent(
    updated,
    currentTick,
    forward ? 'stock_split' : 'reverse_split',
    'info',
    forward
      ? `${updated.ticker} completed a ${ratio}:1 stock split`
      : `${updated.ticker} completed a 1:${Math.round(1 / ratio)} reverse stock split`,
    forward
      ? `${updated.name} split its shares ${ratio}:1 — share price adjusted from $${company.sharePrice.toFixed(2)} to $${newPrice.toFixed(2)}.`
      : `${updated.name} completed a reverse split — share price adjusted from $${company.sharePrice.toFixed(2)} to $${newPrice.toFixed(2)}.`,
    { ratio, sharesOutstanding: newShares, price: newPrice },
  );

  return { ratio, sharesOutstanding: newShares, price: newPrice, cashCompensated: compensationOps.length };
}

/**
 * Per-tick corporate action pass for non-IPO companies. Runs after financials
 * are updated so fundamentals are current, and before the market price is
 * finalized for the tick (splits rebase the price; issuance/buyback change
 * the share count used for market cap).
 */
export async function processCorporateActions(company, currentTick) {
  const results = { issuance: null, buyback: null, split: null };

  const price = company.sharePrice || 0;
  if (ACTIONS.splits.enabled) {
    if (price >= ACTIONS.splits.forwardPriceThreshold) {
      results.split = await executeStockSplit(company, currentTick, ACTIONS.splits.forwardRatio);
    } else if (price <= ACTIONS.splits.reversePriceThreshold) {
      results.split = await executeStockSplit(company, currentTick, ACTIONS.splits.reverseRatio);
    }
  }

  results.issuance = await issueShares(company, currentTick);
  results.buyback = await executeBuyback(company, currentTick);

  return results;
}

export { clamp, money };
