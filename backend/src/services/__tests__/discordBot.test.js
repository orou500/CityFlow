import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/index.js', () => ({
  config: {
    get discordBotApiUrl() {
      return process.env.DISCORD_BOT_API_URL || 'http://cityflow-discord-bot:5001';
    },
    get discordBotApiKey() {
      return process.env.DISCORD_BOT_API_KEY || '';
    },
  },
}));

describe('Discord Bot Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = originalFetch;
    process.env.DISCORD_BOT_API_URL = 'http://localhost:5001';
    process.env.DISCORD_BOT_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('sendDiscordNotification', () => {
    it('returns false when config is missing', async () => {
      delete process.env.DISCORD_BOT_API_URL;
      delete process.env.DISCORD_BOT_API_KEY;

      const { sendDiscordNotification } = await import('../../services/discordBot.js');
      const result = await sendDiscordNotification({
        type: 'systemAlerts',
        title: 'Test',
        description: 'Test notification',
      });

      expect(result).toBe(false);
    });

    it('sends notification via bot API', async () => {
      process.env.DISCORD_BOT_API_URL = 'http://localhost:5001';
      process.env.DISCORD_BOT_API_KEY = 'test-key';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      const { sendDiscordNotification } = await import('../../services/discordBot.js');
      const result = await sendDiscordNotification({
        type: 'worldEvents',
        title: 'Economic Boom',
        description: 'Strong economic growth',
        fields: [{ name: 'Scope', value: 'Global' }],
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/discord/notify',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
          }),
        }),
      );
    });

    it('returns false on network error', async () => {
      process.env.DISCORD_BOT_API_URL = 'http://localhost:5001';
      process.env.DISCORD_BOT_API_KEY = 'test-key';

      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const { sendDiscordNotification } = await import('../../services/discordBot.js');
      const result = await sendDiscordNotification({
        type: 'systemAlerts',
        title: 'Test',
      });

      expect(result).toBe(false);
    });
  });

  describe('verifyLinkCode', () => {
    it('returns discordUserId on valid code', async () => {
      process.env.DISCORD_BOT_API_URL = 'http://localhost:5001';
      process.env.DISCORD_BOT_API_KEY = 'test-key';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, discordUserId: '123456789' }),
      });

      const { verifyLinkCode } = await import('../../services/discordBot.js');
      const result = await verifyLinkCode('123456');

      expect(result).toBe('123456789');
    });

    it('returns null on invalid code', async () => {
      process.env.DISCORD_BOT_API_URL = 'http://localhost:5001';
      process.env.DISCORD_BOT_API_KEY = 'test-key';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ valid: false, error: 'Invalid code' }),
      });

      const { verifyLinkCode } = await import('../../services/discordBot.js');
      const result = await verifyLinkCode('000000');

      expect(result).toBeNull();
    });
  });
});
