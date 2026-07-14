import { Events, Collection } from 'discord.js';
import { embed, errorEmbed } from '../utils/helpers.js';
import logger from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    const { cooldowns } = client;
    if (!cooldowns.has(command.data.name)) {
      cooldowns.set(command.data.name, new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const cooldownMs = (command.cooldown || 3) * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expire = timestamps.get(interaction.user.id) + cooldownMs;
      if (now < expire) {
        const remain = ((expire - now) / 1000).toFixed(1);
        return interaction.reply({
          embeds: [errorEmbed('Cooldown', `Wait ${remain}s before using \`/${command.data.name}\` again.`)],
          ephemeral: true,
        });
      }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownMs);

    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error(`Error in /${command.data.name}: ${error.message}`);
      const reply = {
        embeds: [errorEmbed('Error', 'Something went wrong.')],
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  },
};
