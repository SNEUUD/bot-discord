const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { submitEpisode } = require("../commands/video");
const logger = require("../utils/logger");
const pixelauto = require("../utils/pixelauto");
const { formatError } = require("../utils/videoTracker");

// Modale de /video creer.
async function create(interaction) {
  const input = interaction.fields.getTextInputValue("episode");
  await submitEpisode(interaction, async () => input);
}

// Bouton « Annuler le rendu » du message de suivi.
async function cancel(interaction, id, ownerId) {
  if (
    interaction.user.id !== ownerId &&
    !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
  ) {
    await interaction.reply({
      content: "Seul l'auteur de la demande peut annuler ce rendu.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    // Sur un rendu terminé, DELETE supprimerait la vidéo au lieu d'annuler.
    const video = await pixelauto.getVideo(id);
    if (video.status !== "queued" && video.status !== "running") {
      await interaction.editReply("Ce rendu est déjà terminé.");
      return;
    }
    await pixelauto.deleteVideo(id);
    logger.info(`Rendu ${id} annulé par ${interaction.user.tag}.`);
    await interaction.editReply("🛑 Annulation demandée.");
  } catch (error) {
    if (!(error instanceof pixelauto.PixelautoError)) throw error;
    await interaction.editReply(formatError(error));
  }
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
