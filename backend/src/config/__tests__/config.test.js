import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';

/**
 * Guard test for the FRONTEND_URL default chain.
 *
 * OAuth/SSO success redirects and emailed verify/reset links are built from
 * config.frontendUrl. The env-aware default must never point production at
 * http://localhost:3000, and an explicit FRONTEND_URL must always win.
 */
async function loadConfig({ env = {}, hideDotEnv = false } = {}) {
  vi.resetModules();

  const dotEnvPath = path.join(process.cwd(), '.env');
  const hidden = `${dotEnvPath}.guard-test-hidden`;
  const savedEnv = {};
  for (const key of Object.keys(env)) {
    savedEnv[key] = process.env[key];
  }
  Object.assign(process.env, env);

  let dotEnvMoved = false;
  if (hideDotEnv) {
    try {
      await fs.rename(dotEnvPath, hidden);
      dotEnvMoved = true;
    } catch {
      // No .env present — nothing to hide.
    }
  }

  try {
    const mod = await import('../index.js');
    return mod.config;
  } finally {
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    if (dotEnvMoved) {
      await fs.rename(hidden, dotEnvPath);
    }
  }
}

describe('config.frontendUrl default chain', () => {
  it('defaults to localhost:3000 outside production (no env override)', async () => {
    const config = await loadConfig({
      env: { NODE_ENV: 'development' },
      hideDotEnv: true,
    });
    expect(config.frontendUrl).toBe('http://localhost:3000');
  });

  it('defaults to the production frontend when NODE_ENV=production and no override is set', async () => {
    const config = await loadConfig({
      env: { NODE_ENV: 'production' },
      hideDotEnv: true,
    });
    expect(config.frontendUrl).toBe('https://cityflow.sizops.co.il');
  });

  it('always honors an explicit FRONTEND_URL override', async () => {
    const config = await loadConfig({
      env: { FRONTEND_URL: 'https://game.example.com' },
      hideDotEnv: true,
    });
    expect(config.frontendUrl).toBe('https://game.example.com');
  });

  it('explicit override wins even in production', async () => {
    const config = await loadConfig({
      env: { NODE_ENV: 'production', FRONTEND_URL: 'https://custom.example.com' },
      hideDotEnv: true,
    });
    expect(config.frontendUrl).toBe('https://custom.example.com');
  });
});
