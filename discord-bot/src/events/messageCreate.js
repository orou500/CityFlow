import { Events, EmbedBuilder } from 'discord.js';
import { getGuildConfig, logModAction } from '../utils/guildConfig.js';
import config from '../config.js';

const userMessages = new Map();

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    const guildCfg = await getGuildConfig(message.guild.id);
    if (!guildCfg) return;

    if (guildCfg.moderation?.antiSpam) {
      await checkSpam(message, guildCfg);
    }

    if (guildCfg.moderation?.badWords?.length) {
      await checkBadWords(message, guildCfg);
    }

    if (guildCfg.moderation?.filteredLinks?.length) {
      await checkLinks(message, guildCfg);
    }
  },
};

async function checkSpam(message, guildCfg) {
  const now = Date.now();
  const key = `${message.guild.id}-${message.author.id}`;
  const windowMs = 5000;
  const maxMessages = 5;

  if (!userMessages.has(key)) userMessages.set(key, []);

  const timestamps = userMessages.get(key);
  timestamps.push(now);

  while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= maxMessages) {
    try {
      await message.delete();
      await message.channel.send({
        embeds: [new EmbedBuilder().setTitle('Spam Detected').setDescription(`${message.author}, please stop spamming.`).setColor(config.errorColor)],
      }).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));

      if (timestamps.length >= maxMessages * 2) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member?.moderatable) {
          await member.timeout(60000, 'Anti-spam: excessive flooding');
          await logModAction(message.guild, guildCfg, new EmbedBuilder()
            .setTitle('Auto-Muted (Spam)')
            .setDescription(`${message.author.tag} auto-muted for 60s`)
            .setColor(config.errorColor)
            .setTimestamp());
        }
      }
    } catch {}
  }

  setTimeout(() => {
    const t = userMessages.get(key);
    if (t) {
      const idx = t.indexOf(now);
      if (idx > -1) t.splice(idx, 1);
      if (t.length === 0) userMessages.delete(key);
    }
  }, windowMs + 1000);
}

async function checkBadWords(message, guildCfg) {
  const content = message.content.toLowerCase();
  const words = guildCfg.moderation.badWords || [];

  for (const word of words) {
    if (content.includes(word)) {
      try {
        await message.delete();
        await message.channel.send({
          embeds: [new EmbedBuilder().setTitle('Filtered Message').setDescription(`${message.author}, your message contained a filtered word.`).setColor(config.errorColor)],
        }).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
      } catch {}
      break;
    }
  }
}

async function checkLinks(message, guildCfg) {
  const content = message.content.toLowerCase();
  const links = guildCfg.moderation.filteredLinks || [];

  for (const link of links) {
    if (content.includes(link)) {
      try {
        await message.delete();
        await message.channel.send({
          embeds: [new EmbedBuilder().setTitle('Filtered Link').setDescription(`${message.author}, that link is not allowed.`).setColor(config.errorColor)],
        }).then((m) => setTimeout(() => m.delete().catch(() => {}), 5000));
      } catch {}
      break;
    }
  }
}
