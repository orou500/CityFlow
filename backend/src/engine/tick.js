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
  processCompanyLoans,
  processCompanyLevelUp,
  processCompanyLoanRequests,
  processCompanyDevelopmentRequests,
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

export async function executeTick() {
  const startTime = Date.now();
  console.log('[TICK] Starting world tick...');

  try {
    const tickNumber = await incrementTick();
    global.currentTick = tickNumber;
    console.log(`[TICK] Tick #${tickNumber}`);

    console.log('[TICK] Processing auctions...');
    const auctionResults = await processAuctions();

    console.log('[TICK] Generating bank auctions...');
    const newBankAuctions = await generateBankAuctions();

    const activeEvents = await Event.find({ active: true });

    console.log('[TICK] Simulating cities...');
    const cityResults = await simulateCities(activeEvents);

    console.log('[TICK] Simulating districts...');
    const districtResults = await simulateDistricts();

    console.log('[TICK] Simulating demographics...');
    const demoResults = await simulateDemographics(tickNumber);

    console.log('[TICK] Simulating stock market...');
    const stockResults = await simulateStockMarket(tickNumber);

    console.log('[TICK] Simulating stock indexes...');
    const indexResults = await simulateIndexes(tickNumber);

    console.log('[TICK] Updating intrinsic property values...');
    const intrinsicCount = await updateIntrinsicValues();

    console.log('[TICK] Updating prices...');
    const priceUpdates = await updatePrices(activeEvents);

    console.log('[TICK] Processing rent...');
    const rentResults = await processRent();

    console.log('[TICK] Processing property management...');
    await processPropertyManagement(tickNumber);

    console.log('[TICK] Processing loans...');
    const loanResults = await processLoans();

    console.log('[TICK] Updating credit scores...');
    const creditResults = await updateCreditScores(tickNumber);

    console.log('[TICK] Balancing market...');
    await balanceMarket();

    console.log('[TICK] Processing construction...');
    const constructionResults = await processConstruction();

    console.log('[TICK] Processing improvements...');
    const improvementResults = await processImprovements();

    console.log('[TICK] Processing property risks...');
    const riskResults = await processPropertyRisks(tickNumber);

    console.log('[TICK] Processing event lifecycles...');
    const expiredEvents = await tickEvents();

    console.log('[TICK] Generating new properties...');
    const propertyGeneration = await generateProperties();

    console.log('[TICK] Generating new events...');
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

    console.log('[TICK] Expiring uncollected rent...');
    const expiredRentCount = await expireUncollectedRent();

    console.log('[TICK] Sending rent expiry warnings...');
    const rentWarningsCount = await sendRentExpiryWarnings();

    console.log('[TICK] Processing company rent...');
    const companyRentResults = await processCompanyRent(tickNumber);

    console.log('[TICK] Processing company loans...');
    const companyLoanResults = await processCompanyLoans(tickNumber);

    console.log('[TICK] Processing company loan requests...');
    const loanRequestResults = await processCompanyLoanRequests(tickNumber);

    console.log('[TICK] Processing company development requests...');
    const devRequestResults = await processCompanyDevelopmentRequests(tickNumber);

    console.log('[TICK] Processing company levels...');
    const companyLevelUps = await processCompanyLevelUp(tickNumber);

    console.log('[TICK] Pruning company treasury transactions...');
    const prunedTransactions = await pruneCompanyTreasuryTransactions(tickNumber);

    console.log('[TICK] Generating city contracts...');
    const newContracts = await generateCityContracts(tickNumber);

    console.log('[TICK] Processing city contracts...');
    const contractResults = await processCityContracts(tickNumber);

    console.log('[TICK] Processing contract proposals...');
    const contractProposalResults = await processContractProposals(tickNumber);

    console.log('[TICK] Expiring available contracts...');
    const expiredContracts = await expireAvailableContracts(tickNumber);

    console.log('[TICK] Generating investment opportunities...');
    const investmentOpportunities = await generateInvestmentOpportunities(tickNumber);

    console.log('[TICK] Processing company investments...');
    const investmentResults = await processCompanyInvestments(tickNumber);

    console.log('[TICK] Evaluating expired market reports...');
    const evaluatedReports = await evaluateExpiredReports(tickNumber);

    console.log('[TICK] Computing leaderboards...');
    const leaderboardSnapshots = await computeLeaderboards(tickNumber);

    console.log('[TICK] Activating upcoming events...');
    const activatedEvents = await activateUpcomingEvents(tickNumber);

    console.log('[TICK] Updating competitive event progress...');
    await updateCompetitiveEventProgress(tickNumber);

    console.log('[TICK] Finalizing expired events...');
    const finalizedEvents = await finalizeExpiredEvents(tickNumber);

    console.log('[TICK] Cleaning up old completed events...');
    const cleanedUpEvents = await cleanupExpiredCompletedEvents(tickNumber);

    console.log('[TICK] Generating competitive events...');
    const newCompEvents = await generateCompetitiveEvents(tickNumber);

    if (activatedEvents.length > 0 || finalizedEvents.length > 0 || newCompEvents.length > 0 || cleanedUpEvents > 0) {
      await invalidateCompetitiveEvents();
    }

    const duration = Date.now() - startTime;
    console.log(`[TICK] World tick #${tickNumber} completed in ${duration}ms`);
    console.log(`[TICK] Cities simulated: ${cityResults.length}`);
    console.log(`[TICK] Demographics simulated: ${demoResults.length}`);
    console.log(`[TICK] Stock market: ${stockResults.length} companies updated`);
    const stockEvents = stockResults.filter((r) => r.event).length;
    if (stockEvents > 0) console.log(`[TICK] Company events: ${stockEvents}`);
    console.log(`[TICK] Stock indexes: ${indexResults.length} indexes updated`);
    console.log(`[TICK] Prices updated: ${priceUpdates.length}`);
    console.log(`[TICK] Intrinsic values updated: ${intrinsicCount}`);
    console.log(`[TICK] Rent processed: ${rentResults.length}`);
    console.log(`[TICK] Loans processed: ${loanResults.length}`);
    console.log(`[TICK] Credit scores updated: ${creditResults.length}`);
    console.log(`[TICK] New properties: ${propertyGeneration.reduce((s, r) => s + r.generated, 0)}`);
    console.log(`[TICK] Construction processed: ${constructionResults.length}`);
    console.log(`[TICK] Improvements processed: ${improvementResults.length}`);
    console.log(`[TICK] Company rent processed: ${companyRentResults.length}`);
    console.log(`[TICK] Company loans processed: ${companyLoanResults.length}`);
    console.log(
      `[TICK] Company loan requests: ${loanRequestResults.autoVoted} auto-voted, ${loanRequestResults.autoExecuted} auto-executed, ${loanRequestResults.expired} expired`,
    );
    console.log(
      `[TICK] Company development requests: ${devRequestResults.autoVoted} auto-voted, ${devRequestResults.expired} expired`,
    );
    console.log(`[TICK] Company level ups: ${companyLevelUps}`);
    console.log(`[TICK] Pruned treasury transactions: ${prunedTransactions}`);
    console.log(`[TICK] New contracts generated: ${newContracts}`);
    console.log(`[TICK] Contracts processed: ${contractResults.length}`);
    console.log(
      `[TICK] Investment opportunities: ${investmentOpportunities.generated} generated, ${investmentOpportunities.expired} expired`,
    );
    console.log(`[TICK] Investments processed: ${investmentResults.length}`);
    console.log(
      `[TICK] Contract proposals: ${contractProposalResults.autoVoted} auto-voted, ${contractProposalResults.approved} approved, ${contractProposalResults.rejected} rejected, ${contractProposalResults.expired} expired`,
    );
    console.log(`[TICK] Expired available contracts: ${expiredContracts}`);
    console.log(`[TICK] New events: ${newEvents.length}`);
    console.log(`[TICK] Expired events: ${expiredEvents.length}`);
    console.log(`[TICK] Expired uncollected rent: ${expiredRentCount} users`);
    console.log(`[TICK] Rent expiry warnings sent: ${rentWarningsCount} users`);
    console.log(`[TICK] Leaderboard snapshots computed: ${leaderboardSnapshots.length}`);
    console.log(`[TICK] Events activated: ${activatedEvents.length}`);
    console.log(`[TICK] Events finalized: ${finalizedEvents.length}`);
    console.log(`[TICK] Completed events cleaned up: ${cleanedUpEvents}`);
    console.log(`[TICK] New competitive events: ${newCompEvents.length}`);
    console.log(`[TICK] Evaluated market reports: ${evaluatedReports}`);
    console.log(`[TICK] Auctions processed: ${auctionResults.activated} activated, ${auctionResults.completed} completed`);
    console.log(`[TICK] Bank auctions generated: ${newBankAuctions.length}`);

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
    await cacheDelPattern('cf:stats:*');
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
