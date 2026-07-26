import mongoose from 'mongoose';

const donationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 5 },
  currency: { type: String, default: 'USD' },
  paypalOrderId: { type: String, required: true, unique: true },
  paypalCaptureId: { type: String },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
  },
  isAnonymous: { type: Boolean, default: false },
  supporterSince: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

donationSchema.index({ userId: 1, createdAt: -1 });
donationSchema.index({ paypalOrderId: 1 }, { unique: true });
donationSchema.index({ status: 1 });

export default mongoose.model('Donation', donationSchema);
