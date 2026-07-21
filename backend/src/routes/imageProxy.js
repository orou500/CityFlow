import express from 'express';
import https from 'https';
import http from 'http';

const router = express.Router();

const ALLOWED_HOSTS = [
  'lh3.googleusercontent.com',
  'pbs.twimg.com',
  'avatars.githubusercontent.com',
  'cdn.discordapp.com',
];

const MAX_REDIRECTS = 5;

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const request = lib.get(
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
          let nextUrl = res.headers.location;
          try {
            nextUrl = new URL(nextUrl, url).href;
          } catch {
            return reject(new Error('Invalid redirect URL'));
          }
          fetchUrl(nextUrl, redirectCount + 1)
            .then(resolve)
            .catch(reject);
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

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    if (!parsed.hostname || !ALLOWED_HOSTS.includes(parsed.hostname)) {
      return res.status(403).json({ error: 'Host not allowed' });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(400).json({ error: 'Invalid protocol' });
    }

    const proxyRes = await fetchUrl(parsed.href);

    if (proxyRes.statusCode < 200 || proxyRes.statusCode >= 300) {
      proxyRes.resume();
      return res.status(502).json({ error: `Upstream returned ${proxyRes.statusCode}` });
    }

    const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
    const cacheControl = proxyRes.headers['cache-control'] || 'public, max-age=86400';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Access-Control-Allow-Origin', '*');

    proxyRes.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to proxy image' });
    }
  }
});

export default router;
