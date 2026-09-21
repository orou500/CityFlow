import Property from '../models/Property.js';
import City from '../models/City.js';
import RealEstateCompany from '../models/RealEstateCompany.js';
import { getTickNumber } from '../models/GameState.js';
import { getAllProjects, calculateUnitRent } from '../config/developmentProjects.js';
import { clampMonthlyRent, calculateMaximumRent } from '../config/propertyManagement.js';
import { enqueueNotification, bulkCreateNotifications } from '../utils/notificationQueue.js';
import { invalidateProperty } from '../utils/cacheInvalidation.js';
import { triggerMissionProgress } from '../utils/missionTrigger.js';
import { sendDiscordNotification } from '../services/discordBot.js';

/**
 * Property Demolition & Redevelopment — completion engine.
 *
 * Completion is server-authoritative and tick-driven (matching the game's
 * "all time is tick time" rule): a redevelopment finishes at its scheduled
 * `completionTick`, exactly like ConstructionProject rows. The tick phase
 * `processRedevelopments()` finalizes due properties; `finalizeRedevelopmentIfDue()`
 * is also called lazily from the status route so the building completes as
 * soon as the player next looks at it — no setTimeout, no client timers, no
 * new worker. Survives refresh/logout/restart by construction.
 */

async function resolveCity(property) {
  if (property.cityId && typeof property.cityId === 'object' && property.cityId._id) return property.cityId;
  if (property.cityId) return City.findById(property.cityId);
  return null;
}

/**
 * Build the new building onto a redeveloped plot. Mutates `property` in place
 * (mirrors ConstructionProject completion in constructionProcessing.js).
 */
function buildRedevelopedBuilding(property, projectDef, city, _tickNumber) {
  const units = [];
  let totalUnitRent = 0;
  for (let i = 0; i < projectDef.unitsGenerated; i++) {
    const unitRent = calculateUnitRent(projectDef, city, property.location, i);
    totalUnitRent += unitRent;
    units.push({
      unitNumber: i + 1,
      type: projectDef.unitType,
      rentPrice: unitRent,
      occupied: Math.random() < 0.8,
    });
  }

  const occupancy = Math.round(70 + Math.random() * 25);
  const maintenanceCost = Math.round(property.redevelopment.constructionCost * projectDef.maintenancePercent);
  const currentOccupied = units.filter((u) => u.occupied).length;
  const effectiveRent = Math.round((totalUnitRent / projectDef.unitsGenerated) * currentOccupied - maintenanceCost);

  property.type = projectDef.propertyType;
  property.buildingType = property.redevelopment.projectType;
  property.developmentLevel = 2;
  property.units = units;
  property.occupancy = occupancy;
  property.maintenanceCost = maintenanceCost;
  property.name = `${property.redevelopment.projectName} - ${city?.name || 'Unknown City'}`;
  property.basePrice = property.redevelopment.constructionCost;
  property.condition = 100;
  property.qualityScore = 70;
  property.maintenanceLevel = 'none';
  property.rentPerUnit = 0;
  property.maxValidatedRentPerUnit = 0;
  property.rentPotential = 0;
  property.previousMonthRent = 0;
  property.improvements = [];
  property.activeImprovement = undefined;
  property.upgrades = [];
  property.upgradeLevel = 0;

  const cityMultiplier = city ? 0.8 + (city.demandIndex || 1.0) * 0.2 : 1.0;
  property.currentPrice = Math.round(
    property.redevelopment.constructionCost * (0.9 + Math.random() * 0.2) * cityMultiplier,
  );
  property.rent = clampMonthlyRent(Math.max(0, effectiveRent), calculateMaximumRent(property));
}

/**
 * Finalize one property if its redevelopment completion tick has arrived.
 * Runs the full side effects (building build, ledger-neutral metadata, player
 * notification, mission/XP trigger, cache invalidation). Returns
 * `{ finalized, property }`.
 */
export async function finalizeRedevelopmentIfDue(property, tickNumber = null) {
  if (!property || property.redevelopment?.status !== 'redeveloping') {
    return { finalized: false, property };
  }

  const currentTick = tickNumber == null ? await getTickNumber() : tickNumber;
  if (currentTick < property.redevelopment.completionTick) {
    return { finalized: false, property };
  }

  const allProjects = getAllProjects();
  const projectDef = allProjects.find((p) => p.id === property.redevelopment.projectType);
  if (!projectDef) {
    return { finalized: false, property, error: 'Missing project definition' };
  }

  const city = await resolveCity(property);
  buildRedevelopedBuilding(property, projectDef, city, currentTick);

  const completedCount = (property.redevelopment.completedCount || 0) + 1;
  property.redevelopment.status = 'none';
  property.redevelopment.completedCount = completedCount;
  property.redevelopment.completedAt = new Date();
  property.redevelopment.completedTick = currentTick;
  property.redevelopment.constructionPeriods =
    property.redevelopment.constructionPeriods || projectDef.constructionPeriods;

  await property.save();

  await invalidateProperty(property._id).catch(() => {});

  const projectName = property.redevelopment.projectName || projectDef.name;

  const notifyUserId = property.ownerId?.toString?.() || String(property.ownerId || '');
  if (notifyUserId) {
    await enqueueNotification({
      userId: notifyUserId,
      type: 'construction_complete',
      title: 'Redevelopment Complete!',
      message: `${projectName} has been completed. Your new building is generating income.`,
      eventKey: `redevelopment:${property._id}:completed`,
      route: `/property/${property._id}`,
      entityType: 'property',
      entityId: property._id,
      relatedId: property._id,
      global: false,
    });
  } else if (property.companyId) {
    const company = await RealEstateCompany.findById(property.companyId);
    if (company && company.members?.length) {
      await bulkCreateNotifications(
        company.members.map((m) => ({
          userId: m.userId,
          type: 'construction_complete',
          title: 'Redevelopment Complete!',
          message: `${projectName} has been completed by ${company.name}.`,
          eventKey: `redevelopment:${property._id}:completed:${m.userId}`,
          route: `/property/${property._id}`,
          entityType: 'property',
          entityId: property._id,
          relatedId: property._id,
          global: false,
        })),
      );
    }
  }

  const startedBy = property.redevelopment.startedByUserId?.toString();
  if (startedBy) {
    triggerMissionProgress(startedBy, 'construction_complete');
  }

  sendDiscordNotification({
    type: 'achievements',
    title: 'Redevelopment Complete',
    description: `${projectName} has been redeveloped in ${city?.name || 'unknown city'}.`,
    fields: [
      { name: 'Project', value: projectName, inline: true },
      { name: 'City', value: city?.name || 'Unknown', inline: true },
      { name: 'Value', value: `$${(property.currentPrice || 0).toLocaleString()}`, inline: true },
    ],
  }).catch(() => {});

  return { finalized: true, property };
}

/**
 * Tick phase: finalize every redevelopment whose completion tick has arrived.
 * Returns results for the tick summary. Runs after construction/improvements.
 */
export async function processRedevelopments() {
  const tickNumber = await getTickNumber();
  const properties = await Property.find({
    'redevelopment.status': 'redeveloping',
    'redevelopment.completionTick': { $lte: tickNumber },
  }).populate('cityId');

  const results = [];
  for (const property of properties) {
    try {
      const res = await finalizeRedevelopmentIfDue(property, tickNumber);
      results.push({
        propertyId: property._id,
        status: res.finalized ? 'completed' : 'not_due',
        error: res.error || null,
      });
    } catch (err) {
      console.error(`[REDEVELOPMENT] Error finalizing property ${property._id}:`, err);
      results.push({ propertyId: property._id, status: 'error', error: err.message });
    }
  }
  return results;
}
