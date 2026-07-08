import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';

const app = createApp();

describe('POST /auth/register', () => {
  it('registers a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'Password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe('newuser');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'nopass' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('All fields are required');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/auth/register')
      .send({ username: 'first', email: 'dup@example.com', password: 'Password123' });

    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'second', email: 'dup@example.com', password: 'Password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe('POST /auth/login', () => {
  beforeAll(async () => {
    await request(app)
      .post('/auth/register')
      .send({ username: 'loginuser', email: 'login@example.com', password: 'Password123' });
  });

  it('logs in with username', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'loginuser', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe('loginuser');
  });

  it('logs in with email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'login@example.com', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'loginuser', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects missing credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: 'loginuser' });

    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me', () => {
  it('returns authenticated user', async () => {
    const { token } = await createAuthenticatedUser();

    const res = await request(app)
      .get('/auth/me')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set(authHeader('invalid-token'));

    expect(res.status).toBe(401);
  });
});
