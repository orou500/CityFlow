import mongoose from 'mongoose';

const friendRequestSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true },
);

friendRequestSchema.index({ senderId: 1, status: 1 });
friendRequestSchema.index({ receiverId: 1, status: 1 });

export default mongoose.model('FriendRequest', friendRequestSchema);
