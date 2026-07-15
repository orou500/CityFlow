import mongoose from 'mongoose';

const linkCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discordUserId: { type: String, required: true },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
});

linkCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('LinkCode', linkCodeSchema);
