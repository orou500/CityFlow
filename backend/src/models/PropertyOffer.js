import mongoose from 'mongoose';

const propertyOfferSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  offerAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'countered', 'expired'],
    default: 'pending',
  },
  counterOffer: { type: Number, default: null },
  counterBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) },
}, { timestamps: true });

propertyOfferSchema.index({ sellerId: 1, status: 1 });
propertyOfferSchema.index({ buyerId: 1, status: 1 });
propertyOfferSchema.index({ propertyId: 1, status: 1 });

export default mongoose.model('PropertyOffer', propertyOfferSchema);
