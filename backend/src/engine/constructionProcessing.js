import ConstructionProject from '../models/ConstructionProject.js';
import Property from '../models/Property.js';
import City from '../models/City.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { getTickNumber } from '../models/GameState.js';
import { getAllProjects, calculateProjectCost, calculateUnitRent } from '../config/developmentProjects.js';

export async function processConstruction() {
  const tickNumber = await getTickNumber();
  const projects = await ConstructionProject.find({
    status: 'under_construction',
  });

  const results = [];

  for (const project of projects) {
    try {
      const progressPerTick = 100 / project.constructionPeriods;
      project.progress = Math.min(100, project.progress + progressPerTick);

      if (project.progress >= 100) {
        project.progress = 100;
        project.status = 'completed';
        project.completionPeriod = tickNumber;

        const land = await Property.findById(project.landId).populate('cityId');
        if (land) {
          const allProjects = getAllProjects();
          const projectDef = allProjects.find((p) => p.id === project.projectType);
          if (projectDef) {
            const units = [];
            let totalUnitRent = 0;

            for (let i = 0; i < projectDef.unitsGenerated; i++) {
              const unitRent = calculateUnitRent(projectDef, land.cityId, land.location, i);
              totalUnitRent += unitRent;
              units.push({
                unitNumber: i + 1,
                type: projectDef.unitType,
                rentPrice: unitRent,
                occupied: Math.random() < 0.8,
              });
            }

            const occupancy = Math.round(70 + Math.random() * 25);
            const maintenanceCost = Math.round(project.totalCost * projectDef.maintenancePercent);
            const propertyType = projectDef.propertyType;

            const currentOccupied = units.filter((u) => u.occupied).length;
            const effectiveRent = Math.round(
              (totalUnitRent / projectDef.unitsGenerated) * currentOccupied - maintenanceCost,
            );

            land.type = propertyType;
            land.buildingType = project.projectType;
            land.developmentLevel = 2;
            land.units = units;
            land.occupancy = occupancy;
            land.maintenanceCost = maintenanceCost;
            land.rent = Math.max(0, effectiveRent);
            land.name = `${project.projectName} - ${land.cityId?.name || ''}`;
            land.basePrice = project.totalCost;
            land.currentPrice = project.totalCost;

            const cityMultiplier = land.cityId ? 0.8 + (land.cityId.demandIndex || 1.0) * 0.2 : 1.0;
            land.currentPrice = Math.round(project.totalCost * (0.9 + Math.random() * 0.2) * cityMultiplier);

            await land.save();

            await Notification.create({
              userId: project.ownerId,
              type: 'construction_complete',
              title: 'Construction Complete!',
              message: `${project.projectName} has been completed. Your new building is generating income.`,
              relatedId: land._id,
            });

            const owner = await User.findById(project.ownerId);
            if (owner) {
              owner.ownedProperties = owner.ownedProperties.filter((p) => p.toString() !== land._id.toString());
              owner.ownedProperties.push(land._id);
              await owner.save();
            }
          }
        }
      }

      await project.save();

      results.push({
        projectId: project._id,
        landId: project.landId,
        progress: project.progress,
        status: project.status,
      });
    } catch (err) {
      console.error(`[CONSTRUCTION] Error processing project ${project._id}:`, err);
      results.push({
        projectId: project._id,
        error: err.message,
      });
    }
  }

  return results;
}
