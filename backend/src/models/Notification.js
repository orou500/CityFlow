import mongoose from 'mongoose';
import { VALID_PRIORITIES, CATEGORIES, PRIORITY, CATEGORY } from '../config/notificationConfig.js';

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
        'sizops_welcome',
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
    // Structured deep-link metadata for proposal/vote notifications: the
    // canonical identifier of the voting object (e.g. an auction bid
    // proposal id) and the auction it targets. Never derive navigation from
    // title/message text.
    proposalId: { type: mongoose.Schema.Types.ObjectId, default: null },
    auctionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    read: { type: Boolean, default: false },
    // When the user marked this read — drives read-notification retention.
    // Nullable for legacy notifications that predate the field.
    readAt: { type: Date, default: null },
    // Priority tells the player how much attention this deserves. Derived
    // from the logical event at creation time (see notificationConfig).
    priority: { type: String, enum: VALID_PRIORITIES, default: PRIORITY.LOW },
    // Category lets users filter and later disable notification types.
    category: { type: String, enum: CATEGORIES, default: CATEGORY.SYSTEM },
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
// Priority / category list filtering (GET /notifications?priority=&category=)
notificationSchema.index({ userId: 1, priority: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, category: 1, createdAt: -1 });
// Retention cleanup: prune old read notifications efficiently.
notificationSchema.index({ read: 1, priority: 1, updatedAt: 1 });

export default mongoose.model('Notification', notificationSchema);
