import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import GameState from '../../models/GameState.js';
import SizopsOutbox from '../../models/SizopsOutbox.js';
import SizopsAuditLog from '../../models/SizopsAuditLog.js';
import {
  enqueueSizopsDisconnect,
  processSizopsDisconnectOutbox,
  getPendingSizopsDisconnects,
} from '../../services/sizopsDisconnectOutbox.js';

const app = createApp();

let fetchMock;

function stubDisconnectApi({ ok = true, status = 200 } = {}) {
  fetchMock = vi.fn(async (url, _init) => {
    const u = String(url);
    if (u.endsWith('/api/v1/game/games/disconnect')) {
      return { ok, status, json: async () => ({ success: ok }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function makeLinkedUser() {
  const { user, token } = await createAuthenticatedUser({
    password: 'Password123',
    sizopsUserId: 'siz_disconnect_outbox_1',
    sizopsLinkedAt: new Date(),
  });
  return { user, token };
}

beforeEach(async () => {
  await User.deleteMany({});
  await GameState.deleteMany({});
  await SizopsOutbox.deleteMany({});
  await SizopsAuditLog.deleteMany({});
  await createTestCity();
  await GameState.create({ key: 'global', tickNumber: 100 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SizOps disconnect outbox', () => {
  it('unlink enqueues and processes the remote disconnect', async () => {
    stubDisconnectApi();
    const { user, token } = await makeLinkedUser();

    const res = await request(app).post('/auth/sizops/unlink').set(authHeader(token)).send({ password: 'Password123' });

    expect(res.status).toBe(200);

    const updated = await User.findById(user._id);
    expect(updated.sizopsUserId).toBeUndefined();

    await processSizopsDisconnectOutbox();
    const record = await SizopsOutbox.findOne({ sizopsUserId: 'siz_disconnect_outbox_1' });
    expect(record).toBeTruthy();
    expect(record.status).toBe('done');
    expect(fetchMock).toHaveBeenCalled();

    const audit = await SizopsAuditLog.findOne({ action: 'sizops.disconnect_notify' });
    expect(audit).toBeTruthy();
  });

  it('a failed remote call is retryable and reconciles on the next attempt', async () => {
    stubDisconnectApi({ ok: false, status: 500 });
    const record = await enqueueSizopsDisconnect('siz_retry_user');

    await processSizopsDisconnectOutbox();
    let after = await SizopsOutbox.findById(record._id);
    expect(after.status).toBe('pending');
    expect(after.attempts).toBe(1);
    expect(after.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    let failedAudit = await SizopsAuditLog.findOne({ action: 'sizops.disconnect_notify_failed' });
    expect(failedAudit).toBeTruthy();
    expect(failedAudit.details.attempts).toBe(1);

    stubDisconnectApi({ ok: true });
    await SizopsOutbox.updateOne({ _id: record._id }, { $set: { nextAttemptAt: new Date(0) } });
    await processSizopsDisconnectOutbox();

    after = await SizopsOutbox.findById(record._id);
    expect(after.status).toBe('done');
    const okAudit = await SizopsAuditLog.findOne({ action: 'sizops.disconnect_notify' });
    expect(okAudit).toBeTruthy();
  });

  it('enqueue is idempotent per user', async () => {
    stubDisconnectApi();
    await enqueueSizopsDisconnect('siz_idem_user');
    await enqueueSizopsDisconnect('siz_idem_user');
    expect(await SizopsOutbox.countDocuments({ sizopsUserId: 'siz_idem_user' })).toBe(1);
  });

  it('a done record is never reprocessed', async () => {
    stubDisconnectApi();
    const record = await enqueueSizopsDisconnect('siz_done_user');
    await processSizopsDisconnectOutbox();
    expect((await SizopsOutbox.findById(record._id)).status).toBe('done');

    const callsBefore = fetchMock.mock.calls.length;
    await processSizopsDisconnectOutbox();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('exhausted attempts are marked failed and surface in the pending metric', async () => {
    stubDisconnectApi({ ok: false, status: 500 });
    const record = await SizopsOutbox.create({
      sizopsUserId: 'siz_exhausted',
      event: 'disconnect',
      status: 'pending',
      attempts: 9,
      maxAttempts: 10,
      nextAttemptAt: new Date(0),
    });

    await processSizopsDisconnectOutbox();
    const after = await SizopsOutbox.findById(record._id);
    expect(after.status).toBe('failed');
    expect(after.lastError).toBeTruthy();

    const pending = await getPendingSizopsDisconnects();
    expect(pending).toBe(1);
  });
});
