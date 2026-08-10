import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: [
        'property_offer',
        'offer_accepted',
        'offer_rejected',
        'offer_countered',
        'offer_expired',
        'construction_complete',
        'improvement_complete',
        'friend_request',
        'system',
        'company_vote',
        'mission_complete',
        'mission_reward',
        'mission_chain_unlocked',
        'season_reward',
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    eventId: { type: String },
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    route: { type: String },
    tab: { type: String },
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    read: { type: Boolean, default: false },
    global: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ eventId: 1 }, { unique: true, sparse: true });

export default mongoose.model('Notification', notificationSchema);
