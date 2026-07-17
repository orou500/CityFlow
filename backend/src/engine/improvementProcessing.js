import Property from '../models/Property.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getTickNumber } from '../models/GameState.js';
import { IMPROVEMENT_PROJECTS, calculatePropertyRating } from '../config/improvementProjects.js';
import { sendDiscordNotification } from '../services/discordBot.js';

export async function processImprovements() {
  const tickNumber = await getTickNumber();
  const properties = await Property.find({
    'activeImprovement.improvementId': { $exists: true, $ne: null },
  });

  const results = [];

  for (const property of properties) {
    try {
      if (!property.activeImprovement || !property.activeImprovement.improvementId) continue;

      const completionPeriod = property.activeImprovement.completionPeriod;
      if (!completionPeriod || tickNumber < completionPeriod) {
        const totalPeriods = completionPeriod
          ? Math.max(1, completionPeriod - (property.activeImprovement.startPeriod || completionPeriod - 1))
          : 1;
        property.activeImprovement.progress = Math.min(99, property.activeImprovement.progress + 100 / totalPeriods);
        await property.save();

        results.push({
          propertyId: property._id,
          improvementId: property.activeImprovement.improvementId,
          progress: property.activeImprovement.progress,
          status: 'in_progress',
        });
        continue;
      }

      const improvement = IMPROVEMENT_PROJECTS[property.activeImprovement.improvementId];
      if (!improvement) {
        property.activeImprovement = undefined;
        await property.save();
        continue;
      }

      if (!property.improvements) property.improvements = [];
      property.improvements.push({
        improvementId: improvement.id,
        name: improvement.name,
        completedAt: new Date(),
        cost: property.activeImprovement.cost || 0,
        valueBonus: improvement.valueBonus,
        rentBonus: improvement.rentBonus,
        conditionBonus: improvement.conditionBonus,
        demandBonus: improvement.demandBonus,
      });

      if (improvement.valueBonus) {
        property.currentPrice = Math.round(property.currentPrice * (1 + improvement.valueBonus));
      }

      if (improvement.rentBonus && property.units && property.units.length > 0) {
        const newRentMultiplier = 1 + improvement.rentBonus;
        for (const unit of property.units) {
          unit.rentPrice = Math.round(unit.rentPrice * newRentMultiplier);
        }
        const totalRent = property.units.reduce((sum, u) => sum + u.rentPrice, 0);
        const occupiedCount = property.units.filter((u) => u.occupied).length;
        property.rent = Math.round((totalRent / property.units.length) * occupiedCount);
      }

      if (improvement.conditionBonus) {
        property.condition = Math.min(100, (property.condition || 100) + improvement.conditionBonus);
      }

      const newRating = calculatePropertyRating(property.improvements);
      const oldRating = property.propertyRating || 'standard';
      property.propertyRating = newRating;

      property.activeImprovement = undefined;
      await property.save();

      const owner = await User.findById(property.ownerId);
      if (owner) {
        await Notification.create({
          userId: owner._id,
          type: 'improvement_complete',
          title: 'Improvement Complete!',
          message: `${improvement.name} has been completed on ${property.name}. Rating: ${newRating}`,
          relatedId: property._id,
        });

        sendDiscordNotification({
          type: 'achievements',
          title: 'Improvement Complete',
          description: `${improvement.name} has been completed on ${property.name}.`,
          fields: [
            { name: 'Improvement', value: improvement.name, inline: true },
            { name: 'New Rating', value: newRating, inline: true },
          ],
        }).catch(() => {});
      }

      results.push({
        propertyId: property._id,
        improvementId: improvement.id,
        progress: 100,
        status: 'completed',
        newRating,
        oldRating,
      });
    } catch (err) {
      console.error(`[IMPROVEMENT] Error processing property ${property._id}:`, err);
      results.push({
        propertyId: property._id,
        error: err.message,
      });
    }
  }

  return results;
}
