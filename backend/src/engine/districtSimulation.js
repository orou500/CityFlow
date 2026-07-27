import District from '../models/District.js';
import Property from '../models/Property.js';
import { DISTRICT_CONFIG, DISTRICT_EVENTS } from '../config/districts.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInfluenceTier(score) {
  const tiers = DISTRICT_CONFIG.tiers;
  if (score >= tiers.market_leader.min) return 'market_leader';
  if (score >= tiers.significant_investor.min) return 'significant_investor';
  if (score >= tiers.minor_investor.min) return 'minor_investor';
  return 'observer';
}

export async function simulateDistricts() {
  const districts = await District.find().populate('cityId', 'name country demandIndex economicCondition');
  if (!districts.length) return [];

  const districtIds = districts.map((d) => d._id);

  const propertyStats = await Property.aggregate([
    { $match: { districtId: { $in: districtIds } } },
    {
      $group: {
        _id: { districtId: '$districtId', ownerId: '$ownerId' },
        count: { $sum: 1 },
        totalPrice: { $sum: '$currentPrice' },
        totalRent: { $sum: '$rent' },
        avgOccupancy: { $avg: '$occupancy' },
      },
    },
  ]);

  const districtPropertyStats = new Map();
  const districtOwnerStats = new Map();

  for (const stat of propertyStats) {
    const distId = stat._id.districtId.toString();
    if (!districtPropertyStats.has(distId)) {
      districtPropertyStats.set(distId, { total: 0, totalPrice: 0, totalRent: 0, owners: new Map() });
    }
    const ds = districtPropertyStats.get(distId);
    ds.total += stat.count;
    ds.totalPrice += stat.totalPrice;
    ds.totalRent += stat.totalRent;

    if (stat._id.ownerId) {
      ds.owners.set(stat._id.ownerId.toString(), { count: stat.count, totalPrice: stat.totalPrice });
    }

    if (!districtOwnerStats.has(distId)) {
      districtOwnerStats.set(distId, []);
    }
    if (stat._id.ownerId) {
      districtOwnerStats.get(distId).push({
        userId: stat._id.ownerId,
        count: stat.count,
        totalPrice: stat.totalPrice,
      });
    }
  }

  const bulkOps = [];
  const results = [];

  for (const district of districts) {
    const distId = district._id.toString();
    const stats = districtPropertyStats.get(distId) || { total: 0, totalPrice: 0, totalRent: 0, owners: new Map() };

    district.propertyCount = stats.total;
    if (stats.total > 0) {
      district.avgPrice = stats.totalPrice / stats.total;
      district.avgRent = stats.totalRent / stats.total;
    }

    district.demandIndex = simulateDemand(district);
    district.supplyIndex = simulateSupply(district);
    district.growthRate = simulateGrowth(district);
    district.population = simulatePopulation(district);

    tickActiveEvents(district);
    maybeTriggerEvent(district);

    updateInfluenceScores(district, districtOwnerStats.get(distId) || [], districtPropertyStats.get(distId));

    recordHistory(district);

    bulkOps.push({
      updateOne: {
        filter: { _id: district._id },
        update: {
          $set: {
            demandIndex: district.demandIndex,
            supplyIndex: district.supplyIndex,
            growthRate: district.growthRate,
            avgPrice: district.avgPrice,
            avgRent: district.avgRent,
            propertyCount: district.propertyCount,
            population: district.population,
            activeEvents: district.activeEvents,
            eventCooldownTicks: district.eventCooldownTicks,
            influence: district.influence,
            totalInfluencePoints: district.totalInfluencePoints,
          },
        },
      },
    });

    results.push({
      districtId: district._id,
      name: district.name,
      tier: district.tier,
      demandIndex: district.demandIndex,
      supplyIndex: district.supplyIndex,
      avgPrice: district.avgPrice,
      growthRate: district.growthRate,
      propertyCount: district.propertyCount,
      activeEvents: district.activeEvents.length,
    });
  }

  if (bulkOps.length > 0) {
    await District.bulkWrite(bulkOps);
  }

  return results;
}

function simulateDemand(district) {
  const cfg = DISTRICT_CONFIG.market;
  let demand = district.demandIndex;

  const eventDemandDelta = district.activeEvents.reduce((sum, e) => sum + (e.effects.demandDelta || 0), 0);
  demand += eventDemandDelta;

  const noise = (Math.random() - 0.5) * cfg.demandVolatility;
  demand += noise;

  const reversion = (district.baseDemand - demand) * cfg.growthMeanReversion;
  demand += reversion;

  if (district.propertyCount > 0 && district.avgPrice > 0) {
    const affordabilityRatio = district.basePrice / district.avgPrice;
    demand += (affordabilityRatio - 1) * 0.05;
  }

  return clamp(demand, cfg.minDemand, cfg.maxDemand);
}

function simulateSupply(district) {
  const cfg = DISTRICT_CONFIG.market;
  let supply = district.supplyIndex;

  const eventSupplyDelta = district.activeEvents.reduce((sum, e) => sum + (e.effects.supplyDelta || 0), 0);
  supply += eventSupplyDelta;

  const noise = (Math.random() - 0.5) * cfg.supplyVolatility;
  supply += noise;

  const supplyPressure = district.demandIndex > 1.5 ? -0.02 : district.demandIndex < 0.7 ? 0.02 : 0;
  supply += supplyPressure;

  return clamp(supply, cfg.minSupply, cfg.maxSupply);
}

function simulateGrowth(district) {
  let growth = district.growthRate;

  const eventGrowthDelta = district.activeEvents.reduce((sum, e) => sum + (e.effects.growthDelta || 0), 0);
  growth += eventGrowthDelta;

  if (district.demandIndex > 1.5 && district.supplyIndex < 1.0) {
    growth += 0.003;
  } else if (district.demandIndex < 0.7 && district.supplyIndex > 1.5) {
    growth -= 0.003;
  }

  growth += (Math.random() - 0.5) * 0.002;

  return clamp(growth, -0.02, 0.05);
}

function simulatePopulation(district) {
  let pop = district.population;
  pop *= 1 + district.growthRate;

  const noise = Math.floor((Math.random() - 0.5) * pop * 0.001);
  pop += noise;

  return Math.max(1000, Math.floor(pop));
}

function tickActiveEvents(district) {
  for (const event of district.activeEvents) {
    event.remainingTicks--;
  }
  district.activeEvents = district.activeEvents.filter((e) => e.remainingTicks > 0);

  if (district.eventCooldownTicks > 0) {
    district.eventCooldownTicks--;
  }
}

function maybeTriggerEvent(district) {
  const cfg = DISTRICT_CONFIG.events;
  if (district.eventCooldownTicks > 0) return;
  if (district.activeEvents.length >= cfg.maxActiveEvents) return;
  if (Math.random() > cfg.chancePerTick) return;

  const template = DISTRICT_EVENTS[Math.floor(Math.random() * DISTRICT_EVENTS.length)];

  district.activeEvents.push({
    eventType: template.name.toLowerCase().replace(/\s+/g, '_'),
    name: template.name,
    type: template.type,
    effects: { ...template.effects },
    remainingTicks: template.durationTicks,
    startedAtTick: 0,
  });

  district.eventCooldownTicks = cfg.cooldownTicks;
}

function updateInfluenceScores(district, ownerStats, distStats) {
  const cfg = DISTRICT_CONFIG.influence;
  const anti = DISTRICT_CONFIG.antiMonopoly;

  const totalValue = distStats?.totalPrice || 1;

  const newInfluenceMap = new Map();

  for (const owner of ownerStats) {
    const userId = owner.userId.toString();
    let existing = district.influence.find((inf) => inf.userId?.toString() === userId);

    const ownershipScore = (owner.totalPrice / totalValue) * cfg.ownershipWeight;

    let adjustedScore = ownershipScore;

    if (adjustedScore > anti.diminishingReturnsThreshold) {
      const excess = adjustedScore - anti.diminishingReturnsThreshold;
      adjustedScore = anti.diminishingReturnsThreshold + excess * anti.diminishingReturnsFactor;
    }

    if (adjustedScore > anti.maxInfluenceCap) {
      adjustedScore = anti.maxInfluenceCap;
    }

    const otherCount = ownerStats.filter((o) => o.userId.toString() !== userId).length;
    if (otherCount >= 2 && adjustedScore > 0) {
      adjustedScore *= anti.competitionBonusFactor;
      adjustedScore = Math.min(adjustedScore, anti.maxInfluenceCap);
    }

    const decayedScore = existing ? existing.score * (1 - cfg.tickDecayRate) + adjustedScore : adjustedScore;

    const finalScore = clamp(decayedScore, 0, 1);

    newInfluenceMap.set(userId, {
      userId: owner.userId,
      score: finalScore,
      tier: getInfluenceTier(finalScore),
      propertyCount: owner.count,
      totalInvested: owner.totalPrice,
      lastUpdatedTick: existing?.lastUpdatedTick || 0,
    });
  }

  for (const existing of district.influence) {
    const userId = existing.userId?.toString();
    if (!newInfluenceMap.has(userId)) {
      const decayed = existing.score * (1 - cfg.tickDecayRate * 3);
      if (decayed >= cfg.minInfluenceToTrack) {
        newInfluenceMap.set(userId, {
          ...existing,
          score: decayed,
          tier: getInfluenceTier(decayed),
          propertyCount: 0,
        });
      }
    }
  }

  district.influence = Array.from(newInfluenceMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  district.totalInfluencePoints = district.influence.reduce((sum, inf) => sum + inf.score, 0);
}

function recordHistory(district) {
  const entry = {
    tick: 0,
    population: district.population,
    demandIndex: district.demandIndex,
    supplyIndex: district.supplyIndex,
    growthRate: district.growthRate,
    avgRent: district.avgRent,
    avgPrice: district.avgPrice,
    propertyCount: district.propertyCount,
    activeEvents: district.activeEvents.map((e) => e.name),
  };

  district.history.push(entry);

  if (district.history.length > DISTRICT_CONFIG.history.maxEntries) {
    district.history = district.history.slice(-DISTRICT_CONFIG.history.maxEntries);
  }
}

export async function recalculateAllInfluence() {
  const districts = await District.find();
  if (!districts.length) return 0;

  const districtIds = districts.map((d) => d._id);

  const ownerStats = await Property.aggregate([
    { $match: { districtId: { $in: districtIds }, ownerId: { $ne: null } } },
    {
      $group: {
        _id: { districtId: '$districtId', ownerId: '$ownerId' },
        count: { $sum: 1 },
        totalPrice: { $sum: '$currentPrice' },
      },
    },
  ]);

  const grouped = new Map();
  for (const stat of ownerStats) {
    const distId = stat._id.districtId.toString();
    if (!grouped.has(distId)) grouped.set(distId, []);
    grouped.get(distId).push({
      userId: stat._id.ownerId,
      count: stat.count,
      totalPrice: stat.totalPrice,
    });
  }

  const totalValues = await Property.aggregate([
    { $match: { districtId: { $in: districtIds } } },
    { $group: { _id: '$districtId', total: { $sum: '$currentPrice' } } },
  ]);

  const totalValueMap = new Map(totalValues.map((t) => [t._id.toString(), t.total]));

  for (const district of districts) {
    const distId = district._id.toString();
    const owners = grouped.get(distId) || [];
    const totalValue = totalValueMap.get(distId) || 1;

    const cfg = DISTRICT_CONFIG.influence;
    const anti = DISTRICT_CONFIG.antiMonopoly;

    const influenceArr = [];

    for (const owner of owners) {
      const ownershipScore = (owner.totalPrice / totalValue) * cfg.ownershipWeight;
      let adjustedScore = ownershipScore;

      if (adjustedScore > anti.diminishingReturnsThreshold) {
        const excess = adjustedScore - anti.diminishingReturnsThreshold;
        adjustedScore = anti.diminishingReturnsThreshold + excess * anti.diminishingReturnsFactor;
      }
      adjustedScore = Math.min(adjustedScore, anti.maxInfluenceCap);

      const otherCount = owners.filter((o) => o.userId.toString() !== owner.userId.toString()).length;
      if (otherCount >= 2 && adjustedScore > 0) {
        adjustedScore = Math.min(adjustedScore * anti.competitionBonusFactor, anti.maxInfluenceCap);
      }

      if (adjustedScore >= cfg.minInfluenceToTrack) {
        influenceArr.push({
          userId: owner.userId,
          score: clamp(adjustedScore, 0, 1),
          tier: getInfluenceTier(adjustedScore),
          propertyCount: owner.count,
          totalInvested: owner.totalPrice,
          lastUpdatedTick: 0,
        });
      }
    }

    influenceArr.sort((a, b) => b.score - a.score);

    district.influence = influenceArr.slice(0, 50);
    district.totalInfluencePoints = influenceArr.reduce((sum, inf) => sum + inf.score, 0);
  }

  await District.bulkWrite(
    districts.map((d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { influence: d.influence, totalInfluencePoints: d.totalInfluencePoints } },
      },
    })),
  );

  return districts.length;
}
