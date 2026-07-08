const DEVELOPMENT_PROJECTS = {
  residential: {
    label: 'Residential',
    description: 'Build homes and apartments for steady rental income',
    projects: [
      {
        id: 'apartment_building',
        name: 'Apartment Building',
        baseCost: 8000000,
        constructionPeriods: 20,
        description: 'Standard apartment building with 50 units',
        unitsGenerated: 50,
        baseRentPerUnit: 2000,
        maintenancePercent: 0.002,
        propertyType: 'apartment',
        unitType: 'apartment',
        minLandSize: 2000,
      },
      {
        id: 'luxury_apartments',
        name: 'Luxury Apartments',
        baseCost: 15000000,
        constructionPeriods: 30,
        description: 'High-end luxury apartment tower with 100 units',
        unitsGenerated: 100,
        baseRentPerUnit: 5000,
        maintenancePercent: 0.003,
        propertyType: 'apartment',
        unitType: 'apartment',
        minLandSize: 4000,
      },
      {
        id: 'housing_complex',
        name: 'Housing Complex',
        baseCost: 12000000,
        constructionPeriods: 25,
        description: 'Large housing complex with 200 units',
        unitsGenerated: 200,
        baseRentPerUnit: 1500,
        maintenancePercent: 0.0015,
        propertyType: 'apartment',
        unitType: 'apartment',
        minLandSize: 6000,
      },
    ],
  },
  commercial: {
    label: 'Commercial',
    description: 'Build offices and retail spaces for higher income',
    projects: [
      {
        id: 'office_building',
        name: 'Office Building',
        baseCost: 12000000,
        constructionPeriods: 25,
        description: 'Commercial office building with premium rental space',
        unitsGenerated: 30,
        baseRentPerUnit: 8000,
        maintenancePercent: 0.003,
        propertyType: 'commercial',
        unitType: 'office',
        minLandSize: 3000,
      },
      {
        id: 'shopping_center',
        name: 'Shopping Center',
        baseCost: 20000000,
        constructionPeriods: 35,
        description: 'Large shopping center with retail spaces',
        unitsGenerated: 50,
        baseRentPerUnit: 10000,
        maintenancePercent: 0.004,
        propertyType: 'commercial',
        unitType: 'retail',
        minLandSize: 8000,
      },
      {
        id: 'retail_complex',
        name: 'Retail Complex',
        baseCost: 8000000,
        constructionPeriods: 18,
        description: 'Small retail complex with storefronts',
        unitsGenerated: 15,
        baseRentPerUnit: 6000,
        maintenancePercent: 0.0025,
        propertyType: 'commercial',
        unitType: 'retail',
        minLandSize: 2000,
      },
    ],
  },
  hospitality: {
    label: 'Hospitality',
    description: 'Build hotels and resorts for tourism-based income',
    projects: [
      {
        id: 'hotel',
        name: 'Hotel',
        baseCost: 18000000,
        constructionPeriods: 30,
        description: 'Full-service hotel with 150 rooms',
        unitsGenerated: 150,
        baseRentPerUnit: 4000,
        maintenancePercent: 0.005,
        propertyType: 'commercial',
        unitType: 'hotel_room',
        minLandSize: 4000,
      },
      {
        id: 'resort',
        name: 'Resort',
        baseCost: 25000000,
        constructionPeriods: 40,
        description: 'Luxury resort destination',
        unitsGenerated: 200,
        baseRentPerUnit: 3500,
        maintenancePercent: 0.006,
        propertyType: 'commercial',
        unitType: 'hotel_room',
        minLandSize: 10000,
      },
    ],
  },
};

const LOCATION_MULTIPLIERS = {
  Manhattan: { costMultiplier: 1.5, rentMultiplier: 1.8 },
  Downtown: { costMultiplier: 1.3, rentMultiplier: 1.4 },
  Midtown: { costMultiplier: 1.25, rentMultiplier: 1.35 },
  'Upper East Side': { costMultiplier: 1.4, rentMultiplier: 1.6 },
  Brooklyn: { costMultiplier: 1.1, rentMultiplier: 1.2 },
  Central: { costMultiplier: 1.2, rentMultiplier: 1.3 },
  'Business District': { costMultiplier: 1.35, rentMultiplier: 1.5 },
  Waterfront: { costMultiplier: 1.3, rentMultiplier: 1.45 },
  Suburban: { costMultiplier: 0.8, rentMultiplier: 0.9 },
  'Industrial Zone': { costMultiplier: 0.7, rentMultiplier: 0.8 },
};

function getLocationMultiplier(location) {
  if (!location) return { costMultiplier: 1.0, rentMultiplier: 1.0 };
  const key = Object.keys(LOCATION_MULTIPLIERS).find((k) => location.toLowerCase().includes(k.toLowerCase()));
  return key ? LOCATION_MULTIPLIERS[key] : { costMultiplier: 1.0, rentMultiplier: 1.0 };
}

function getCityCostMultiplier(city) {
  const highCostCities = ['New York', 'Hong Kong', 'London', 'Paris', 'Singapore'];
  const mediumCostCities = ['Tokyo', 'Sydney', 'Los Angeles', 'Toronto', 'Tel Aviv'];
  if (highCostCities.includes(city)) return 1.3;
  if (mediumCostCities.includes(city)) return 1.1;
  return 0.9;
}

function calculateProjectCost(project, city, location) {
  const cityMultiplier = getCityCostMultiplier(city?.name || '');
  const locationMultiplier = getLocationMultiplier(location);
  const marketMultiplier = city ? 0.8 + (city.demandIndex || 1.0) * 0.2 : 1.0;
  return Math.round(project.baseCost * cityMultiplier * locationMultiplier.costMultiplier * marketMultiplier);
}

function calculateUnitRent(project, city, location, _unitIndex) {
  const cityMultiplier = getCityCostMultiplier(city?.name || '');
  const locationMultiplier = getLocationMultiplier(location);
  const demandMultiplier = city ? 0.7 + (city.demandIndex || 1.0) * 0.3 : 1.0;
  const variance = 0.9 + Math.random() * 0.2;
  return Math.round(
    project.baseRentPerUnit * cityMultiplier * locationMultiplier.rentMultiplier * demandMultiplier * variance,
  );
}

function getAllProjects() {
  const all = [];
  for (const category of Object.keys(DEVELOPMENT_PROJECTS)) {
    for (const project of DEVELOPMENT_PROJECTS[category].projects) {
      all.push({ ...project, category });
    }
  }
  return all;
}

export {
  DEVELOPMENT_PROJECTS,
  LOCATION_MULTIPLIERS,
  getLocationMultiplier,
  getCityCostMultiplier,
  calculateProjectCost,
  calculateUnitRent,
  getAllProjects,
};
