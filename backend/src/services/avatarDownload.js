import https from 'https';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AVATARS_DIR = path.join(__dirname, '../../uploads/avatars');

const MAX_REDIRECTS = 5;

function fetchWithRedirects(url, redirectCount = 0) {
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
          fetchWithRedirects(nextUrl, redirectCount + 1)
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

export async function downloadOAuthAvatar(userId, imageUrl) {
  try {
    if (!imageUrl || typeof imageUrl !== 'string') return null;

    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return null;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    const res = await fetchWithRedirects(imageUrl);

    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume();
      return null;
    }

    const contentType = res.headers['content-type'] || '';

    let ext = 'webp';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
    else if (contentType.includes('webp')) ext = 'webp';
    else if (contentType.includes('gif')) ext = 'gif';

    const filename = `${userId}.${ext}`;
    const outputPath = path.join(AVATARS_DIR, filename);

    await fs.mkdir(AVATARS_DIR, { recursive: true });

    const chunks = [];
    for await (const chunk of res) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return null;
    }

    await fs.writeFile(outputPath, buffer);

    return `/uploads/avatars/${filename}`;
  } catch {
    return null;
  }
}
