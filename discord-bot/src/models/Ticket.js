import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true, unique: true },
  creatorId: { type: String, required: true },
  category: {
    type: String,
    enum: ['support', 'bug', 'appeal', 'partnership', 'suggestion'],
    default: 'support',
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'archived'],
    default: 'open',
  },
  assignedTo: String,
  closedBy: String,
  closeReason: String,
  messages: [{
    authorId: String,
    content: String,
    timestamp: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

ticketSchema.index({ guildId: 1, creatorId: 1, status: 1 });
ticketSchema.index({ guildId: 1, channelId: 1 });

export default mongoose.model('Ticket', ticketSchema);
