import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';

vi.mock('../../services/discordBot.js', () => ({
  generateLinkCode: vi.fn().mockResolvedValue('123456'),
  verifyLinkCode: vi.fn().mockResolvedValue('discord-user-123'),
  removeDiscordLink: vi.fn().mockResolvedValue(true),
  sendDiscordNotification: vi.fn().mockResolvedValue(true),
}));

const app = createApp();

describe('Discord Routes', () => {
  describe('POST /discord/link/generate', () => {
    it('generates a link code for authenticated user', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .post('/discord/link/generate')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('123456');
    });

    it('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post('/discord/link/generate');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /discord/link/verify', () => {
    it('verifies a link code and stores discordId', async () => {
      const { user, token } = await createAuthenticatedUser();
      const res = await request(app)
        .post('/discord/link/verify')
        .set(authHeader(token))
        .send({ code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.discordUserId).toBe('discord-user-123');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.discordId).toBe('discord-user-123');
    });

    it('rejects missing code', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .post('/discord/link/verify')
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /discord/link', () => {
    it('unlinks discord account', async () => {
      const { user, token } = await createAuthenticatedUser({ discordId: 'discord-user-123' });
      const res = await request(app)
        .delete('/discord/link')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.discordId).toBeNull();
    });
  });

  describe('GET /discord/link/status', () => {
    it('returns linked status', async () => {
      const { token } = await createAuthenticatedUser({ discordId: 'discord-user-123' });
      const res = await request(app)
        .get('/discord/link/status')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.linked).toBe(true);
      expect(res.body.discordId).toBe('discord-user-123');
    });

    it('returns unlinked status', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .get('/discord/link/status')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.linked).toBe(false);
    });
  });

  describe('GET /discord/notifications/settings', () => {
    it('returns default settings for new user', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .get('/discord/notifications/settings')
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.preferences.gameEvents).toBe(true);
      expect(res.body.preferences.achievements).toBe(true);
    });
  });

  describe('PUT /discord/notifications/settings', () => {
    it('updates notification preferences', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .put('/discord/notifications/settings')
        .set(authHeader(token))
        .send({
          preferences: {
            gameEvents: false,
            achievements: false,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.preferences.gameEvents).toBe(false);
      expect(res.body.preferences.achievements).toBe(false);
      expect(res.body.preferences.systemAlerts).toBe(true);
    });

    it('updates enabled toggle', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .put('/discord/notifications/settings')
        .set(authHeader(token))
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
    });
  });
});
