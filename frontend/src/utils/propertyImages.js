const IMAGE_BASE = '/properties';

export const FALLBACK_PROPERTY_IMAGE = `${IMAGE_BASE}/building.png`;

export const PROPERTY_IMAGES = {
  apartment: {
    standard: `${IMAGE_BASE}/Normal-apartment.png`,
    luxury: `${IMAGE_BASE}/Luxury-apartment.png`,
    old: `${IMAGE_BASE}/Old-apartment.png`,
  },
  house: {
    standard: `${IMAGE_BASE}/House.png`,
    luxury: `${IMAGE_BASE}/Luxury-house.png`,
    old: `${IMAGE_BASE}/Old-house.png`,
  },
  commercial: {
    standard: `${IMAGE_BASE}/Commercial.png`,
    luxury: `${IMAGE_BASE}/Luxury-building.png`,
    old: `${IMAGE_BASE}/Old-commercial.png`,
  },
  land: `${IMAGE_BASE}/land.png`,
};

export const BUILDING_TYPE_IMAGES = {
  apartment_building: `${IMAGE_BASE}/building.png`,
  housing_complex: `${IMAGE_BASE}/Housing-complex.png`,
  luxury_apartments: `${IMAGE_BASE}/Luxury-apartment.png`,
  office_building: `${IMAGE_BASE}/Office-building.png`,
  shopping_center: `${IMAGE_BASE}/mall.png`,
  retail_complex: `${IMAGE_BASE}/Retail-complex.png`,
  hotel: `${IMAGE_BASE}/Luxury-resort.png`,
  resort: `${IMAGE_BASE}/Luxury-resort.png`,
};

const RARE_RATINGS = ['luxury', 'elite'];
const OLD_CONDITION_THRESHOLD = 40;

const KEYWORD_RULES = {
  commercial: [
    { keywords: ['skyscraper'], image: `${IMAGE_BASE}/Skyscraper.png` },
    { keywords: ['warehouse'], image: `${IMAGE_BASE}/Warehouse.png` },
    { keywords: ['factory', 'industrial'], image: `${IMAGE_BASE}/factory.png` },
    { keywords: ['office'], image: `${IMAGE_BASE}/Office-building.png` },
    { keywords: ['hotel', 'resort', 'marina', 'island', 'harbor', 'pier'], image: `${IMAGE_BASE}/Luxury-building.png` },
    { keywords: ['tower'], image: `${IMAGE_BASE}/Skyscraper.png` },
    { keywords: ['landmark'], image: `${IMAGE_BASE}/building-2.jpg` },
    { keywords: ['historic', 'heritage', 'castle', 'legacy'], image: `${IMAGE_BASE}/Old-commercial.png` },
  ],
  house: [
    { keywords: ['villa', 'mansion', 'estate'], image: `${IMAGE_BASE}/Luxury-house.png` },
    { keywords: ['castle'], image: `${IMAGE_BASE}/Old-building.png` },
    { keywords: ['historic', 'heritage'], image: `${IMAGE_BASE}/Old-house.png` },
  ],
  apartment: [
    { keywords: ['luxury'], image: `${IMAGE_BASE}/Luxury-apartment.png` },
    { keywords: ['old', 'historic', 'heritage'], image: `${IMAGE_BASE}/Old-apartment.png` },
    { keywords: ['penthouse'], image: `${IMAGE_BASE}/Luxury-apartment.png` },
  ],
};

function matchKeyword(name, rules) {
  if (!name) return null;
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const rule of rules) {
    if (rule.keywords.some((k) => words.includes(k))) return rule.image;
  }
  return null;
}

export function getPropertyImage(property = {}) {
  const type = property.type;
  const name = String(property.name || '').toLowerCase();

  if (property.buildingType && BUILDING_TYPE_IMAGES[property.buildingType]) {
    return BUILDING_TYPE_IMAGES[property.buildingType];
  }

  const typeRules = KEYWORD_RULES[type];
  if (typeRules) {
    const keywordImage = matchKeyword(name, typeRules);
    if (keywordImage) return keywordImage;
  }

  if (type === 'land') {
    return PROPERTY_IMAGES.land;
  }

  const variants = PROPERTY_IMAGES[type];
  if (!variants) {
    return FALLBACK_PROPERTY_IMAGE;
  }

  if (RARE_RATINGS.includes(property.propertyRating)) {
    return variants.luxury;
  }

  const condition = Number(property.condition);
  if (!Number.isNaN(condition) && condition < OLD_CONDITION_THRESHOLD) {
    return variants.old;
  }

  return variants.standard;
}
