import express from 'express';
import https from 'https';
import dns from 'dns';

const router = express.Router();

const ALLOWED_HOSTS = [
  'lh3.googleusercontent.com',
  'pbs.twimg.com',
  'avatars.githubusercontent.com',
  'cdn.discordapp.com',
];

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

function isPrivateIp(address) {
  if (typeof address !== 'string') return true;
  const parts = address.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    return false;
  }
  if (address.includes(':')) {
    const lower = address.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fe80') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('::ffff:127.') ||
      lower.startsWith('::ffff:10.') ||
      lower.startsWith('::ffff:169.254.')
    );
  }
  return true;
}

/**
 * Validate a proxy target URL. Returns { ok, reason, url } — rejects
 * non-HTTPS URLs, hosts outside the allowlist, and (via DNS resolution)
 * destinations that resolve to private/loopback/link-local addresses.
 * `lookupFn` is injectable for tests.
 */
export async function validateProxyTarget(url, lookupFn = null) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'HTTPS only' };
  }

  if (!parsed.hostname || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return { ok: false, reason: 'Host not allowed' };
  }

  const lookup = lookupFn || ((host) => dns.promises.lookup(host, { all: true }));
  try {
    const addresses = await lookup(parsed.hostname);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (list.length === 0 || list.some((a) => isPrivateIp(a.address))) {
      return { ok: false, reason: 'Destination not allowed' };
    }
  } catch {
    return { ok: false, reason: 'Resolution failed' };
  }

  return { ok: true, url: parsed.href };
}

function fetchUrl(url, redirectCount = 0, redirectTargets = []) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'image/*',
        },
        timeout: 10000,
      },
      (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          res.resume();
          if (redirectCount >= MAX_REDIRECTS) {
            return reject(new Error('Too many redirects'));
          }
          let nextUrl;
          try {
            nextUrl = new URL(res.headers.location, url).href;
          } catch {
            return reject(new Error('Invalid redirect URL'));
          }
          // Re-validate the redirect destination — the allowlist must hold at
          // every hop (no redirect chains into internal/private hosts).
          validateProxyTarget(nextUrl).then((check) => {
            if (!check.ok) return reject(new Error(check.reason));
            if (redirectTargets.includes(check.url)) return reject(new Error('Redirect loop'));
            redirectTargets.push(check.url);
            fetchUrl(check.url, redirectCount + 1, redirectTargets)
              .then(resolve)
              .catch(reject);
          });
          return;
        }
        resolve(res);
      },
    );

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Timeout'));
    });
  });
}

router.get('/', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'url parameter required' });
    }

    const check = await validateProxyTarget(url);
    if (!check.ok) {
      return res.status(403).json({ error: check.reason });
    }

    const proxyRes = await fetchUrl(check.url, 0, [check.url]);

    if (proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
      proxyRes.resume();
      return res.status(502).json({ error: `Upstream returned ${proxyRes.statusCode}` });
    }

    const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
    const cacheControl = proxyRes.headers['cache-control'] || 'public, max-age=86400';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Enforce a response size cap — never stream unbounded content.
    let bytes = 0;
    proxyRes.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BYTES) {
        proxyRes.destroy();
        if (!res.headersSent) {
          res.status(502).json({ error: 'Response too large' });
        }
      }
    });
    proxyRes.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to proxy image' });
    }
  }
});

export default router;
