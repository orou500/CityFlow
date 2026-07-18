import { simulateCities } from './citySimulation.js';
import { updatePrices } from './priceUpdate.js';
import { processRent, expireUncollectedRent, sendRentExpiryWarnings } from './rentProcessing.js';
import { processLoans } from './loanProcessing.js';
import { balanceMarket } from './marketBalancing.js';
import { generateProperties } from './propertyGeneration.js';
import { generateEvents, tickEvents } from './events.js';
import { processConstruction } from './constructionProcessing.js';
import { processImprovements } from './improvementProcessing.js';
import { processPropertyManagement } from './propertyManagement.js';
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

    console.log('[TICK] Updating prices...');
    const priceUpdates = await updatePrices(activeEvents);

    console.log('[TICK] Processing rent...');
    const rentResults = await processRent();

    console.log('[TICK] Processing property management...');
    await processPropertyManagement(tickNumber);

    console.log('[TICK] Processing loans...');
    const loanResults = await processLoans();

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

    const duration = Date.now() - startTime;
    console.log(`[TICK] World tick #${tickNumber} completed in ${duration}ms`);
    console.log(`[TICK] Cities simulated: ${cityResults.length}`);
    console.log(`[TICK] Prices updated: ${priceUpdates.length}`);
    console.log(`[TICK] Rent processed: ${rentResults.length}`);
    console.log(`[TICK] Loans processed: ${loanResults.length}`);
    console.log(`[TICK] New properties: ${propertyGeneration.reduce((s, r) => s + r.generated, 0)}`);
    console.log(`[TICK] Construction processed: ${constructionResults.length}`);
    console.log(`[TICK] Improvements processed: ${improvementResults.length}`);
    console.log(`[TICK] New events: ${newEvents.length}`);
    console.log(`[TICK] Expired events: ${expiredEvents.length}`);
    console.log(`[TICK] Expired uncollected rent: ${expiredRentCount} users`);
    console.log(`[TICK] Rent expiry warnings sent: ${rentWarningsCount} users`);

    if (tickNumber >= 720) {
      console.log(`[TICK] Tick #${tickNumber} reached 720 — ending season`);
      const newSeason = await endCurrentSeasonAndStartNew();
      console.log(`[TICK] Season ended. New season: ${newSeason.number}`);
    }

    return {
      tickNumber,
      duration,
      cities: cityResults,
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
