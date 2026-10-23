const { setTimeout: sleep } = require("node:timers/promises");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildPremiumTier,
  RESTJSONErrorCodes,
  time,
} = require("discord.js");
const logger = require("./logger");
const pixelauto = require("./pixelauto");

// L'API conseille d'interroger un rendu toutes les 3 à 5 s.
const POLL_INTERVAL_MS = 4000;
// Jusqu'à 20 rendus d'1 à 2 min peuvent attendre devant le nôtre.
const MAX_TRACKING_MS = 2 * 60 * 60_000;
const MAX_CONSECUTIVE_FAILURES = 10;
// Le jeton d'une interaction expire au bout de 15 min : au-delà, le message
// de suivi est modifié comme un message classique du bot.
const INTERACTION_TOKEN_MS = 14 * 60_000;
const MB = 1024 * 1024;
const PROGRESS_BAR_LENGTH = 12;

const STATUSES = {
  queued: ["⏳ En file d'attente", 0x99aab5],
  running: ["⚙️ Rendu en cours", 0xfee75c],
  done: ["✅ Terminé", 0x57f287],
  failed: ["❌ Échec", 0xed4245],
  cancelled: ["🚫 Annulé", 0x4f545c],
};
const FINAL_STATUSES = new Set(["done", "failed", "cancelled"]);
const STEPS = { voix: "voix (1/2)", vidéo: "vidéo (2/2)" };

function formatSize(bytes) {
  return `${(bytes / MB).toFixed(1).replace(".", ",")} Mo`;
}

function formatSeconds(seconds) {
  const rounded = Math.round(seconds);
  return rounded < 60
    ? `${rounded} s`
    : `${Math.floor(rounded / 60)} min ${String(rounded % 60).padStart(2, "0")} s`;
}

function progressBar(progress) {
  const filled = Math.round(
    (Math.min(Math.max(progress, 0), 100) / 100) * PROGRESS_BAR_LENGTH,
  );
  return `${"▰".repeat(filled)}${"▱".repeat(PROGRESS_BAR_LENGTH - filled)} ${Math.round(progress)} %`;
}

/**
 * Texte d'erreur pour une PixelautoError, avec le détail des erreurs de
 * validation d'un épisode (422).
 * @param {import("./pixelauto").PixelautoError} error
 */
function formatError(error) {
  const lines = [
    `❌ ${error.message[0].toUpperCase()}${error.message.slice(1)}.`,
  ];
  for (const detail of error.errors) {
    const line = `• ${detail}`;
    if (lines.join("\n").length + line.length > 1900) {
      lines.push("• …");
      break;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Embed décrivant l'état d'un rendu.
 * @param {object} video - État renvoyé par l'API.
 */
function buildEmbed(video) {
  const [label, color] = STATUSES[video.status] ?? [video.status, 0x99aab5];
  const lines = [`**${label}**`];

  if (video.status === "queued" && video.position != null) {
    lines.push(`Position dans la file : **${video.position}**`);
  }
  if (video.status === "running") {
    lines.push(`Étape : ${STEPS[video.step] ?? video.step ?? "—"}`);
  }
  if (video.status === "running" || video.status === "done") {
    lines.push(
      progressBar(video.status === "done" ? 100 : (video.progress ?? 0)),
    );
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎬 ${video.title ?? video.episode ?? video.id}`)
    .setColor(color)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "ID", value: `\`${video.id}\``, inline: true },
      { name: "Épisode", value: video.episode ?? "—", inline: true },
    );

  if (video.created) {
    embed.addFields({
      name: "Demandé",
      value: time(Math.floor(video.created), "R"),
      inline: true,
    });
  }
  if (video.status === "done") {
    embed.addFields(
      {
        name: "Durée",
        value: video.duration ? formatSeconds(video.duration) : "—",
        inline: true,
      },
      {
        name: "Taille",
        value: video.size ? formatSize(video.size) : "—",
        inline: true,
      },
    );
  }
  if (FINAL_STATUSES.has(video.status) && video.started && video.finished) {
    embed.addFields({
      name: "Temps de rendu",
      value: formatSeconds(video.finished - video.started),
      inline: true,
    });
  }
  if (video.status === "failed" && video.error) {
    embed.addFields({
      name: "Erreur",
      value: `\`\`\`\n${String(video.error).slice(-1000)}\n\`\`\``,
    });
  }
  if (!FINAL_STATUSES.has(video.status)) {
    embed.setFooter({ text: "Mis à jour en direct" });
  }
  return embed;
}

function cancelRow(video, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`video:annuler:${video.id}:${userId}`)
      .setLabel("Annuler le rendu")
      .setEmoji("🛑")
      .setStyle(ButtonStyle.Danger),
  );
}

function trackingPayload(video, userId, note = "") {
  const active = !FINAL_STATUSES.has(video.status) && !note;
  return {
    content: note,
    embeds: [buildEmbed(video)],
    components: active ? [cancelRow(video, userId)] : [],
  };
}

function uploadLimit(guild) {
  switch (guild?.premiumTier) {
    case GuildPremiumTier.Tier2:
      return 50 * MB;
    case GuildPremiumTier.Tier3:
      return 100 * MB;
    default:
      return 10 * MB;
  }
}

function tooLargeMessage(video, limit) {
  return (
    `⚠️ La vidéo **${video.title ?? video.id}** (${formatSize(video.size)}) dépasse la limite d'envoi de ce serveur (${formatSize(limit)}).\n` +
    `Elle reste téléchargeable depuis l'API pendant 14 jours : \`GET /videos/${video.id}/file\`.`
  );
}

function isTooLarge(error) {
  return (
    error?.status === 413 ||
    error?.code === RESTJSONErrorCodes.RequestEntityTooLarge
  );
}

/**
 * Télécharge le MP4 d'un rendu terminé et l'envoie avec `send`. Si le fichier
 * dépasse la limite d'envoi du serveur, envoie un message à la place.
 * @param {object} video - État du rendu (status "done").
 * @param {import("discord.js").Guild | null} guild
 * @param {(payload: object) => Promise<unknown>} send
 * @param {string} [content] - Texte accompagnant la vidéo.
 */
async function sendVideoFile(video, guild, send, content = "") {
  const limit = uploadLimit(guild);
  if (video.size > limit) {
    await send({ content: `${content}\n${tooLargeMessage(video, limit)}` });
    return;
  }

  const file = await pixelauto.downloadVideo(video.id);
  try {
    await send({
      content,
      files: [
        new AttachmentBuilder(file, {
          name: `${video.episode ?? video.id}.mp4`,
        }),
      ],
    });
  } catch (error) {
    if (!isTooLarge(error)) throw error;
    await send({
      content: `${content}\n${tooLargeMessage({ ...video, size: file.length }, limit)}`,
    });
  }
}

/**
 * Accès au message de suivi d'une interaction, au-delà de la durée de vie de
 * son jeton.
 * @param {import("discord.js").ChatInputCommandInteraction | import("discord.js").ModalSubmitInteraction} interaction
 * @param {import("discord.js").Message} message - Réponse ou suivi (followUp) de l'interaction.
 */
function replyHandle(interaction, message) {
  const tokenValid = () =>
    Date.now() - interaction.createdTimestamp < INTERACTION_TOKEN_MS;

  return {
    /** Modifie le message de suivi ; renvoie false s'il a été supprimé. */
    async edit(payload) {
      try {
        await (tokenValid()
          ? interaction.editReply({ ...payload, message })
          : message.edit(payload));
        return true;
      } catch (error) {
        if (
          error?.code === RESTJSONErrorCodes.UnknownMessage ||
          error?.code === RESTJSONErrorCodes.UnknownWebhook
        ) {
          return false;
        }
        logger.warn("Impossible de mettre à jour le suivi du rendu :", error);
        return true;
      }
    },
    /** Envoie un nouveau message dans le salon (qui notifie, contrairement à une modification). */
    send(payload) {
      return tokenValid()
        ? interaction.followUp(payload)
        : interaction.channel.send(payload);
    },
  };
}

/**
 * Suit un rendu en modifiant un message de l'interaction jusqu'à la fin, puis
 * envoie la vidéo (ou l'erreur) en mentionnant l'auteur de la commande.
 * @param {import("discord.js").ChatInputCommandInteraction | import("discord.js").ModalSubmitInteraction} interaction
 * @param {object} video - État initial du rendu.
 * @param {import("discord.js").Message} message - Message de suivi à modifier.
 */
async function trackVideo(interaction, video, message) {
  const userId = interaction.user.id;
  const reply = replyHandle(interaction, message);
  const startedAt = Date.now();
  let lastState = null;
  let failures = 0;

  for (;;) {
    const state = [
      video.status,
      video.step,
      video.progress,
      video.position,
    ].join("|");
    if (state !== lastState) {
      lastState = state;
      if (!(await reply.edit(trackingPayload(video, userId)))) return;
    }
    if (FINAL_STATUSES.has(video.status)) break;

    if (Date.now() - startedAt > MAX_TRACKING_MS) {
      await reply.edit(
        trackingPayload(
          video,
          userId,
          `⌛ Suivi arrêté au bout de 2 h. Reprendre avec \`/video suivre id:${video.id}\`.`,
        ),
      );
      return;
    }

    await sleep(POLL_INTERVAL_MS);
    try {
      video = await pixelauto.getVideo(video.id);
      failures = 0;
    } catch (error) {
      if (error.status === 404) {
        await reply.edit(
          trackingPayload(video, userId, "🗑️ Ce rendu a été supprimé."),
        );
        return;
      }
      failures += 1;
      logger.warn(
        `Échec du suivi du rendu ${video.id} (${failures}/${MAX_CONSECUTIVE_FAILURES}) : ${error.message}`,
      );
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        await reply.edit(
          trackingPayload(
            video,
            userId,
            `⚠️ Suivi interrompu : ${error.message}. Reprendre avec \`/video suivre id:${video.id}\`.`,
          ),
        );
        return;
      }
    }
  }

  const title = `**${video.title ?? video.id}**`;
  const mention = { allowedMentions: { users: [userId] } };
  try {
    if (video.status === "done") {
      await sendVideoFile(
        video,
        interaction.guild,
        (payload) => reply.send({ ...payload, ...mention }),
        `<@${userId}> 🎬 La vidéo ${title} est prête !`,
      );
    } else if (video.status === "failed") {
      await reply.send({
        content: `<@${userId}> ❌ Le rendu de ${title} a échoué. Détail : \`/video journal id:${video.id}\`.`,
        ...mention,
      });
    }
  } catch (error) {
    logger.error(
      `Impossible d'envoyer le résultat du rendu ${video.id} :`,
      error,
    );
    await reply
      .send({
        content: `<@${userId}> ⚠️ La vidéo ${title} est prête mais n'a pas pu être envoyée (${error.message}). Réessayer avec \`/video telecharger id:${video.id}\`.`,
        ...mention,
      })
      .catch(() => {});
  }
}

module.exports = {
  STATUSES,
  buildEmbed,
  formatError,
  formatSize,
  sendVideoFile,
  trackVideo,
};
