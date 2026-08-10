import mongoose from 'mongoose';

/**
 * Lightweight view/visit tracking used by exploration & social missions.
 * Written when an authenticated player opens a profile, city, district or
 * the marketplace — never on self-views of their own profile.
 */
const userVisitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: {
      type: String,
      enum: ['profile', 'city', 'district', 'market'],
      required: true,
    },
    targetId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
);

userVisitSchema.index({ userId: 1, createdAt: -1 });
userVisitSchema.index({ userId: 1, targetType: 1, createdAt: -1 });
userVisitSchema.index({ userId: 1, targetType: 1, targetId: 1 });

export default mongoose.model('UserVisit', userVisitSchema);
