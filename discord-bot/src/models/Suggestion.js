import mongoose from 'mongoose';

const suggestionSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  authorId: { type: String, required: true },
  messageId: { type: String, required: true },
  content: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'under_review', 'accepted', 'rejected', 'implemented'],
    default: 'pending',
  },
  reviewNote: String,
  reviewedBy: String,
  upvotes: [{ type: String }],
  downvotes: [{ type: String }],
}, { timestamps: true });

suggestionSchema.index({ guildId: 1, status: 1 });
suggestionSchema.index({ guildId: 1, authorId: 1 });

export default mongoose.model('Suggestion', suggestionSchema);
