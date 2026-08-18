import Company from '../models/Company.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import StockHolding from '../models/StockHolding.js';
import StockMarketEvent from '../models/StockMarketEvent.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import { publish, CHANNELS } from '../utils/pubsub.js';
import { emitToAll } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { bulkCreateNotifications } from '../utils/notificationQueue.js';

const DIVIDEND_SHARE_RATIO = 0.3;
const PROFIT_MARGIN = 0.15;
const RENT_MULTIPLIER_FOR_REVENUE = 2;
const DIVIDEND_YIELD_ANNUALIZED_TICKS = 48;
const PERFORMANCE_MAX_ENTRIES = 720;
const VOLUME_HISTORY_MAX = 48;
const HOLDINGS_BATCH_SIZE = 500;
const VOLATILITY_LARGE = 0.02;
const VOLATILITY_MEDIUM = 0.035;
const VOLATILITY_SMALL = 0.05;

function getVolatility(marketCap) {
  if (marketCap >= 50_000_000) return VOLATILITY_LARGE;
  if (marketCap >= 10_000_000) return VOLATILITY_MEDIUM;
  return VOLATILITY_SMALL;
}

export async function processPublicCompanies(tickNumber) {
  const publicCompanies = await Company.find({ isIPO: true, active: true }).lean();

  if (publicCompanies.length === 0) return [];

  const results = [];
  const priceUpdates = [];
  const dividendEvents = [];
  const marketEvents = [];

  for (const stockCompany of publicCompanies) {
    try {
      const reCompany = await RealEstateCompany.findById(stockCompany.realEstateCompanyId);
      if (!reCompany) {
        await Company.updateOne({ _id: stockCompany._id }, { $set: { active: false } });
        const delistEvent = {
          companyId: stockCompany._id,
          tick: tickNumber,
          type: 'delisting',
          severity: 'negative',
          headline: `${stockCompany.ticker} has been delisted`,
          description: `${stockCompany.name} (${stockCompany.ticker}) was delisted because the underlying real estate company no longer exists.`,
        };
        StockMarketEvent.create(delistEvent).catch(() => {});
        emitToAll(SOCKET_EVENTS.PUBLIC_COMPANY_DELISTING, {
          companyId: stockCompany._id,
          ticker: stockCompany.ticker,
          name: stockCompany.name,
          reason: 'no_re_company',
        });
        results.push({ ticker: stockCompany.ticker, status: 'delisted_no_re_company' });
        continue;
      }

      const properties = await Property.find({ companyId: reCompany._id }).lean();
      const propertyValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);

      const activeLoans = await Loan.find({ companyId: reCompany._id, active: true }).lean();
      const totalDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);

      const treasury = reCompany.treasury?.balance || 0;
      const annualRent = reCompany.stats?.totalRentalIncome || 0;
      const revenue = annualRent * RENT_MULTIPLIER_FOR_REVENUE;
      const profit = revenue * PROFIT_MARGIN;

      const netWorth = propertyValue + treasury - totalDebt;
      const debtRatio = netWorth > 0 ? totalDebt / netWorth : 0;

      const sharesOutstanding = stockCompany.sharesOutstanding || 1;
      const previousPrice = stockCompany.sharePrice;

      const intrinsicValue = Math.max(1, Math.round(propertyValue * 1.5 + treasury + annualRent * 2 - totalDebt * 0.8));
      const intrinsicPerShare = intrinsicValue / sharesOutstanding;

      const dividendBoost = (stockCompany.dividendYield || 0) > 0 ? 0.005 : -0.002;
      const growthBoost = ((stockCompany.totalReturn || 0) / 100) * 0.02;
      const debtPenalty = debtRatio > 0.5 ? -0.01 * (debtRatio - 0.5) * 5 : 0;

      const driftTowardIntrinsic = (intrinsicPerShare - previousPrice) / Math.max(previousPrice, 1);
      const normalizedDrift = Math.tanh(driftTowardIntrinsic / 5) * 0.06;

      const vol = getVolatility(stockCompany.marketCap || 0);
      const randomWalk = (Math.random() - 0.5) * 2 * vol;

      const resilience = previousPrice > 1 ? 1 / (1 + Math.abs(normalizedDrift) * 3) : 1;
      const priceChange =
        previousPrice * (normalizedDrift + dividendBoost + growthBoost + debtPenalty + randomWalk * resilience);
      const newPrice = Math.max(0.01, Math.round((previousPrice + priceChange) * 100) / 100);

      const currentShareholders = await StockHolding.countDocuments({
        companyId: stockCompany._id,
        shares: { $gt: 0 },
      });
      const totalHeldShares = stockCompany.totalSharesHeld || 0;

      const volumeFromTrades = stockCompany.tradingVolume || 0;

      const previousPriceBeforeUpdate = stockCompany.sharePrice;
      const dayChange = Math.round((newPrice - previousPriceBeforeUpdate) * 100) / 100;
      const dayChangePercent =
        previousPriceBeforeUpdate > 0
          ? Math.round(((newPrice - previousPriceBeforeUpdate) / previousPriceBeforeUpdate) * 10000) / 100
          : 0;

      const ipoPrice = stockCompany.ipoPrice || stockCompany.sharePrice;
      const totalReturn = ipoPrice > 0 ? Math.round(((newPrice - ipoPrice) / ipoPrice) * 10000) / 100 : 0;

      const performanceEntry = {
        tick: tickNumber,
        price: newPrice,
        employees: stockCompany.employees,
        revenue: stockCompany.revenue,
        marketCap: Math.round(newPrice * sharesOutstanding),
      };

      const high52Week = newPrice > stockCompany.high52Week ? newPrice : stockCompany.high52Week;
      const low52Week =
        stockCompany.low52Week === 0 || newPrice < stockCompany.low52Week ? newPrice : stockCompany.low52Week;

      let dividendPerShare = 0;
      let actualDividendDistributed = 0;
      if (profit > 0 && sharesOutstanding > 0) {
        const totalDividendPool = Math.floor(profit * DIVIDEND_SHARE_RATIO);
        const perShare = Math.round((totalDividendPool / sharesOutstanding) * 100) / 100;

        if (perShare > 0) {
          dividendPerShare = perShare;

          let skip = 0;
          let hasMore = true;
          while (hasMore) {
            const holdings = await StockHolding.find({ companyId: stockCompany._id, shares: { $gt: 0 } })
              .skip(skip)
              .limit(HOLDINGS_BATCH_SIZE)
              .lean();
            if (holdings.length === 0) {
              hasMore = false;
              break;
            }
            const bulkOps = [];
            const notificationItems = [];
            for (const h of holdings) {
              const amount = Math.round(perShare * h.shares * 100) / 100;
              actualDividendDistributed += amount;
              bulkOps.push({
                updateOne: {
                  filter: { _id: h._id },
                  update: { $inc: { unclaimedDividends: amount } },
                },
              });
              if (amount > 0) {
                // One notification per (user, company, dividend tick); the
                // unique (userId, eventKey) index dedupes re-runs.
                notificationItems.push({
                  userId: h.userId,
                  type: 'dividend',
                  title: `Dividend received from ${stockCompany.name}`,
                  message: `You received a $${amount.toLocaleString()} dividend from ${stockCompany.name}.`,
                  eventKey: `dividend:${stockCompany._id}:${tickNumber}:${h.userId}`,
                  route: `/company/${stockCompany._id}`,
                  entityType: 'company',
                  entityId: stockCompany._id,
                  relatedId: stockCompany._id,
                  amount,
                  companyName: stockCompany.name,
                  global: false,
                });
              }
            }
            await StockHolding.bulkWrite(bulkOps);
            if (notificationItems.length > 0) {
              await bulkCreateNotifications(notificationItems);
            }
            dividendEvents.push({
              companyId: stockCompany._id,
              ticker: stockCompany.ticker,
              perShare,
              holdersInBatch: holdings.length,
            });
            skip += HOLDINGS_BATCH_SIZE;
          }

          actualDividendDistributed = Math.round(actualDividendDistributed * 100) / 100;

          reCompany.ipo.dividendsPaid = (reCompany.ipo.dividendsPaid || 0) + actualDividendDistributed;
          reCompany.ipo.lastDividendPerShare = perShare;
          reCompany.ipo.lastDividendTick = tickNumber;
          await reCompany.save();

          marketEvents.push({
            companyId: stockCompany._id,
            tick: tickNumber,
            type: 'dividend_paid',
            severity: 'positive',
            headline: `${stockCompany.ticker} paid $${perShare.toFixed(2)} per share dividend`,
            description: `${stockCompany.name} distributed $${actualDividendDistributed.toLocaleString()} in dividends to shareholders.`,
            metadata: { perShare, totalPool: actualDividendDistributed },
          });
        }
      }

      if (newPrice > stockCompany.high52Week) {
        marketEvents.push({
          companyId: stockCompany._id,
          tick: tickNumber,
          type: 'all_time_high',
          severity: 'positive',
          headline: `${stockCompany.ticker} reached an all-time high of $${newPrice.toFixed(2)}`,
          description: `${stockCompany.name} hit a new 52-week high of $${newPrice.toFixed(2)}, up ${totalReturn}% since IPO.`,
          metadata: { price: newPrice, previousHigh: stockCompany.high52Week },
        });
      }

      if (dayChangePercent >= 10) {
        marketEvents.push({
          companyId: stockCompany._id,
          tick: tickNumber,
          type: 'price_surge',
          severity: 'positive',
          headline: `${stockCompany.ticker} surged ${dayChangePercent}% in a single tick`,
          description: `${stockCompany.name} shares jumped ${dayChangePercent}% to $${newPrice.toFixed(2)}.`,
          metadata: { change: dayChangePercent, price: newPrice },
        });
      } else if (dayChangePercent <= -10) {
        marketEvents.push({
          companyId: stockCompany._id,
          tick: tickNumber,
          type: 'price_drop',
          severity: 'negative',
          headline: `${stockCompany.ticker} dropped ${Math.abs(dayChangePercent)}% in a single tick`,
          description: `${stockCompany.name} shares fell ${Math.abs(dayChangePercent)}% to $${newPrice.toFixed(2)}.`,
          metadata: { change: dayChangePercent, price: newPrice },
        });
      }

      const previousVolHistory = stockCompany.volumeHistory || [];
      const avgDailyVolume =
        previousVolHistory.length > 0
          ? Math.round(
              previousVolHistory.slice(-4).reduce((s, e) => s + e.volume, 0) / Math.min(previousVolHistory.length, 4),
            )
          : 0;
      const weeklyVolume = previousVolHistory.slice(-28).reduce((s, e) => s + e.volume, 0);
      const monthlyVolume = previousVolHistory.reduce((s, e) => s + e.volume, 0);

      const updateFields = {
        sharePrice: newPrice,
        previousSharePrice: previousPriceBeforeUpdate,
        marketCap: Math.round(newPrice * sharesOutstanding),
        dayChange,
        dayChangePercent,
        totalReturn,
        high52Week,
        low52Week,
        revenue: Math.round(Math.max(revenue * 12, 10000)),
        employees: reCompany.members.length * 10,
        dividendPerShare,
        dividendYield:
          newPrice > 0 && dividendPerShare > 0
            ? Math.round(((dividendPerShare * DIVIDEND_YIELD_ANNUALIZED_TICKS) / newPrice) * 10000) / 100
            : 0,
        totalDividendsPaid:
          dividendPerShare > 0
            ? stockCompany.totalDividendsPaid + actualDividendDistributed
            : stockCompany.totalDividendsPaid,
        lastDividendTick: dividendPerShare > 0 ? tickNumber : stockCompany.lastDividendTick,
        activeShareholders: currentShareholders,
        floatPercentage:
          sharesOutstanding > 0
            ? Math.round(((sharesOutstanding - totalHeldShares) / sharesOutstanding) * 10000) / 100
            : 100,
        tradingVolume: 0,
        totalTrades: stockCompany.totalTrades || 0,
        avgDailyVolume,
        weeklyVolume,
        monthlyVolume,
      };

      if (volumeFromTrades > 0) {
        const updatedVolHistory = [
          ...previousVolHistory,
          { tick: tickNumber, volume: volumeFromTrades, trades: stockCompany.totalTrades || 0 },
        ].slice(-VOLUME_HISTORY_MAX);
        updateFields.volumeHistory = updatedVolHistory;
      }

      await Company.updateOne(
        { _id: stockCompany._id },
        {
          $set: updateFields,
          $push: {
            performance: {
              $each: [performanceEntry],
              $slice: -PERFORMANCE_MAX_ENTRIES,
            },
          },
        },
      );

      priceUpdates.push({
        companyId: stockCompany._id,
        ticker: stockCompany.ticker,
        price: newPrice,
        change: dayChangePercent,
        marketCap: updateFields.marketCap,
        dividendYield: updateFields.dividendYield,
        volume: volumeFromTrades,
        shareholders: currentShareholders,
      });

      results.push({
        ticker: stockCompany.ticker,
        price: newPrice,
        priceChange: Math.round(priceChange * 100) / 100,
        dividendPerShare,
        volume: volumeFromTrades,
        shareholders: currentShareholders,
        status: 'ok',
      });
    } catch (err) {
      console.error(`[PublicCompany] Error processing ${stockCompany.ticker}:`, err);
      results.push({ ticker: stockCompany.ticker, status: 'error', error: err.message });
    }
  }

  if (marketEvents.length > 0) {
    try {
      await StockMarketEvent.insertMany(marketEvents);
    } catch (err) {
      console.error('[PublicCompany] Error saving market events:', err);
    }
    const eventSummaries = marketEvents.map((e) => ({
      companyId: e.companyId,
      type: e.type,
      severity: e.severity,
      headline: e.headline,
      tick: e.tick,
    }));
    publish(CHANNELS.PUBLIC_COMPANY_EVENT, { tick: tickNumber, events: eventSummaries }).catch(() => {});
    emitToAll(SOCKET_EVENTS.PUBLIC_COMPANY_EVENT, { tickNumber, events: eventSummaries });
  }

  if (priceUpdates.length > 0) {
    publish(CHANNELS.PUBLIC_COMPANY_PRICES, { tick: tickNumber, updates: priceUpdates }).catch(() => {});
  }
  if (dividendEvents.length > 0) {
    publish(CHANNELS.PUBLIC_COMPANY_DIVIDENDS, { tick: tickNumber, dividends: dividendEvents }).catch(() => {});
  }

  return results;
}
