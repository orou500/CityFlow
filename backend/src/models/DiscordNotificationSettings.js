import mongoose from 'mongoose';

const discordNotificationSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: true },
    preferences: {
      gameEvents: { type: Boolean, default: true },
      achievements: { type: Boolean, default: true },
      systemAlerts: { type: Boolean, default: true },
      worldEvents: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export default mongoose.model('DiscordNotificationSettings', discordNotificationSettingsSchema);
