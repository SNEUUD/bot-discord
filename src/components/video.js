const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { submitEpisode } = require("../commands/video");
const logger = require("../utils/logger");
const pixelauto = require("../utils/pixelauto");
const { formatError } = require("../utils/videoTracker");

// Modale de /video creer.
async function create(interaction) {
  const input = interaction.fields.getTextInputValue("episode");
  await submitEpisode(interaction, { name: null, read: async () => input });
}

// Bouton « Annuler le rendu » ou menu « Annuler des rendus… » du message de
// suivi : customId "video:annuler:<auteur>[:<id>]".
async function cancel(interaction, ownerId, id) {
  if (
    interaction.user.id !== ownerId &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
  ) {
    await interaction.reply({
      content: "Seul l'auteur de la demande peut annuler ces rendus.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ids = interaction.isStringSelectMenu() ? interaction.values : [id];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lines = [];
  for (const videoId of ids) {
    try {
      // Sur un rendu terminé, DELETE supprimerait la vidéo au lieu d'annuler.
      const video = await pixelauto.getVideo(videoId);
      const title = `**${video.title ?? videoId}**`;
      if (video.status !== "queued" && video.status !== "running") {
        lines.push(`${title} : déjà terminé.`);
        continue;
      }
      await pixelauto.deleteVideo(videoId);
      logger.info(`Rendu ${videoId} annulé par ${interaction.user.tag}.`);
      lines.push(`🛑 ${title} : annulation demandée.`);
    } catch (error) {
      if (!(error instanceof pixelauto.PixelautoError)) throw error;
      lines.push(`\`${videoId}\` : ${formatError(error)}`);
    }
  }
  await interaction.editReply(lines.join("\n").slice(0, 2000));
}

module.exports = {
  customId: "video",
  async execute(interaction) {
    const [, action, ...args] = interaction.customId.split(":");
    if (action === "creer") {
      await create(interaction);
    } else if (action === "annuler") {
      await cancel(interaction, ...args);
    }
  },
};
