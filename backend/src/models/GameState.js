import mongoose from 'mongoose';

const gameStateSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  tickNumber: { type: Number, default: 0 },
  lastTickAt: { type: Date },
});

export async function getGameState() {
  let state = await mongoose.model('GameState').findOne({ key: 'global' });
  if (!state) {
    state = await mongoose.model('GameState').create({ key: 'global', tickNumber: 0 });
  }
  return state;
}

export async function getTickNumber() {
  const state = await getGameState();
  return state.tickNumber;
}

export async function incrementTick() {
  const state = await mongoose
    .model('GameState')
    .findOneAndUpdate(
      { key: 'global' },
      { $inc: { tickNumber: 1 }, $set: { lastTickAt: new Date() } },
      { new: true, upsert: true },
    );
  return state.tickNumber;
}

export default mongoose.model('GameState', gameStateSchema);
