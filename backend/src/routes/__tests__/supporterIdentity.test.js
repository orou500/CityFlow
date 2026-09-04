import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createAuthenticatedAdmin, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import { DEFAULT_COSMETICS, validateAndSanitizeCosmetics } from '../../config/supporterCosmetics.js';

const app = createApp();

async function makeSupporter(badge = 'supporter', totalDonated = 10) {
  const { user, token } = await createAuthenticatedUser({
    supporter: { badge, title: 'Community Supporter', isAnonymous: false },
    donationStats: { totalDonated, donorSince: new Date('2026-01-01'), donationCount: 1 },
  });
  return { user, token };
}

describe('Supporter Identity — cosmetics', () => {
  describe('GET /supporter-identity/options', () => {
    it('returns whitelisted options without auth', async () => {
      const res = await request(app).get('/supporter-identity/options');
      expect(res.status).toBe(200);
      expect(res.body.options).toBeTruthy();
      expect(res.body.options.usernameColors).toBeInstanceOf(Array);
      expect(res.body.options.gradients).toBeInstanceOf(Object);
    });
  });

  describe('GET /supporter-identity/me', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/supporter-identity/me');
      expect(res.status).toBe(401);
    });

    it('reports supporter identity for a supporter', async () => {
      const { token } = await makeSupporter('founding_supporter', 120);
      const res = await request(app).get('/supporter-identity/me').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.identity.isSupporter).toBe(true);
      expect(res.body.identity.tier).toBe('founding_supporter');
      expect(res.body.identity.supporterSince).toBeTruthy();
      expect(res.body.editable).toBe(true);
    });

    it('reports non-supporter as ineligible (not editable)', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).get('/supporter-identity/me').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.identity.isSupporter).toBe(false);
      expect(res.body.editable).toBe(false);
    });
  });

  describe('PUT /supporter-identity/me', () => {
    it('rejects a non-supporter (server-authoritative eligibility)', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { usernameStyle: { type: 'static', color: 'gold' } } });
      expect(res.status).toBe(403);
    });

    it('saves valid cosmetics for a supporter', async () => {
      const { token } = await makeSupporter('early_supporter', 30);
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({
          cosmetics: {
            usernameStyle: { type: 'gradient', color: 'cityflow_cyan', gradient: 'ocean_dream', animated: false },
            usernameEffect: 'soft_glow',
            profileBackground: 'ocean_city',
            profileBackgroundEffect: 'gradient',
            profileBorder: 'cyan',
            avatarFrame: 'gradient_ring',
            badge: 'early_supporter',
            title: 'urban_investor',
          },
        });
      expect(res.status).toBe(200);
      expect(res.body.identity.cosmetics.usernameStyle.gradient).toBe('ocean_dream');
      expect(res.body.identity.cosmetics.avatarFrame).toBe('gradient_ring');
      expect(res.body.identity.cosmetics.title).toBe('urban_investor');
    });

    it('rejects an unknown color (no arbitrary color injection)', async () => {
      const { token } = await makeSupporter();
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { usernameStyle: { type: 'static', color: 'url(javascript:alert(1))' } } });
      expect(res.status).toBe(400);
    });

    it('rejects raw CSS / HTML injection', async () => {
      const { token } = await makeSupporter();
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({
          cosmetics: {
            usernameStyle: { type: 'static', color: 'red; } body { display:none }' },
            profileBackground: 'xss</div><script>alert(1)</script>',
          },
        });
      expect(res.status).toBe(400);
    });

    it('rejects a tier-locked option (no tier spoofing)', async () => {
      const { token } = await makeSupporter('supporter', 10);
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { profileBackground: 'deep_space' } }); // founding tier only
      expect(res.status).toBe(400);
    });

    it('rejects a badge claiming a higher tier', async () => {
      const { token } = await makeSupporter('supporter', 10);
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { badge: 'founding_supporter' } });
      expect(res.status).toBe(400);
    });

    it('rejects unknown preset/title/effect ids', async () => {
      const { token } = await makeSupporter();
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { title: 'not-a-real-title' } });
      expect(res.status).toBe(400);
    });

    it('persists across fetches (server persistence, not localStorage)', async () => {
      const { user, token } = await makeSupporter('early_supporter', 30);
      const res = await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { profileBackground: 'midnight_city', usernameEffect: 'glow' } });
      expect(res.status).toBe(200);

      const refreshed = await User.findById(user._id);
      expect(refreshed.cosmetics.profileBackground).toBe('midnight_city');
      expect(refreshed.cosmetics.usernameEffect).toBe('glow');
    });
  });

  describe('POST /supporter-identity/me/reset', () => {
    it('resets cosmetics to default while preserving badge', async () => {
      const { user, token } = await makeSupporter('early_supporter', 30);
      await request(app)
        .put('/supporter-identity/me')
        .set(authHeader(token))
        .send({ cosmetics: { profileBackground: 'neon_metro' } });

      const res = await request(app).post('/supporter-identity/me/reset').set(authHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.identity.cosmetics.profileBackground).toBe('none');

      const refreshed = await User.findById(user._id);
      expect(refreshed.cosmetics.usernameEffect).toBe(DEFAULT_COSMETICS.usernameEffect);
      expect(refreshed.supporter.badge).toBe('early_supporter');
    });

    it('rejects non-supporter reset', async () => {
      const { token } = await createAuthenticatedUser();
      const res = await request(app).post('/supporter-identity/me/reset').set(authHeader(token));
      expect(res.status).toBe(403);
    });
  });
});

describe('Supporter Identity — validation unit', () => {
  it('accepts static color for supporter', () => {
    const { ok, cosmetics } = validateAndSanitizeCosmetics(
      { usernameStyle: { type: 'static', color: 'cityflow_blue' } },
      'supporter',
    );
    expect(ok).toBe(true);
    expect(cosmetics.usernameStyle.type).toBe('static');
  });

  it('rejects animated gradient for tier-1 supporter', () => {
    const r = validateAndSanitizeCosmetics(
      { usernameStyle: { type: 'animated-gradient', color: 'cityflow_cyan', gradient: 'neon', animated: true } },
      'supporter',
    );
    expect(r.ok).toBe(false);
  });

  it('accepts animated gradient for early supporter', () => {
    const r = validateAndSanitizeCosmetics(
      { usernameStyle: { type: 'animated-gradient', color: 'cityflow_cyan', gradient: 'neon', animated: true } },
      'early_supporter',
    );
    expect(r.ok).toBe(true);
    expect(r.cosmetics.usernameStyle.animated).toBe(true);
  });

  it('rejects non-supporter entirely', () => {
    const r = validateAndSanitizeCosmetics({ usernameStyle: { type: 'static', color: 'gold' } }, 'none');
    expect(r.ok).toBe(false);
  });
});

describe('Supporter Identity — admin visibility', () => {
  it('rejects non-admin lookup', async () => {
    const { token } = await createAuthenticatedUser();
    const res = await request(app).get('/supporter-identity/admin/someuser').set(authHeader(token));
    expect(res.status).toBe(403);
  });

  it('lets an admin inspect a supporter by username', async () => {
    const { user } = await makeSupporter('founding_supporter', 150);
    const { token } = await createAuthenticatedAdmin();
    const res = await request(app).get(`/supporter-identity/admin/${user.username}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.supporter.badge).toBe('founding_supporter');
    expect(res.body.supporter.eligible).toBe(true);
    expect(res.body.donationStats.totalDonated).toBe(150);
    expect(res.body.cosmetics).toBeTruthy();
  });

  it('returns 404 for unknown user', async () => {
    const { token } = await createAuthenticatedAdmin();
    const res = await request(app).get('/supporter-identity/admin/doesnotexist').set(authHeader(token));
    expect(res.status).toBe(404);
  });
});

describe('Supporter Identity — one-time onboarding', () => {
  it('reports none when no donation ever armed onboarding', async () => {
    const { token } = await makeSupporter('supporter', 10);
    const res = await request(app).get('/supporter-identity/onboarding').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
    expect(res.body.supporter).toBe(true);
  });

  it('arms onboarding as pending for a confirmed first-time supporter', async () => {
    const { user, token } = await makeSupporter('supporter', 10);
    user.supporterOnboarding = { status: 'pending', startedAt: new Date() };
    await user.save();

    const res = await request(app).get('/supporter-identity/onboarding').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  it('complete flips pending → completed exactly once', async () => {
    const { user, token } = await makeSupporter('supporter', 10);
    user.supporterOnboarding = { status: 'pending', startedAt: new Date() };
    await user.save();

    const res = await request(app).post('/supporter-identity/onboarding/complete').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');

    const fresh = await User.findById(user._id);
    expect(fresh.supporterOnboarding.status).toBe('completed');
    expect(fresh.supporterOnboarding.completedAt).toBeTruthy();

    // Idempotent — completing again does not change anything.
    const again = await request(app).post('/supporter-identity/onboarding/complete').set(authHeader(token));
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('completed');
  });

  it('skip flips pending → skipped exactly once', async () => {
    const { user, token } = await makeSupporter('supporter', 10);
    user.supporterOnboarding = { status: 'pending', startedAt: new Date() };
    await user.save();

    const res = await request(app).post('/supporter-identity/onboarding/skip').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('skipped');

    const fresh = await User.findById(user._id);
    expect(fresh.supporterOnboarding.status).toBe('skipped');
  });

  it('requires auth', async () => {
    const res = await request(app).get('/supporter-identity/onboarding');
    expect(res.status).toBe(401);
    const skip = await request(app).post('/supporter-identity/onboarding/skip');
    expect(skip.status).toBe(401);
  });

  it('a non-supporter cannot arm onboarding via the API', async () => {
    const { token } = await createAuthenticatedUser();
    const res = await request(app).post('/supporter-identity/onboarding/complete').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('none');
  });
});
