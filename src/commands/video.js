const {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputStyle,
  MessageFlags,
  InteractionContextType,
  time,
} = require("discord.js");
const logger = require("../utils/logger");
const pixelauto = require("../utils/pixelauto");
const replyWithCode = require("../utils/replyWithCode");
const {
  attachmentSource,
  formatFailures,
  submitEpisodes,
} = require("../utils/episodes");
const {
  STATUSES,
  formatError,
  interactionTarget,
  sendVideoFile,
  trackVideos,
  trackingPayload,
} = require("../utils/videoTracker");

// Discord laisse 3 s pour répondre à une autocomplétion.
const AUTOCOMPLETE_TIMEOUT_MS = 2500;

function addIdOption(subcommand) {
  return subcommand.addStringOption((option) =>
    option
      .setName("id")
      .setDescription("ID du rendu (12 caractères hexadécimaux)")
      .setRequired(true)
      .setAutocomplete(true),
  );
}

/**
 * Exécute une action sur l'API et affiche ses erreurs connues en réponse.
 * L'interaction doit avoir été différée.
 */
async function withApiErrors(interaction, action) {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof pixelauto.PixelautoError)) throw error;
    await interaction.editReply({ content: formatError(error), embeds: [] });
  }
}

/**
 * Met en file d'attente l'épisode saisi (fichier joint ou modale), puis suit
 * son rendu dans un message public.
 * @param {import("discord.js").ChatInputCommandInteraction | import("discord.js").ModalSubmitInteraction} interaction
 * @param {{ name: string | null, read: () => Promise<string> }} source
 */
async function submitEpisode(interaction, source) {
  // Les erreurs restent privées ; seul le suivi du rendu est public.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { videos, failures } = await submitEpisodes(
    [source],
    interaction.user.tag,
  );
  if (videos.length === 0) {
    await interaction.editReply(formatFailures(failures));
    return;
  }

  const [video] = videos;
  const message = await interaction.followUp(
    trackingPayload(videos, interaction.user.id),
  );
  await interaction.editReply(
    `✅ Épisode envoyé : rendu \`${video.id}\`, suivi ci-dessous.`,
  );
  trackVideos(interactionTarget(interaction, message), videos).catch(
    (error) => {
      logger.error(`Erreur pendant le suivi du rendu ${video.id} :`, error);
    },
  );
}

const subcommands = {
  async creer(interaction) {
    const attachment = interaction.options.getAttachment("fichier");
    if (attachment) {
      await submitEpisode(interaction, attachmentSource(attachment));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("video:creer")
      .setTitle("Nouvelle vidéo")
      .addLabelComponents((label) =>
        label
          .setLabel("Épisode (JSON)")
          .setDescription(
            "4000 caractères max : au-delà, joindre un fichier .json",
          )
          .setTextInputComponent((textInput) =>
            textInput
              .setCustomId("episode")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ),
      );
    await interaction.showModal(modal);
  },

  async suivre(interaction) {
    const id = interaction.options.getString("id", true).trim();
    await interaction.deferReply();
    await withApiErrors(interaction, async () => {
      const videos = [await pixelauto.getVideo(id)];
      const message = await interaction.editReply(
        trackingPayload(videos, interaction.user.id),
      );
      trackVideos(interactionTarget(interaction, message), videos).catch(
        (error) => {
          logger.error(`Erreur pendant le suivi du rendu ${id} :`, error);
        },
      );
    });
  },

  async telecharger(interaction) {
    const id = interaction.options.getString("id", true).trim();
    await interaction.deferReply();
    await withApiErrors(interaction, async () => {
      const video = await pixelauto.getVideo(id);
      if (video.status !== "done") {
        const [label] = STATUSES[video.status] ?? [video.status];
        await interaction.editReply(
          `Ce rendu n'est pas terminé (${label}). Suivre son avancement : \`/video suivre id:${id}\`.`,
        );
        return;
      }
      await sendVideoFile(
        video,
        interaction.guild,
        (payload) => interaction.editReply(payload),
        `🎬 **${video.title ?? video.id}**`,
      );
    });
  },

  async liste(interaction) {
    const limit = interaction.options.getInteger("nombre") ?? 10;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await withApiErrors(interaction, async () => {
      const videos = await pixelauto.listVideos(limit);
      const lines = videos.map((video) => {
        const [label] = STATUSES[video.status] ?? [video.status];
        const progress =
          video.status === "running" ? ` ${video.progress ?? 0} %` : "";
        const created = video.created
          ? ` · ${time(Math.floor(video.created), "R")}`
          : "";
        return `${label.split(" ")[0]} \`${video.id}\` **${video.title ?? video.episode}**${progress}${created}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🎬 Derniers rendus")
        .setColor(0x5865f2)
        .setDescription(
          lines.length > 0
            ? lines.join("\n").slice(0, 4096)
            : "*Aucun rendu pour le moment.*",
        );
      await interaction.editReply({ embeds: [embed] });
    });
  },

  async journal(interaction) {
    const id = interaction.options.getString("id", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await withApiErrors(interaction, async () => {
      const log = await pixelauto.getLog(id);
      await replyWithCode(interaction, {
        content: log || "(journal vide)",
        header: `Journal du rendu \`${id}\` :`,
        filename: `${id}.log`,
      });
    });
  },

  async annuler(interaction) {
    const id = interaction.options.getString("id", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await withApiErrors(interaction, async () => {
      const result = await pixelauto.deleteVideo(id);
      logger.info(`Rendu ${id} annulé/supprimé par ${interaction.user.tag}.`);
      await interaction.editReply(
        result.status === "cancelled"
          ? `🚫 Rendu \`${id}\` annulé.`
          : `🗑️ Rendu \`${id}\` et sa vidéo supprimés.`,
      );
    });
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("video")
    .setDescription("Crée et suit des vidéos pixelauto.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("creer")
        .setDescription(
          "Lance le rendu d'une vidéo (pour plusieurs : mentionner le bot avec les fichiers .json).",
        )
        .addAttachmentOption((option) =>
          option
            .setName("fichier")
            .setDescription(
              "Fichier .json de l'épisode (laisser vide pour le coller dans un champ de saisie)",
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      addIdOption(
        subcommand
          .setName("suivre")
          .setDescription(
            "Suit un rendu en direct et envoie la vidéo à la fin.",
          ),
      ),
    )
    .addSubcommand((subcommand) =>
      addIdOption(
        subcommand
          .setName("telecharger")
          .setDescription("Envoie le MP4 d'un rendu terminé."),
      ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("liste")
        .setDescription("Affiche les derniers rendus.")
        .addIntegerOption((option) =>
          option
            .setName("nombre")
            .setDescription("Nombre de rendus (10 par défaut)")
            .setMinValue(1)
            .setMaxValue(50),
        ),
    )
    .addSubcommand((subcommand) =>
      addIdOption(
        subcommand
          .setName("journal")
          .setDescription(
            "Affiche le journal d'un rendu (utile en cas d'échec).",
          ),
      ),
    )
    .addSubcommand((subcommand) =>
      addIdOption(
        subcommand
          .setName("annuler")
          .setDescription(
            "Annule un rendu en cours, ou supprime un rendu terminé et sa vidéo.",
          ),
      ),
    ),
  submitEpisode,
  async autocomplete(interaction) {
    if (!pixelauto.isConfigured()) {
      await interaction.respond([]);
      return;
    }
    const query = interaction.options.getFocused().toLowerCase();
    let videos = [];
    try {
      videos = await pixelauto.listVideos(25, {
        timeout: AUTOCOMPLETE_TIMEOUT_MS,
      });
    } catch (error) {
      logger.warn(`Autocomplétion de /video impossible : ${error.message}`);
    }
    const choices = videos
      .filter((video) =>
        [video.id, video.title, video.episode].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(query),
        ),
      )
      .map((video) => {
        const [label] = STATUSES[video.status] ?? [video.status];
        return {
          name: `${video.title ?? video.episode} · ${label} · ${video.id}`.slice(
            0,
            100,
          ),
          value: video.id,
        };
      });
    await interaction.respond(choices);
  },
  async execute(interaction) {
    if (!pixelauto.isConfigured()) {
      await interaction.reply({
        content: pixelauto.NOT_CONFIGURED_MESSAGE,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await subcommands[interaction.options.getSubcommand()](interaction);
  },
};
