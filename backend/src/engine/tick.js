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
import { processPropertyManagement } from './propertyManagement.js';
import { updateCreditScores } from './creditScore.js';
import { updateIntrinsicValues } from './propertyValuation.js';
import {
  computeLeaderboards,
  updateCompetitiveEventProgress,
  finalizeExpiredEvents,
  generateCompetitiveEvents,
} from './leaderboard.js';
import Event from '../models/Event.js';
import { incrementTick } from '../models/GameState.js';
import { endCurrentSeasonAndStartNew } from './seasonReset.js';
import { sendDiscordNotification } from '../services/discordBot.js';

export async function executeTick() {
  const startTime = Date.now();
  console.log('[TICK] Starting world tick...');

  try {
    const tickNumber = await incrementTick();
    console.log(`[TICK] Tick #${tickNumber}`);

    const activeEvents = await Event.find({ active: true });

    console.log('[TICK] Simulating cities...');
    const cityResults = await simulateCities(activeEvents);

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

    console.log('[TICK] Computing leaderboards...');
    const leaderboardSnapshots = await computeLeaderboards(tickNumber);

    console.log('[TICK] Updating competitive event progress...');
    await updateCompetitiveEventProgress(tickNumber);

    console.log('[TICK] Finalizing expired events...');
    const finalizedEvents = await finalizeExpiredEvents(tickNumber);

    console.log('[TICK] Generating competitive events...');
    const newCompEvents = await generateCompetitiveEvents(tickNumber);

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
    console.log(`[TICK] New events: ${newEvents.length}`);
    console.log(`[TICK] Expired events: ${expiredEvents.length}`);
    console.log(`[TICK] Expired uncollected rent: ${expiredRentCount} users`);
    console.log(`[TICK] Rent expiry warnings sent: ${rentWarningsCount} users`);
    console.log(`[TICK] Leaderboard snapshots computed: ${leaderboardSnapshots.length}`);
    console.log(`[TICK] Events finalized: ${finalizedEvents.length}`);
    console.log(`[TICK] New competitive events: ${newCompEvents.length}`);

    if (tickNumber >= 720) {
      console.log(`[TICK] Tick #${tickNumber} reached 720 — ending season`);
      const newSeason = await endCurrentSeasonAndStartNew();
      console.log(`[TICK] Season ended. New season: ${newSeason.number}`);
    }

    return {
      tickNumber,
      duration,
      cities: cityResults,
      demographics: demoResults,
      stockMarket: stockResults,
      priceUpdates: priceUpdates.length,
      rentProcessed: rentResults.length,
      loansProcessed: loanResults.length,
      constructionProcessed: constructionResults.length,
      improvementsProcessed: improvementResults.length,
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
