const logger = require("./logger");
const pixelauto = require("./pixelauto");
const { formatError } = require("./videoTracker");
const { translateJsonError } = require("../commands/json");

const MAX_EPISODE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FAILURES_LENGTH = 1800;

/**
 * Indique si une pièce jointe ressemble à un épisode JSON.
 * @param {import("discord.js").Attachment} attachment
 */
function isJsonAttachment(attachment) {
  return (
    attachment.name.toLowerCase().endsWith(".json") ||
    Boolean(attachment.contentType?.startsWith("application/json"))
  );
}

/**
 * Source d'épisode lue depuis une pièce jointe Discord.
 * @param {import("discord.js").Attachment} attachment
 */
function attachmentSource(attachment) {
  return {
    name: attachment.name,
    async read() {
      if (attachment.size > MAX_EPISODE_BYTES) {
        throw new Error("Fichier trop volumineux (1 Mo maximum).");
      }
      const response = await fetch(attachment.url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Impossible de lire le fichier (${response.status}).`);
      }
      return response.text();
    },
  };
}

async function submitOne(source) {
  let input;
  try {
    input = await source.read();
  } catch (error) {
    return { error: `❌ ${error.message}` };
  }

  let body;
  try {
    body = JSON.parse(input);
  } catch (error) {
    return {
      error: `❌ JSON invalide : ${translateJsonError(error.message)}.`,
    };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "❌ L'épisode doit être un objet JSON." };
  }

  try {
    const created = await pixelauto.createVideo(body);
    const episode = body.episode ?? body;
    return {
      video: {
        status: "queued",
        title: episode.title,
        episode: episode.id,
        ...created,
      },
    };
  } catch (error) {
    if (error instanceof pixelauto.PixelautoError) {
      return { error: formatError(error) };
    }
    logger.error(`Erreur pendant l'envoi de l'épisode ${source.name} :`, error);
    return { error: "❌ Erreur inattendue pendant l'envoi de l'épisode." };
  }
}

/**
 * Met en file d'attente les épisodes, un par un pour garder leur ordre.
 * @param {{ name: string | null, read: () => Promise<string> }[]} sources
 * @param {string} requestedBy - Auteur de la demande (pour le journal).
 * @returns {Promise<{ videos: object[], failures: { name: string | null, error: string }[] }>}
 */
async function submitEpisodes(sources, requestedBy) {
  const videos = [];
  const failures = [];
  for (const source of sources) {
    const { video, error } = await submitOne(source);
    if (video) {
      videos.push(video);
      logger.info(
        `Rendu ${video.id} (${video.episode}) demandé par ${requestedBy}.`,
      );
    } else {
      failures.push({ name: source.name, error });
    }
  }
  return { videos, failures };
}

/**
 * Texte listant les épisodes refusés, précédés du nom de leur fichier.
 * @param {{ name: string | null, error: string }[]} failures
 */
function formatFailures(failures) {
  let text = "";
  for (const { name, error } of failures) {
    const block = name ? `**${name}** : ${error}` : error;
    const next = text ? `${text}\n${block}` : block;
    if (next.length > MAX_FAILURES_LENGTH) {
      return text
        ? `${text}\n… et d'autres erreurs.`
        : next.slice(0, MAX_FAILURES_LENGTH);
    }
    text = next;
  }
  return text;
}

module.exports = {
  attachmentSource,
  formatFailures,
  isJsonAttachment,
  submitEpisodes,
};
