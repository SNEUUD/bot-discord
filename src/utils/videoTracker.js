const { setTimeout: sleep } = require("node:timers/promises");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildPremiumTier,
  RESTJSONErrorCodes,
  StringSelectMenuBuilder,
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
  deleted: ["🗑️ Supprimé", 0x4f545c],
};
const FINAL_STATUSES = new Set(["done", "failed", "cancelled", "deleted"]);
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

function progressBar(progress, length = PROGRESS_BAR_LENGTH) {
  const filled = Math.round(
    (Math.min(Math.max(progress, 0), 100) / 100) * length,
  );
  return `${"▰".repeat(filled)}${"▱".repeat(length - filled)} ${Math.round(progress)} %`;
}

function videoTitle(video) {
  return video.title ?? video.episode ?? video.id;
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
    .setTitle(`🎬 ${videoTitle(video)}`)
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

function summaryLine(video) {
  const [label] = STATUSES[video.status] ?? [video.status];
  let detail;
  switch (video.status) {
    case "queued":
      detail =
        video.position != null ? `file d'attente : ${video.position}` : "";
      break;
    case "running":
      detail = `${video.step ?? "rendu"} ${progressBar(video.progress ?? 0, 8)}`;
      break;
    case "done":
      detail = [
        video.duration && formatSeconds(video.duration),
        video.size && formatSize(video.size),
      ]
        .filter(Boolean)
        .join(", ");
      break;
    default:
      detail = label.slice(label.indexOf(" ") + 1).toLowerCase();
  }
  return `${label.split(" ")[0]} **${videoTitle(video)}** · \`${video.id}\`${detail ? `\n${detail}` : ""}`;
}

/**
 * Embed résumant l'état de plusieurs rendus, une ligne par vidéo.
 * @param {object[]} videos
 */
function buildListEmbed(videos) {
  const active = videos.filter((video) => !FINAL_STATUSES.has(video.status));
  const done = videos.filter((video) => video.status === "done").length;
  const [, color] =
    active.length > 0
      ? STATUSES[
          active.some((v) => v.status === "running") ? "running" : "queued"
        ]
      : STATUSES[videos.some((v) => v.status === "failed") ? "failed" : "done"];

  const embed = new EmbedBuilder()
    .setTitle(`🎬 ${videos.length} vidéos`)
    .setColor(color)
    .setDescription(
      `**${done}/${videos.length} terminée(s)**\n\n${videos.map(summaryLine).join("\n\n")}`.slice(
        0,
        4096,
      ),
    );
  if (active.length > 0) embed.setFooter({ text: "Mis à jour en direct" });
  return embed;
}

function cancelRow(videos, userId) {
  if (videos.length === 1) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`video:annuler:${userId}:${videos[0].id}`)
        .setLabel("Annuler le rendu")
        .setEmoji("🛑")
        .setStyle(ButtonStyle.Danger),
    );
  }
  const options = videos.slice(0, 25).map((video) => ({
    label: videoTitle(video).slice(0, 100),
    description: `${STATUSES[video.status]?.[0] ?? video.status} · ${video.id}`,
    value: video.id,
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`video:annuler:${userId}`)
      .setPlaceholder("🛑 Annuler des rendus…")
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options),
  );
}

/**
 * Contenu du message de suivi d'un ou plusieurs rendus.
 * @param {object[]} videos
 * @param {string} userId - Auteur de la demande (seul à pouvoir annuler).
 * @param {object} [options]
 * @param {string} [options.header] - Texte affiché au-dessus du suivi.
 * @param {string} [options.note] - Raison de l'arrêt du suivi.
 */
function trackingPayload(videos, userId, { header = "", note = "" } = {}) {
  const active = note
    ? []
    : videos.filter((video) => !FINAL_STATUSES.has(video.status));
  return {
    content: [header, note].filter(Boolean).join("\n"),
    embeds: [
      videos.length === 1 ? buildEmbed(videos[0]) : buildListEmbed(videos),
    ],
    components: active.length > 0 ? [cancelRow(active, userId)] : [],
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
 * Message de suivi rattaché à une interaction. Au-delà de la durée de vie du
 * jeton, il est modifié comme un message classique du bot.
 * @param {import("discord.js").ChatInputCommandInteraction | import("discord.js").ModalSubmitInteraction} interaction
 * @param {import("discord.js").Message} message - Réponse ou suivi (followUp) de l'interaction.
 */
function interactionTarget(interaction, message) {
  const tokenValid = () =>
    Date.now() - interaction.createdTimestamp < INTERACTION_TOKEN_MS;
  return {
    userId: interaction.user.id,
    guild: interaction.guild,
    edit: (payload) =>
      tokenValid()
        ? interaction.editReply({ ...payload, message })
        : message.edit(payload),
    send: (payload) =>
      tokenValid()
        ? interaction.followUp(payload)
        : interaction.channel.send(payload),
  };
}

/**
 * Message de suivi envoyé en réponse à un message (pièces jointes).
 * @param {import("discord.js").Message} message - Message de suivi du bot.
 * @param {string} userId - Auteur de la demande.
 */
function messageTarget(message, userId) {
  return {
    userId,
    guild: message.guild,
    edit: (payload) => message.edit(payload),
    send: (payload) => message.channel.send(payload),
  };
}

/** Modifie le message de suivi ; renvoie false s'il a été supprimé. */
async function editTracking(target, payload) {
  try {
    await target.edit(payload);
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
}

/**
 * Envoie le résultat d'un rendu terminé dans un nouveau message (qui notifie,
 * contrairement à une modification) en mentionnant l'auteur de la demande.
 */
async function deliverResult(target, video) {
  const { userId } = target;
  const title = `**${videoTitle(video)}**`;
  const mention = { allowedMentions: { users: [userId] } };
  try {
    if (video.status === "done") {
      await sendVideoFile(
        video,
        target.guild,
        (payload) => target.send({ ...payload, ...mention }),
        `<@${userId}> 🎬 La vidéo ${title} est prête !`,
      );
    } else if (video.status === "failed") {
      await target.send({
        content: `<@${userId}> ❌ Le rendu de ${title} a échoué. Détail : \`/video journal id:${video.id}\`.`,
        ...mention,
      });
    }
  } catch (error) {
    logger.error(
      `Impossible d'envoyer le résultat du rendu ${video.id} :`,
      error,
    );
    await target
      .send({
        content: `<@${userId}> ⚠️ La vidéo ${title} est prête mais n'a pas pu être envoyée (${error.message}). Réessayer avec \`/video telecharger id:${video.id}\`.`,
        ...mention,
      })
      .catch(() => {});
  }
}

/**
 * Suit un ou plusieurs rendus en modifiant le message de suivi jusqu'à ce
 * qu'ils soient tous terminés, et envoie chaque vidéo (ou erreur) dès qu'elle
 * est prête.
 * @param {ReturnType<typeof interactionTarget>} target - Message de suivi.
 * @param {object[]} videos - États initiaux des rendus.
 * @param {object} [options]
 * @param {string} [options.header] - Texte affiché au-dessus du suivi.
 */
async function trackVideos(target, videos, { header = "" } = {}) {
  const { userId } = target;
  const delivered = new Set();
  const startedAt = Date.now();
  const resume =
    videos.length === 1
      ? `\`/video suivre id:${videos[0].id}\``
      : "`/video suivre`";
  let lastState = null;
  let failures = 0;

  for (;;) {
    const state = videos
      .map((video) =>
        [video.status, video.step, video.progress, video.position].join("|"),
      )
      .join(";");
    if (state !== lastState) {
      lastState = state;
      const payload = trackingPayload(videos, userId, { header });
      if (!(await editTracking(target, payload))) return;
    }

    for (const video of videos) {
      if (FINAL_STATUSES.has(video.status) && !delivered.has(video.id)) {
        delivered.add(video.id);
        await deliverResult(target, video);
      }
    }
    if (videos.every((video) => FINAL_STATUSES.has(video.status))) return;

    if (Date.now() - startedAt > MAX_TRACKING_MS) {
      await editTracking(
        target,
        trackingPayload(videos, userId, {
          header,
          note: `⌛ Suivi arrêté au bout de 2 h. Reprendre avec ${resume}.`,
        }),
      );
      return;
    }

    await sleep(POLL_INTERVAL_MS);
    let lastError = null;
    videos = await Promise.all(
      videos.map(async (video) => {
        if (FINAL_STATUSES.has(video.status)) return video;
        try {
          return await pixelauto.getVideo(video.id);
        } catch (error) {
          if (error.status === 404) return { ...video, status: "deleted" };
          lastError = error;
          return video;
        }
      }),
    );

    if (!lastError) {
      failures = 0;
      continue;
    }
    failures += 1;
    logger.warn(
      `Échec du suivi des rendus (${failures}/${MAX_CONSECUTIVE_FAILURES}) : ${lastError.message}`,
    );
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      await editTracking(
        target,
        trackingPayload(videos, userId, {
          header,
          note: `⚠️ Suivi interrompu : ${lastError.message}. Reprendre avec ${resume}.`,
        }),
      );
      return;
    }
  }
}

module.exports = {
  FINAL_STATUSES,
  STATUSES,
  buildEmbed,
  formatError,
  formatSize,
  interactionTarget,
  messageTarget,
  sendVideoFile,
  trackVideos,
  trackingPayload,
};
