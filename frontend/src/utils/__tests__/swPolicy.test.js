import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SW_SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../public/sw.js'), 'utf8');

function extractExclusionRegex() {
  const match = SW_SOURCE.match(/^const IS_GAME_API_REGEX = (.+);$/m);
  if (!match) throw new Error('IS_GAME_API_REGEX not found in sw.js');
  return Function(`return ${match[1]}`)();
}

describe('service worker cache policy', () => {
  const gameApiRegex = extractExclusionRegex();

  it('excludes /api/* requests from caching', () => {
    expect(gameApiRegex.test('/api')).toBe(true);
    expect(gameApiRegex.test('/api/')).toBe(true);
    expect(gameApiRegex.test('/api/world/status')).toBe(true);
    expect(gameApiRegex.test('/api/auth/login')).toBe(true);
    expect(gameApiRegex.test('/api/users/me')).toBe(true);
    expect(gameApiRegex.test('/api/properties')).toBe(true);
    expect(gameApiRegex.test('/api/companies/123')).toBe(true);
    expect(gameApiRegex.test('/api/notifications')).toBe(true);
  });

  it('excludes /uploads/* requests from caching', () => {
    expect(gameApiRegex.test('/uploads/')).toBe(true);
    expect(gameApiRegex.test('/uploads/avatar/abc.png')).toBe(true);
    expect(gameApiRegex.test('/uploads/properties/123.webp')).toBe(true);
  });

  it('does not cache-lock legitimate shell assets', () => {
    expect(gameApiRegex.test('/')).toBe(false);
    expect(gameApiRegex.test('/assets/index-abc123.js')).toBe(false);
    expect(gameApiRegex.test('/assets/main-xyz.css')).toBe(false);
    expect(gameApiRegex.test('/icons/pwa-192x192.png')).toBe(false);
    expect(gameApiRegex.test('/manifest.webmanifest')).toBe(false);
    expect(gameApiRegex.test('/map')).toBe(false);
    expect(gameApiRegex.test('/login')).toBe(false);
  });

  it('only caches successful, same-origin GET responses', () => {
    expect(SW_SOURCE).toMatch(/if \(request\.method !== 'GET'\) return;/);
    expect(SW_SOURCE).toMatch(/if \(url\.origin !== self\.location\.origin\) return;/);
    expect(SW_SOURCE).toMatch(/if \(!response \|\| !response\.ok\) return;/);
  });

  it('guards every caching path behind the exclusion check (never respondWith for game data)', () => {
    const exclusionCheck = SW_SOURCE.match(/if \(IS_GAME_API_REGEX\.test\(url\.pathname\)\) return;/);
    expect(exclusionCheck).not.toBeNull();
    const firstRespondWith = SW_SOURCE.indexOf('event.respondWith(');
    expect(exclusionCheck.index).toBeLessThan(firstRespondWith);
  });
});
