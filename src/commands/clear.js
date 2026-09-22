const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime un nombre de messages récents dans le salon.')
    .addIntegerOption((option) =>
      option
        .setName('nombre')
        .setDescription('Nombre de messages à supprimer (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),
  async execute(interaction) {
    const amount = interaction.options.getInteger('nombre', true);

    if (!interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
      await interaction.reply({
        content: 'Cette commande ne peut pas être utilisée ici.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
      const recent = messages.filter((message) => Date.now() - message.createdTimestamp < TWO_WEEKS);
      const old = messages.filter((message) => Date.now() - message.createdTimestamp >= TWO_WEEKS);

      let deletedCount = 0;

      if (recent.size > 0) {
        const deleted = await interaction.channel.bulkDelete(recent, true);
        deletedCount += deleted.size;
      }

      for (const message of old.values()) {
        try {
          await message.delete();
          deletedCount += 1;
        } catch (error) {
          logger.error(`Impossible de supprimer le message ${message.id} :`, error);
        }
      }

      const note = old.size > 0
        ? ' (les messages de plus de 14 jours ont été supprimés un par un, plus lentement)'
        : '';
      logger.info(`${deletedCount} message(s) supprimé(s) dans #${interaction.channel.name} par ${interaction.user.tag}.`);
      await interaction.editReply(`🗑️ ${deletedCount} message(s) supprimé(s).${note}`);
    } catch (error) {
      logger.error('Erreur pendant /clear :', error);
      await interaction.editReply('Impossible de supprimer ces messages.');
    }
  },
};
