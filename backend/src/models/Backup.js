import mongoose from 'mongoose';

const backupSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    originalName: { type: String },
    size: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ['manual', 'scheduled', 'pre-restore', 'upload'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['creating', 'completed', 'failed', 'restoring', 'deleted'],
      default: 'creating',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    error: { type: String },
    collections: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
        message: { type: String, required: true },
      },
    ],
  },
  { timestamps: true },
);

backupSchema.index({ createdAt: -1 });
backupSchema.index({ status: 1 });

export default mongoose.model('Backup', backupSchema);
