import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../test/createApp.js';
import {
  createAuthenticatedUser,
  createTestUser,
  generateExpiredToken,
  generateTokenWithBadSecret,
  authHeader,
} from '../../test/helpers.js';
import { config } from '../../config/index.js';
import User from '../../models/User.js';

const app = createApp();

describe('POST /auth/register', () => {
  it('registers a new user successfully', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'freshuser',
      email: 'fresh@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/verify your email/i);

    const user = await User.findOne({ email: 'fresh@example.com' });
    expect(user).toBeTruthy();
    expect(user.username).toBe('freshuser');
    expect(user.emailVerified).toBe(false);
  });

  it('does not return a token on registration', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'tokentest',
      email: 'token@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('token');
    expect(res.body).not.toHaveProperty('user');
  });

  it('rejects when username is missing', async () => {
    const res = await request(app).post('/auth/register').send({ email: 'test@example.com', password: 'SecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('All fields are required');
  });

  it('rejects when email is missing', async () => {
    const res = await request(app).post('/auth/register').send({ username: 'testuser', password: 'SecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('All fields are required');
  });

  it('rejects when password is missing', async () => {
    const res = await request(app).post('/auth/register').send({ username: 'testuser', email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('All fields are required');
  });

  it('rejects when all fields are missing', async () => {
    const res = await request(app).post('/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('All fields are required');
  });

  it('rejects when passwords do not match', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'nomatch',
      email: 'nomatch@example.com',
      password: 'SecurePass1',
      confirmPassword: 'DifferentPass1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/do not match/i);
  });

  it('rejects duplicate username', async () => {
    await request(app).post('/auth/register').send({
      username: 'dupeuser',
      email: 'first@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    const res = await request(app).post('/auth/register').send({
      username: 'dupeuser',
      email: 'second@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/auth/register').send({
      username: 'firstmail',
      email: 'duemail@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    const res = await request(app).post('/auth/register').send({
      username: 'secondmail',
      email: 'duemail@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe('POST /auth/login', () => {
  beforeAll(async () => {
    await request(app).post('/auth/register').send({
      username: 'logintest',
      email: 'login@example.com',
      password: 'SecurePass1',
      confirmPassword: 'SecurePass1',
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    await User.findOneAndUpdate({ email: 'login@example.com' }, { emailVerified: true, emailVerifiedAt: new Date() });
  });

  it('logs in with username', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'logintest', password: 'SecurePass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe('logintest');
    expect(res.body.user.email).toBe('login@example.com');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('logs in with email', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'login@example.com', password: 'SecurePass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe('logintest');
  });

  it('logs in with email in different case', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'LOGIN@EXAMPLE.COM', password: 'SecurePass1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'logintest', password: 'WrongPassword1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects non-existent username', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'nonexistentuser', password: 'SecurePass1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects non-existent email', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'noone@example.com', password: 'SecurePass1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects missing login field', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'SecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('rejects missing password field', async () => {
    const res = await request(app).post('/auth/login').send({ login: 'logintest' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('rejects empty login', async () => {
    const res = await request(app).post('/auth/login').send({ login: '', password: 'SecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });
});

describe('GET /auth/me', () => {
  it('returns the authenticated user profile', async () => {
    const { user, token } = await createAuthenticatedUser();

    const res = await request(app).get('/auth/me').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(user.username);
    expect(res.body.email).toBe(user.email);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body).toHaveProperty('balance');
    expect(res.body).toHaveProperty('_id');
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for invalid token', async () => {
    const res = await request(app).get('/auth/me').set(authHeader('this-is-not-a-valid-jwt'));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('returns 401 for expired token', async () => {
    const user = await createTestUser();
    const token = generateExpiredToken(user._id);

    const res = await request(app).get('/auth/me').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('returns 401 for token signed with wrong secret', async () => {
    const user = await createTestUser();
    const token = generateTokenWithBadSecret(user._id);

    const res = await request(app).get('/auth/me').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  it('returns 401 when user is deleted', async () => {
    const { user, token } = await createAuthenticatedUser();
    await user.constructor.findByIdAndDelete(user._id);

    const res = await request(app).get('/auth/me').set(authHeader(token));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('User not found');
  });

  it('returns 401 with malformed authorization header', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'malformed');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 with empty Bearer token', async () => {
    const res = await request(app).get('/auth/me').set(authHeader(''));

    expect(res.status).toBe(401);
  });
});

describe('Token lifecycle', () => {
  it('token expires after 7 days', async () => {
    const { user } = await createAuthenticatedUser();
    const token = jwt.sign({ userId: user._id }, config.jwtSecret, { expiresIn: '7d' });

    const decoded = jwt.decode(token);
    const exp = decoded.exp;
    const iat = decoded.iat;
    const maxLifetime = 7 * 24 * 60 * 60;

    expect(exp - iat).toBe(maxLifetime);
  });

  it('different users get different tokens', async () => {
    const { token: tokenA } = await createAuthenticatedUser({ username: 'diffuser_a', email: 'diff_a@test.com' });
    const { token: tokenB } = await createAuthenticatedUser({ username: 'diffuser_b', email: 'diff_b@test.com' });

    expect(tokenA).not.toBe(tokenB);

    const decodedA = jwt.decode(tokenA);
    const decodedB = jwt.decode(tokenB);
    expect(decodedA.userId).not.toBe(decodedB.userId);
  });

  it('same user can have multiple valid tokens', async () => {
    const user = await createTestUser({ username: 'multitoken', email: 'multi@test.com' });
    const token1 = jwt.sign({ userId: user._id }, config.jwtSecret, { expiresIn: '7d' });
    const token2 = jwt.sign({ userId: user._id }, config.jwtSecret, { expiresIn: '7d' });

    const res1 = await request(app).get('/auth/me').set(authHeader(token1));
    const res2 = await request(app).get('/auth/me').set(authHeader(token2));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
