import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticate, optionalAuth } from '../auth.js';
import { requireAdmin } from '../admin.js';
import {
  createTestUser,
  createAuthenticatedUser,
  createAuthenticatedAdmin,
  generateExpiredToken,
  generateTokenWithBadSecret,
  authHeader,
} from '../../test/helpers.js';

function createAuthTestApp(middleware) {
  const app = express();
  app.use(express.json());
  app.get('/protected', middleware, (req, res) => {
    res.json({ userId: req.user._id.toString(), role: req.user.role });
  });
  return app;
}

describe('authenticate middleware', () => {
  it('allows request with valid token', async () => {
    const { user, token } = await createAuthenticatedUser();
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user._id.toString());
  });

  it('rejects request with no authorization header', async () => {
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('rejects request with malformed header (no Bearer)', async () => {
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set('Authorization', 'Token abc');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('rejects request with empty token', async () => {
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set(authHeader(''));

    expect(res.status).toBe(401);
  });

  it('rejects request with invalid token', async () => {
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set(authHeader('invalid-token'));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('rejects request with token signed with wrong secret', async () => {
    const user = await createTestUser();
    const token = generateTokenWithBadSecret(user._id);
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('rejects request with expired token', async () => {
    const user = await createTestUser();
    const token = generateExpiredToken(user._id);
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('rejects request when user was deleted', async () => {
    const { user, token } = await createAuthenticatedUser();
    await user.constructor.findByIdAndDelete(user._id);
    const app = createAuthTestApp(authenticate);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('User not found');
  });
});

describe('optionalAuth middleware', () => {
  it('passes through with no header', async () => {
    const app = express();
    app.get('/optional', optionalAuth, (req, res) => {
      res.json({ hasUser: !!req.user });
    });

    const res = await request(app).get('/optional');

    expect(res.status).toBe(200);
    expect(res.body.hasUser).toBe(false);
  });

  it('sets user with valid token', async () => {
    const { user, token } = await createAuthenticatedUser();
    const app = express();
    app.get('/optional', optionalAuth, (req, res) => {
      res.json({ hasUser: !!req.user, userId: req.user?._id?.toString() });
    });

    const res = await request(app).get('/optional').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.hasUser).toBe(true);
    expect(res.body.userId).toBe(user._id.toString());
  });

  it('ignores invalid token and continues', async () => {
    const app = express();
    app.get('/optional', optionalAuth, (req, res) => {
      res.json({ hasUser: !!req.user });
    });

    const res = await request(app).get('/optional').set(authHeader('garbage-token'));

    expect(res.status).toBe(200);
    expect(res.body.hasUser).toBe(false);
  });

  it('ignores expired token and continues', async () => {
    const user = await createTestUser();
    const token = generateExpiredToken(user._id);
    const app = express();
    app.get('/optional', optionalAuth, (req, res) => {
      res.json({ hasUser: !!req.user });
    });

    const res = await request(app).get('/optional').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.hasUser).toBe(false);
  });
});

describe('requireAdmin middleware', () => {
  it('allows admin user', async () => {
    const { user, token } = await createAuthenticatedAdmin();
    const app = createAuthTestApp(requireAdmin);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  it('rejects non-admin user', async () => {
    const { token } = await createAuthenticatedUser({ role: 'user' });
    const app = createAuthTestApp(requireAdmin);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('rejects unauthenticated request', async () => {
    const app = createAuthTestApp(requireAdmin);

    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
  });

  it('rejects non-admin even with valid token', async () => {
    const { token } = await createAuthenticatedUser();
    const app = createAuthTestApp(requireAdmin);

    const res = await request(app).get('/protected').set(authHeader(token));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });
});
