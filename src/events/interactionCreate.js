const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`Commande inconnue : ${interaction.commandName}`);
      return;
    }

    logger.info(`/${interaction.commandName} exécutée par ${interaction.user.tag} dans #${interaction.channel?.name ?? 'DM'}`);

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Erreur pendant l'exécution de /${interaction.commandName} :`, error);
      const reply = {
        content: "Une erreur s'est produite lors de l'exécution de cette commande.",
        flags: MessageFlags.Ephemeral,
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      } catch (fallbackError) {
        logger.error("Impossible d'envoyer le message d'erreur (interaction probablement expirée) :", fallbackError);
      }
    }
  },
};
