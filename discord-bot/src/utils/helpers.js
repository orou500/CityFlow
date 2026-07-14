import { EmbedBuilder } from 'discord.js';
import config from '../config.js';

export function embed(title, description, color = config.embedColor) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
}

export function successEmbed(title, description) {
  return embed(title, description, config.successColor);
}

export function errorEmbed(title, description) {
  return embed(title, description, config.errorColor);
}

export function hasPermission(member, permissions) {
  return permissions.some((p) => member.permissions.has(p));
}

export function parseDuration(text) {
  const match = text.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const [, amount, unit] = match;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return parseInt(amount) * multipliers[unit];
}

export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function truncate(str, max = 1024) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}
