import mongoose from 'mongoose';
import { config } from '../config/index.js';

async function recoverCompetitiveEvents() {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');

  const CompetitiveEvent = mongoose.model(
    'CompetitiveEvent',
    new mongoose.Schema(
      {
        name: String,
        description: String,
        type: String,
        metric: String,
        status: { type: String, enum: ['upcoming', 'active', 'completed'], default: 'upcoming' },
        startDate: Date,
        endDate: Date,
        startTick: Number,
        endTick: Number,
        minLevel: Number,
        maxParticipants: Number,
        participants: Array,
        rewards: mongoose.Schema.Types.Mixed,
        snapshotInterval: Number,
        lastSnapshotTick: Number,
        createdFromSeason: Number,
      },
      { timestamps: true },
    ),
  );

  const Season = mongoose.model(
    'Season',
    new mongoose.Schema({
      number: Number,
      name: String,
      status: String,
      startDate: Date,
      endDate: Date,
    }),
  );

  const GameState = mongoose.model(
    'GameState',
    new mongoose.Schema({
      key: String,
      tickNumber: Number,
      lastTickAt: Date,
    }),
  );

  const activeSeason = await Season.findOne({ status: 'active' });
  const seasonNumber = activeSeason ? activeSeason.number : 1;

  const state = await GameState.findOne({ key: 'global' });
  const currentTick = state ? state.tickNumber : 0;

  console.log(`\nCurrent season: ${seasonNumber}`);
  console.log(`Current tick: ${currentTick}\n`);

  const allEvents = await CompetitiveEvent.find({ createdFromSeason: seasonNumber }).sort({ startTick: 1 });
  console.log(`Total events this season: ${allEvents.length}\n`);

  for (const event of allEvents) {
    console.log(
      `  [${event.status.padEnd(9)}] "${event.name}" tick ${event.startTick}->${event.endTick} (current: ${currentTick})`,
    );

    let changed = false;

    if (event.status === 'upcoming' && currentTick >= event.startTick) {
      event.status = 'active';
      event.lastSnapshotTick = currentTick;
      changed = true;
      console.log(`    → ACTIVATED to active`);
    }

    if (event.status === 'active' && currentTick >= event.endTick) {
      event.status = 'completed';

      const sorted = [...(event.participants || [])].sort((a, b) => (b.value || 0) - (a.value || 0));
      sorted.forEach((p, i) => {
        p.rank = i + 1;
      });
      event.participants = sorted;

      const assignReward = (participant, tier) => {
        if (!participant || !event.rewards?.[tier]) return;
        participant.reward = {
          type: event.rewards[tier].type || 'badge',
          value: event.rewards[tier].value || null,
          claimed: false,
        };
      };
      assignReward(sorted[0], 'first');
      assignReward(sorted[1], 'second');
      assignReward(sorted[2], 'third');

      if (event.rewards?.participation) {
        for (const p of sorted) {
          if (!p.reward || !p.reward.type) {
            p.reward = {
              type: event.rewards.participation.type || 'achievement',
              value: event.rewards.participation.value || null,
              claimed: false,
            };
          }
        }
      }

      changed = true;
      console.log(`    → COMPLETED at tick ${currentTick}`);
    }

    if (changed) {
      await event.save();
    }
  }

  const counts = await CompetitiveEvent.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('\nEvent status distribution:');
  for (const c of counts) {
    console.log(`  ${c._id}: ${c.count}`);
  }

  console.log('\nRecovery complete.');
  process.exit(0);
}

recoverCompetitiveEvents().catch((err) => {
  console.error('Recovery failed:', err);
  process.exit(1);
});
