import { Router } from 'express';
import User from '../models/User.js';
import FriendRequest from '../models/FriendRequest.js';
import Notification from '../models/Notification.js';
import { authenticate } from '../middleware/auth.js';
import { awardXp } from '../utils/leveling.js';

const router = Router();

router.use(authenticate);

async function createFriendNotification(userId, sender, type) {
  const title = type === 'friend_accepted' ? 'Friend Request Accepted' : 'Friend Request';
  const message =
    type === 'friend_accepted'
      ? `${sender.displayName || sender.username} accepted your friend request.`
      : `${sender.displayName || sender.username} sent you a friend request.`;

  await Notification.create({
    userId,
    type: 'friend_request',
    title,
    message,
    relatedId: sender._id,
  });
}

router.post('/request/:username', async (req, res) => {
  try {
    const target = await User.findOne({ normalizedUsername: req.params.username.toLowerCase().trim() });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (req.user._id.equals(target._id)) return res.status(400).json({ error: 'Cannot send request to yourself' });
    if (req.user.friends.includes(target._id)) return res.status(400).json({ error: 'Already friends' });

    const existing = await FriendRequest.findOne({
      $or: [
        { senderId: req.user._id, receiverId: target._id },
        { senderId: target._id, receiverId: req.user._id },
      ],
      status: 'pending',
    });
    if (existing) return res.status(400).json({ error: 'Request already exists' });

    const request = await FriendRequest.create({
      senderId: req.user._id,
      receiverId: target._id,
    });

    await createFriendNotification(target._id, req.user, 'friend_request');

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/accept/:requestId', async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!request.receiverId.equals(req.user._id)) return res.status(403).json({ error: 'Not your request' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    request.status = 'accepted';
    await request.save();

    await User.findByIdAndUpdate(req.user._id, { $addToSet: { friends: request.senderId } });
    await User.findByIdAndUpdate(request.senderId, { $addToSet: { friends: req.user._id } });

    const alreadyFriends = await FriendRequest.findOne({
      $or: [
        { senderId: req.user._id, receiverId: request.senderId, status: 'accepted' },
        { senderId: request.senderId, receiverId: req.user._id, status: 'accepted' },
      ],
    });

    if (!alreadyFriends) {
      const user = await User.findById(req.user._id);
      await awardXp(user, 5, 'friend_add');
      user.lifetimeStats.totalFriendsAdded += 1;
      await user.save();
    }

    await createFriendNotification(request.senderId, req.user, 'friend_accepted');

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/decline/:requestId', async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!request.receiverId.equals(req.user._id)) return res.status(403).json({ error: 'Not your request' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    request.status = 'declined';
    await request.save();

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/request/:requestId', async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!request.senderId.equals(req.user._id)) return res.status(403).json({ error: 'Not your request' });

    request.status = 'cancelled';
    await request.save();

    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:friendId', async (req, res) => {
  try {
    const friendId = req.params.friendId;
    if (!req.user.friends.includes(friendId)) return res.status(404).json({ error: 'Friend not found' });

    await User.findByIdAndUpdate(req.user._id, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: req.user._id } });

    await FriendRequest.findOneAndUpdate(
      {
        $or: [
          { senderId: req.user._id, receiverId: friendId },
          { senderId: friendId, receiverId: req.user._id },
        ],
        status: 'accepted',
      },
      { status: 'cancelled' },
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'username displayName avatar balance createdAt');
    const friendsWithNetWorth = await Promise.all(
      (user.friends || []).map(async (f) => {
        const Property = (await import('../models/Property.js')).default;
        const properties = await Property.find({ ownerId: f._id });
        const portfolioValue = properties.reduce((sum, p) => sum + p.currentPrice, 0);
        return {
          _id: f._id,
          username: f.username,
          displayName: f.displayName,
          avatar: f.avatar,
          balance: f.balance,
          joinedAt: f.createdAt,
          netWorth: (f.balance || 0) + portfolioValue,
          propertiesCount: properties.length,
        };
      }),
    );
    res.json(friendsWithNetWorth);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const [incoming, sent] = await Promise.all([
      FriendRequest.find({ receiverId: req.user._id, status: 'pending' }).populate(
        'senderId',
        'username displayName avatar',
      ),
      FriendRequest.find({ senderId: req.user._id, status: 'pending' }).populate(
        'receiverId',
        'username displayName avatar',
      ),
    ]);
    res.json({ incoming, sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:username', async (req, res) => {
  try {
    const target = await User.findOne({ normalizedUsername: req.params.username.toLowerCase().trim() });
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (req.user._id.equals(target._id)) return res.json({ status: 'self' });

    const areFriends = req.user.friends.some((f) => f.equals(target._id));
    if (areFriends) return res.json({ status: 'friends' });

    const request = await FriendRequest.findOne({
      $or: [
        { senderId: req.user._id, receiverId: target._id },
        { senderId: target._id, receiverId: req.user._id },
      ],
      status: 'pending',
    });

    if (request) {
      if (request.senderId.equals(req.user._id)) return res.json({ status: 'sent', requestId: request._id });
      return res.json({ status: 'received', requestId: request._id });
    }

    res.json({ status: 'none' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
