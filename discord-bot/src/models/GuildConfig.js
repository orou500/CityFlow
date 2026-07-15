import mongoose from 'mongoose';

const guildConfigSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  guildName: String,
  welcome: {
    enabled: { type: Boolean, default: false },
    channelId: String,
    message: { type: String, default: 'Welcome {user} to {server}!' },
  },
  leave: {
    enabled: { type: Boolean, default: false },
    channelId: String,
    message: { type: String, default: '{user} has left the server.' },
  },
  verification: {
    enabled: { type: Boolean, default: false },
    channelId: String,
    messageId: String,
    roleId: String,
    logChannelId: String,
  },
  logging: {
    enabled: { type: Boolean, default: false },
    channels: {
      mod: String,
      audit: String,
      general: String,
    },
  },
  tickets: {
    enabled: { type: Boolean, default: false },
    categoryId: String,
    logChannelId: String,
    staffRoleId: String,
  },
  suggestions: {
    enabled: { type: Boolean, default: false },
    channelId: String,
    reviewChannelId: String,
  },
  moderation: {
    muteRoleId: String,
    autoRoleEnabled: { type: Boolean, default: false },
    autoRoleId: String,
    antiSpam: { type: Boolean, default: false },
    antiRaid: { type: Boolean, default: false },
    badWords: [String],
    filteredLinks: [String],
    slowmodeDefault: { type: Number, default: 0 },
  },
  roles: {
    admin: String,
    moderator: String,
    member: String,
  },
  cityflow: {
    enabled: { type: Boolean, default: false },
    gameApiUrl: String,
    notificationChannels: {
      announcements: String,
      worldEvents: String,
      achievements: String,
      systemAlerts: String,
    },
  },
}, { timestamps: true });

export default mongoose.model('GuildConfig', guildConfigSchema);
