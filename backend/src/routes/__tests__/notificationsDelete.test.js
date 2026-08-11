import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import Notification from '../../models/Notification.js';

const app = createApp();

async function makeUser(name) {
  const { user, token } = await createAuthenticatedUser();
  user.username = name;
  return { user, token };
}

async function seedNotification(userId, overrides = {}) {
  return Notification.create({
    userId,
    type: 'system',
    title: 'Test Notification',
    message: 'delete me',
    route: '/dashboard',
    ...overrides,
  });
}

beforeEach(async () => {
  await Notification.deleteMany({});
});

afterAll(async () => {
  await Notification.deleteMany({});
});

describe('Notification deletion', () => {
  it('deletes the notification permanently (gone on refetch, unread count drops)', async () => {
    const { user, token } = await makeUser('deleter');
    const notif = await seedNotification(user._id, { read: false });

    const before = await request(app).get('/notifications/unread-count').set(authHeader(token));
    expect(before.body.count).toBe(1);

    const res = await request(app).delete(`/notifications/${notif._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const list = await request(app).get('/notifications').set(authHeader(token));
    expect(list.body.notifications.find((n) => n._id === notif._id.toString())).toBeUndefined();
    expect(list.body.total).toBe(0);

    const count = await request(app).get('/notifications/unread-count').set(authHeader(token));
    expect(count.body.count).toBe(0);

    // Persisted: the document is really gone from MongoDB
    expect(await Notification.findById(notif._id)).toBeNull();
  });

  it("deleting another user's notification returns 403 and leaves it intact", async () => {
    const owner = await createAuthenticatedUser();
    const attacker = await createAuthenticatedUser();
    const notif = await seedNotification(owner.user._id, { read: false });

    const res = await request(app).delete(`/notifications/${notif._id}`).set(authHeader(attacker.token));

    expect(res.status).toBe(403);
    expect(await Notification.findById(notif._id)).not.toBeNull();
  });

  it('deleting a non-existent notification returns 404', async () => {
    const { token } = await makeUser('ghost');
    const res = await request(app).delete(`/notifications/${new mongoose.Types.ObjectId()}`).set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('deleting an already-deleted notification is safe (404, no side effects)', async () => {
    const { user, token } = await makeUser('twice');
    const notif = await seedNotification(user._id);

    await request(app).delete(`/notifications/${notif._id}`).set(authHeader(token));
    const second = await request(app).delete(`/notifications/${notif._id}`).set(authHeader(token));
    expect(second.status).toBe(404);
  });

  it('deleted notifications never reappear in pagination', async () => {
    const { user, token } = await makeUser('paged');
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const n = await seedNotification(user._id, { title: `N${i}` });
      ids.push(n._id);
    }

    // Delete the second item of page 1
    await request(app).delete(`/notifications/${ids[1]}`).set(authHeader(token));

    const page1 = await request(app).get('/notifications?page=1&limit=2').set(authHeader(token));
    const page1Ids = page1.body.notifications.map((n) => n._id);
    expect(page1Ids).not.toContain(ids[1].toString());
    expect(page1.body.total).toBe(4);

    const page2 = await request(app).get('/notifications?page=2&limit=2').set(authHeader(token));
    const page2Ids = page2.body.notifications.map((n) => n._id);
    expect(page2Ids).not.toContain(ids[1].toString());
    expect(page2Ids).toHaveLength(2);
  });
});
