import { simulateCities } from './citySimulation.js';
import { simulateDemographics } from './demographics.js';
import { simulateStockMarket } from './stockMarket.js';
import { simulateIndexes } from './indexSimulation.js';
import { updatePrices } from './priceUpdate.js';
import { processRent, expireUncollectedRent, sendRentExpiryWarnings } from './rentProcessing.js';
import { processLoans } from './loanProcessing.js';
import { balanceMarket } from './marketBalancing.js';
import { generateProperties } from './propertyGeneration.js';
import { generateEvents, tickEvents } from './events.js';
import { processConstruction } from './constructionProcessing.js';
import { processImprovements } from './improvementProcessing.js';
import { processPropertyRisks } from './propertyRisk.js';
import { processPropertyManagement } from './propertyManagement.js';
import { updateCreditScores } from './creditScore.js';
import { updateIntrinsicValues } from './propertyValuation.js';
import {
  computeLeaderboards,
  updateCompetitiveEventProgress,
  finalizeExpiredEvents,
  generateCompetitiveEvents,
  activateUpcomingEvents,
  cleanupExpiredCompletedEvents,
} from './leaderboard.js';
import Event from '../models/Event.js';
import { incrementTick } from '../models/GameState.js';
import { endCurrentSeasonAndStartNew } from './seasonReset.js';
import { sendDiscordNotification } from '../services/discordBot.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Loan from '../models/Loan.js';
import ConstructionProject from '../models/ConstructionProject.js';
import {
  processCompanyRent,
  processCompanyPayroll,
  processCompanyLoans,
  processCompanyLevelUp,
  processCompanyLoanRequests,
  processCompanyDevelopmentRequests,
  processCompanyPropertyPurchaseRequests,
  pruneCompanyTreasuryTransactions,
} from './companyProcessing.js';
import { invalidateLeaderboardCache } from '../routes/leaderboards.js';
import { cacheDelPattern, cacheDel } from '../utils/cache.js';
import { cacheKeys } from '../utils/cacheKeys.js';
import { invalidateCompetitiveEvents } from '../utils/cacheInvalidation.js';
import { publish, CHANNELS } from '../utils/pubsub.js';
import { emitToAll } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import {
  generateCityContracts,
  processCityContracts,
  processContractProposals,
  expireAvailableContracts,
} from './cityContracts.js';
import { generateInvestmentOpportunities, processCompanyInvestments } from './treasuryInvestments.js';
import { simulateDistricts } from './districtSimulation.js';
import { evaluateExpiredReports } from './marketIntelligence.js';
import { processAuctions, generateBankAuctions } from './auctionProcessing.js';
import { processMissionReset } from './missionProcessing.js';
import { processPublicCompanies } from './publicCompanyProcessing.js';

export async function executeTick() {
  const startTime = Date.now();
  console.log('[TICK] Starting world tick...');

  try {
    const tickNumber = await incrementTick();
    global.currentTick = tickNumber;

    const auctionResults = await processAuctions();

    const newBankAuctions = await generateBankAuctions();

    const activeEvents = await Event.find({ active: true });

    const cityResults = await simulateCities(activeEvents);

    const districtResults = await simulateDistricts();

    const demoResults = await simulateDemographics(tickNumber);

    const stockResults = await simulateStockMarket(tickNumber);

    const indexResults = await simulateIndexes(tickNumber);

    const intrinsicCount = await updateIntrinsicValues();

    const priceUpdates = await updatePrices(activeEvents);

    const rentResults = await processRent();

    await processPropertyManagement(tickNumber);

    const loanResults = await processLoans();

    const creditResults = await updateCreditScores(tickNumber);

    await balanceMarket();

    const constructionResults = await processConstruction();

    const improvementResults = await processImprovements();

    const riskResults = await processPropertyRisks(tickNumber);

    const expiredEvents = await tickEvents();

    const propertyGeneration = await generateProperties();

    const newEvents = await generateEvents();

    if (
      newEvents.length > 0 ||
      constructionResults.some((r) => r.status === 'completed') ||
      improvementResults.some((r) => r.status === 'completed')
    ) {
      const fields = [];
      if (newEvents.length > 0) {
        fields.push({ name: 'New Events', value: String(newEvents.length), inline: true });
      }
      const completedConstruction = constructionResults.filter((r) => r.status === 'completed').length;
      if (completedConstruction > 0) {
        fields.push({ name: 'Construction Complete', value: String(completedConstruction), inline: true });
      }
      const completedImprovements = improvementResults.filter((r) => r.status === 'completed').length;
      if (completedImprovements > 0) {
        fields.push({ name: 'Improvements Complete', value: String(completedImprovements), inline: true });
      }

      sendDiscordNotification({
        type: 'systemAlerts',
        title: `Tick #${tickNumber} Summary`,
        description: 'World simulation cycle completed.',
        fields,
      }).catch(() => {});
    }

    const expiredRentCount = await expireUncollectedRent();

    const rentWarningsCount = await sendRentExpiryWarnings();

    const companyRentResults = await processCompanyRent(tickNumber);

    const payrollResults = await processCompanyPayroll(tickNumber);

    const companyLoanResults = await processCompanyLoans(tickNumber);

    const loanRequestResults = await processCompanyLoanRequests(tickNumber);

    const devRequestResults = await processCompanyDevelopmentRequests(tickNumber);

    const propertyPurchaseResults = await processCompanyPropertyPurchaseRequests(tickNumber);

    const companyLevelUps = await processCompanyLevelUp(tickNumber);

    const prunedTransactions = await pruneCompanyTreasuryTransactions(tickNumber);

    const newContracts = await generateCityContracts(tickNumber);

    const contractResults = await processCityContracts(tickNumber);

    const contractProposalResults = await processContractProposals(tickNumber);

    const expiredContracts = await expireAvailableContracts(tickNumber);

    const investmentOpportunities = await generateInvestmentOpportunities(tickNumber);

    const investmentResults = await processCompanyInvestments(tickNumber);

    const evaluatedReports = await evaluateExpiredReports(tickNumber);

    const missionResets = await processMissionReset();

    const publicCompanyResults = await processPublicCompanies(tickNumber);

    if (publicCompanyResults.length > 0) {
      emitToAll(SOCKET_EVENTS.PUBLIC_COMPANY_PRICES, {
        tickNumber,
        companies: publicCompanyResults.filter((r) => r.status === 'ok').map((r) => ({
          ticker: r.ticker,
          price: r.price,
          change: r.priceChange,
          volume: r.volume,
          shareholders: r.shareholders,
        })),
      });
    }

    const leaderboardSnapshots = await computeLeaderboards(tickNumber);

    const activatedEvents = await activateUpcomingEvents(tickNumber);

    await updateCompetitiveEventProgress(tickNumber);

    const finalizedEvents = await finalizeExpiredEvents(tickNumber);

    const cleanedUpEvents = await cleanupExpiredCompletedEvents(tickNumber);

    const newCompEvents = await generateCompetitiveEvents(tickNumber);

    if (activatedEvents.length > 0 || finalizedEvents.length > 0 || newCompEvents.length > 0 || cleanedUpEvents > 0) {
      await invalidateCompetitiveEvents();
    }

    const duration = Date.now() - startTime;
    console.log(`[TICK] World tick #${tickNumber} completed in ${duration}ms`);
    console.log(`  Cities simulated: ${cityResults.length}`);
    console.log(`  Demographics simulated: ${demoResults.length}`);
    console.log(`  Stock market: ${stockResults.length} companies updated`);
    console.log(`  Prices: ${priceUpdates.length} updated, Intrinsic values: ${intrinsicCount}`);
    console.log(`  Rent processed: ${rentResults.length}`);
    console.log(`  Loans processed: ${loanResults.length}`);
    console.log(`  Credit scores updated: ${creditResults.length}`);
    console.log(`  New properties generated: ${propertyGeneration.reduce((s, r) => s + r.generated, 0)}`);
    console.log(`  Construction: ${constructionResults.length}, Improvements: ${improvementResults.length}`);
    console.log(`  Company rent/loans: ${companyRentResults.length}/${companyLoanResults.length}`);
    console.log(`  Company level ups: ${companyLevelUps}, Treasury pruned: ${prunedTransactions}`);
    console.log(`  Contracts: ${newContracts} new, ${contractResults.length} processed`);
    console.log(`  Events: ${newEvents.length} new, ${expiredEvents.length} expired`);
    console.log(`  Expired rent: ${expiredRentCount} users, warnings sent: ${rentWarningsCount}`);
    console.log(`  Auctions: ${auctionResults.activated} activated, ${auctionResults.completed} completed`);
    console.log(`  Bank auctions generated: ${newBankAuctions.length}`);
    console.log(`  Public companies processed: ${publicCompanyResults.length}`);
    console.log(`  Leaderboard snapshots: ${leaderboardSnapshots.length}`);
    console.log(
      `  Competitive events: ${activatedEvents.length} activated, ${finalizedEvents.length} finalized, ${newCompEvents.length} new, ${cleanedUpEvents} cleaned`,
    );

    const deletedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const usersToDelete = await User.find({ deletedAt: { $ne: null, $lte: deletedCutoff } }).select('_id');
    if (usersToDelete.length > 0) {
      const userIds = usersToDelete.map((u) => u._id);
      await Property.updateMany({ ownerId: { $in: userIds } }, { $set: { ownerId: null, forSale: true } });
      await Loan.updateMany(
        { userId: { $in: userIds }, active: true },
        { $set: { active: false, remainingBalance: 0, ticksRemaining: 0 } },
      );
      await ConstructionProject.updateMany(
        { ownerId: { $in: userIds }, status: 'under_construction' },
        { $set: { status: 'cancelled' } },
      );
      const deletedResult = await User.deleteMany({ _id: { $in: userIds } });
      console.log(`[TICK] Permanently deleted ${deletedResult.deletedCount} accounts past 24h grace period`);
    }

    if (tickNumber >= 720) {
      console.log(`[TICK] Tick #${tickNumber} reached 720 — ending season`);
      const newSeason = await endCurrentSeasonAndStartNew();
      console.log(`[TICK] Season ended. New season: ${newSeason.number}`);
      await invalidateLeaderboardCache();
      await cacheDelPattern('cf:*');
    }

    await invalidateLeaderboardCache();
    await cacheDel(cacheKeys.tick());
    await cacheDel(cacheKeys.worldStatus());
    await cacheDel(cacheKeys.worldStats());
    await cacheDel(cacheKeys.activeEvents());
    await cacheDel(cacheKeys.cities());
    await cacheDelPattern('cf:district:*');
    await cacheDelPattern('cf:market:*');
    await cacheDelPattern('cf:mi:*');
    await cacheDelPattern('cf:auction*');
    await cacheDelPattern('cf:missions:*');
    await cacheDelPattern('cf:stats:*');
    await cacheDelPattern('cf:stocks:*');
    await publish(CHANNELS.TICK, { tickNumber, timestamp: new Date().toISOString() });
    emitToAll(SOCKET_EVENTS.TICK, { tickNumber, timestamp: new Date().toISOString() });

    return {
      tickNumber,
      duration,
      cities: cityResults,
      districts: districtResults,
      demographics: demoResults,
      stockMarket: stockResults,
      priceUpdates: priceUpdates.length,
      rentProcessed: rentResults.length,
      loansProcessed: loanResults.length,
      constructionProcessed: constructionResults.length,
      improvementsProcessed: improvementResults.length,
      propertiesAffectedByRisks: riskResults,
      newProperties: propertyGeneration,
      newEvents,
      expiredEvents,
      expiredRentCount,
      rentWarningsCount,
    };
  } catch (err) {
    console.error('[TICK] Error during tick:', err);
    throw err;
  }
}
