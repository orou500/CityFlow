import mongoose from 'mongoose';
import path from 'node:path';
import { beforeAll, afterAll } from 'vitest';

function getTestDbName() {
  const filepath = globalThis.__vitest_worker__?.filepath;
  if (!filepath) return 'test_default';
  const base = path.basename(filepath).replace(/\.(test|spec)\.[jt]sx?$/i, '');
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40);
  return `test_${sanitized}`;
}

beforeAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  const uri = new URL(process.env.MONGODB_URI);
  uri.pathname = `/${getTestDbName()}`;
  await mongoose.connect(uri.toString());
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
