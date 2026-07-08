import mongoose from 'mongoose';

const constructionProjectSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  landId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'City', required: true },
  projectType: { type: String, required: true },
  projectName: { type: String, required: true },
  category: {
    type: String,
    enum: ['residential', 'commercial', 'hospitality'],
    required: true,
  },
  totalCost: { type: Number, required: true },
  investedAmount: { type: Number, default: 0 },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  constructionPeriods: { type: Number, required: true },
  startPeriod: { type: Number },
  completionPeriod: { type: Number },
  status: {
    type: String,
    enum: ['planning', 'under_construction', 'completed', 'cancelled'],
    default: 'planning',
  },
  delayTicks: { type: Number, default: 0 },
}, { timestamps: true });

constructionProjectSchema.index({ ownerId: 1, status: 1 });

export default mongoose.model('ConstructionProject', constructionProjectSchema);
