import { config } from '../config/index.js';

function getBotConfig() {
  return {
    url: config.discordBotApiUrl,
    key: config.discordBotApiKey,
  };
}

async function botApiFetch(path, options = {}) {
  const { url, key } = getBotConfig();
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      ...options.headers,
    },
  });
  return res;
}

export async function sendDiscordNotification({ type, title, description, fields, color }) {
  const { url, key } = getBotConfig();
  if (!url || !key) return false;

  try {
    const res = await botApiFetch('/api/discord/notify', {
      method: 'POST',
      body: JSON.stringify({ type, title, description, fields, color }),
    });
    const data = await res.json();
    return data.success || false;
  } catch (err) {
    console.error(`[DISCORD] Failed to send notification: ${err.message}`);
    return false;
  }
}

export async function generateLinkCode(discordUserId) {
  const { url, key } = getBotConfig();
  if (!url || !key) return null;

  try {
    const res = await botApiFetch('/api/discord/link/generate', {
      method: 'POST',
      body: JSON.stringify({ discordUserId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.code || null;
  } catch (err) {
    console.error(`[DISCORD] Failed to generate link code: ${err.message}`);
    return null;
  }
}

export async function verifyLinkCode(code) {
  const { url, key } = getBotConfig();
  if (!url || !key) return null;

  try {
    const res = await botApiFetch(`/api/discord/link/verify/${code}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.valid) return null;
    return data.discordUserId || null;
  } catch (err) {
    console.error(`[DISCORD] Failed to verify link code: ${err.message}`);
    return null;
  }
}

export async function removeDiscordLink(discordUserId) {
  const { url, key } = getBotConfig();
  if (!url || !key) return false;

  try {
    const res = await botApiFetch(`/api/discord/link/${discordUserId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.error(`[DISCORD] Failed to remove link: ${err.message}`);
    return false;
  }
}
