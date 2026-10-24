const { Events } = require("discord.js");
const logger = require("../utils/logger");
const pixelauto = require("../utils/pixelauto");
const {
  attachmentSource,
  formatFailures,
  isJsonAttachment,
  submitEpisodes,
} = require("../utils/episodes");
const {
  messageTarget,
  trackVideos,
  trackingPayload,
} = require("../utils/videoTracker");

// Un message qui mentionne le bot avec des fichiers .json lance le rendu de
// chacun d'eux. Sans l'intent privilégié MessageContent, Discord ne transmet
// les pièces jointes que des messages qui mentionnent le bot.
module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.inGuild()) return;
    if (!message.mentions.users.has(message.client.user.id)) return;

    const files = message.attachments.filter(isJsonAttachment);
    if (files.size === 0) {
      if (message.attachments.size > 0) {
        await message.reply(
          "Joins un ou plusieurs fichiers `.json` d'épisode pour lancer leur rendu.",
        );
      }
      return;
    }
    if (!pixelauto.isConfigured()) {
      await message.reply(pixelauto.NOT_CONFIGURED_MESSAGE);
      return;
    }

    await message.channel.sendTyping().catch(() => {});
    const { videos, failures } = await submitEpisodes(
      files.map(attachmentSource),
      message.author.tag,
    );
    const header = formatFailures(failures);
    if (videos.length === 0) {
      await message.reply(header);
      return;
    }

    const reply = await message.reply({
      ...trackingPayload(videos, message.author.id, { header }),
      allowedMentions: { repliedUser: false },
    });
    trackVideos(messageTarget(reply, message.author.id), videos, {
      header,
    }).catch((error) => {
      logger.error("Erreur pendant le suivi des rendus :", error);
    });
  },
};
