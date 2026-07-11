import Event from '../models/Event.js';
import City from '../models/City.js';

const EVENT_TEMPLATES = [
  {
    name: 'Interest Rate Change',
    description: 'Central bank adjusted interest rates, affecting mortgage costs.',
    type: 'global',
    impact: { demandDelta: -0.03 },
    duration: 6,
  },
  {
    name: 'Economic Boom',
    description: 'Strong economic growth driving up property demand.',
    type: 'global',
    impact: { demandDelta: 0.04, growthDelta: 0.01 },
    duration: 8,
  },
  {
    name: 'Recession',
    description: 'Economic downturn decreasing property values.',
    type: 'global',
    impact: { demandDelta: -0.04, growthDelta: -0.01 },
    duration: 8,
  },
  {
    name: 'City Development Plan',
    description: 'New infrastructure project boosts city growth.',
    type: 'local',
    impact: { demandDelta: 0.06, growthDelta: 0.015 },
    duration: 10,
  },
  {
    name: 'Housing Crisis',
    description: 'Shortage of affordable housing drives prices up.',
    type: 'local',
    impact: { demandDelta: 0.07, supplyDelta: -0.03 },
    duration: 6,
  },
  {
    name: 'Market Correction',
    description: 'Overvalued properties see price reductions.',
    type: 'global',
    impact: { demandDelta: -0.02 },
    duration: 5,
  },
  {
    name: 'Tech Hub Growth',
    description: 'Tech companies expanding in the area attract new residents.',
    type: 'local',
    impact: { demandDelta: 0.08, growthDelta: 0.02 },
    duration: 12,
  },
  {
    name: 'Natural Disaster',
    description: 'Property values decline after a natural disaster.',
    type: 'local',
    impact: { demandDelta: -0.06 },
    duration: 6,
  },
];

export async function generateEvents() {
  const probability = 0.4;

  if (Math.random() > probability) return [];

  const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
  const cities = await City.find();
  const affectedCities =
    template.type === 'global' ? cities.map((c) => c._id) : [cities[Math.floor(Math.random() * cities.length)]._id];

  const event = await Event.create({
    name: template.name,
    description: template.description,
    type: template.type,
    impact: template.impact,
    affectedCities,
    duration: template.duration,
    remainingTicks: template.duration,
    active: true,
  });

  for (const cityId of affectedCities) {
    const city = await City.findById(cityId);
    if (city) {
      city.activeEvents.push({ eventId: event._id, remainingTicks: template.duration });
      await city.save();
    }
  }

  return [event];
}

export async function tickEvents() {
  const events = await Event.find({ active: true });
  const expired = [];

  for (const event of events) {
    event.remainingTicks -= 1;
    if (event.remainingTicks <= 0) {
      event.active = false;
      expired.push(event._id);

      const cities = await City.find({ 'activeEvents.eventId': event._id });
      for (const city of cities) {
        city.activeEvents = city.activeEvents.filter((e) => e.eventId.toString() !== event._id.toString());
        await city.save();
      }
    }
    await event.save();
  }

  return expired;
}
