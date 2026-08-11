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
    // Stable idempotency key for the logical event that produced this
    // notification, e.g. "mission:65f0abc...:completed" or
    // "auction:65f0abc...:won:65f0def...". Nullable — legacy notifications
    // predating the key have no value. The compound unique index on
    // (userId, eventKey) is the database-level duplicate guard: the same
    // logical event can never create more than one notification per user.
    eventKey: { type: String, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ eventId: 1 }, { unique: true, sparse: true });
notificationSchema.index(
  { userId: 1, eventKey: 1 },
  { unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } },
);

export default mongoose.model('Notification', notificationSchema);
