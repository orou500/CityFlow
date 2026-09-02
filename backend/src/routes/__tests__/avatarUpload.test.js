import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import userRoutes from '../users.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const avatarsDir = path.join(__dirname, '../../../uploads/avatars');
const uploadsRoot = path.join(__dirname, '../../../uploads');

// createApp() registers its SPA-style 404 catch-all last, so a `/uploads`
// static mount added afterwards would never be reached. Build the app the same
// way index.js does for a real test of upload + static serving.
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/users', userRoutes);
app.use('/uploads', express.static(uploadsRoot));
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

async function pngBuffer({ width = 64, height = 64 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: '#d04a4a' } })
    .png()
    .toBuffer();
}

function attachAvatar(req, buffer, contentType = 'image/png') {
  return req.attach('avatar', buffer, { filename: 'avatar.png', contentType });
}

beforeAll(async () => {
  await fs.rm(avatarsDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(avatarsDir, { recursive: true, force: true });
});

describe('Avatar upload & serving', () => {
  it('uploads a valid image, writes <userId>.webp and persists the user avatar path', async () => {
    const { user, token } = await createAuthenticatedUser();
    const res = await attachAvatar(request(app).post('/users/avatar').set(authHeader(token)), await pngBuffer());
    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(`/uploads/avatars/${user._id}.webp`);

    const filePath = path.join(avatarsDir, `${user._id}.webp`);
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);

    const updated = await User.findById(user._id);
    expect(updated.avatar).toBe(res.body.avatar);
  });

  it('creates the avatars dir when missing (fresh pod with a shared volume)', async () => {
    await fs.rm(avatarsDir, { recursive: true, force: true });
    const { user, token } = await createAuthenticatedUser();
    const res = await attachAvatar(request(app).post('/users/avatar').set(authHeader(token)), await pngBuffer());
    expect(res.status).toBe(200);
    expect(res.body.avatar).toBe(`/uploads/avatars/${user._id}.webp`);
    const stat = await fs.stat(path.join(avatarsDir, `${user._id}.webp`));
    expect(stat.isFile()).toBe(true);
  });

  it('rejects a corrupt payload with 400 and keeps the existing avatar', async () => {
    const { user, token } = await createAuthenticatedUser();
    const first = await attachAvatar(request(app).post('/users/avatar').set(authHeader(token)), await pngBuffer());
    expect(first.status).toBe(200);

    const res = await attachAvatar(
      request(app).post('/users/avatar').set(authHeader(token)),
      Buffer.from('this is definitely not an image'),
      'image/png',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid image file');

    const filePath = path.join(avatarsDir, `${user._id}.webp`);
    const stat = await fs.stat(filePath);
    expect(stat.isFile()).toBe(true);
    const updated = await User.findById(user._id);
    expect(updated.avatar).toBe(`/uploads/avatars/${user._id}.webp`);
  });

  it('serves an uploaded avatar as image/webp with 200', async () => {
    const { user, token } = await createAuthenticatedUser();
    const up = await attachAvatar(request(app).post('/users/avatar').set(authHeader(token)), await pngBuffer());
    expect(up.status).toBe(200);

    const res = await request(app).get(`/uploads/avatars/${user._id}.webp`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
  });

  it('returns 404 (not index.html) for a missing avatar', async () => {
    const res = await request(app).get('/uploads/avatars/does-not-exist.webp');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).not.toMatch(/html/);
  });
});
