/**
 * Minimal VAST 3.0 linear parser (InLine ads only). Dependency-free: uses
 * DOMParser + native <video>. Returns normalized ads so the player can play
 * them sequentially and fire tracking/impression beacons.
 *
 * Wrapper ads (nested VAST fetches) are intentionally not followed — ad
 * sources like the HilltopAds tag used by CityFlow serve InLine creatives.
 */

const PREFERRED_MEDIA_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/flv', 'video/x-flv'];

function parseDuration(value = '') {
  const text = value.trim();
  if (!text) return 0;
  const parts = text.split(':').map((p) => Number(p || 0));
  if (parts.every((n) => Number.isFinite(n)) && parts.length >= 2) {
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) ? seconds : 0;
}

function text(node) {
  if (!node) return '';
  return (node.textContent || '').trim();
}

function textChildren(parent, selector) {
  if (!parent) return [];
  return Array.from(parent.getElementsByTagName(selector))
    .map((el) => text(el))
    .filter(Boolean);
}

function collectTracking(linear) {
  const tracking = {};
  const events = linear.getElementsByTagName('Tracking');
  for (const el of events) {
    const name = el.getAttribute('event') || '';
    const url = text(el);
    if (!name || !url) continue;
    tracking[name] = [...(tracking[name] || []), url];
  }
  return tracking;
}

function parseInLine(adNode, adId) {
  const inline = adNode.getElementsByTagName('InLine')[0];
  if (!inline) return null;

  const creatives = inline.getElementsByTagName('Creative');
  const linearCreative = Array.from(creatives).find((c) => c.getElementsByTagName('Linear').length > 0);
  if (!linearCreative) return null;

  const linear = linearCreative.getElementsByTagName('Linear')[0];

  const mediaFiles = Array.from(linear.getElementsByTagName('MediaFile'))
    .map((el) => ({
      type: (el.getAttribute('type') || '').toLowerCase(),
      url: text(el),
      delivery: (el.getAttribute('delivery') || '').toLowerCase(),
    }))
    .filter((m) => m.url && /^https?:/i.test(m.url));

  if (mediaFiles.length === 0) return null;

  const byPriority = (a, b) => {
    const ia = PREFERRED_MEDIA_TYPES.indexOf(a.type);
    const ib = PREFERRED_MEDIA_TYPES.indexOf(b.type);
    if (ia !== ib) return ia === -1 ? 1 : ib === -1 ? -1 : ia - ib;
    return 0;
  };

  const clickThrough = linear.getElementsByTagName('ClickThrough')[0];

  return {
    id: adId || '',
    durationSeconds: parseDuration(text(linear.getElementsByTagName('Duration')[0])),
    media: mediaFiles.sort(byPriority),
    impressions: textChildren(inline, 'Impression'),
    tracking: collectTracking(linear),
    clickThrough: text(clickThrough),
  };
}

export function parseVast(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const errorNodes = xml.getElementsByTagName('parsererror');
  if (errorNodes.length > 0) return [];

  const ads = [];
  const adNodes = xml.getElementsByTagName('Ad');
  for (const adNode of adNodes) {
    const adId = adNode.getAttribute('id') || '';
    if (adNode.getElementsByTagName('Wrapper').length > 0) {
      // Wrappers need a follow-up VAST fetch — out of scope, skip.
      continue;
    }
    const parsed = parseInLine(adNode, adId);
    if (parsed) ads.push(parsed);
  }
  return ads;
}

export function fireUrl(url) {
  if (!url) return;
  try {
    const img = new Image();
    img.src = url;
  } catch {
    // beacon already fired or blocked (CSP etc.) — never throw in play
  }
}
