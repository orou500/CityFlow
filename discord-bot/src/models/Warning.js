import mongoose from 'mongoose';

const warningSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  moderatorId: { type: String, required: true },
  reason: { type: String, required: true },
  action: {
    type: String,
    enum: ['warn', 'mute', 'kick', 'ban', 'timeout', 'note'],
    default: 'warn',
  },
  duration: Number,
  active: { type: Boolean, default: true },
}, { timestamps: true });

warningSchema.index({ guildId: 1, userId: 1 });
warningSchema.index({ guildId: 1, userId: 1, active: 1 });

export default mongoose.model('Warning', warningSchema);
