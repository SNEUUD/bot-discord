const { PIXELAUTO_URL, API_KEY } = process.env;

const REQUEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

const STATUS_MESSAGES = {
  400: "le corps envoyé n'est pas du JSON",
  401: "clé API absente ou refusée (vérifier API_KEY)",
  404: "rendu introuvable (id inconnu ou supprimé)",
  409: "la vidéo n'est pas encore prête",
  422: "épisode invalide",
  429: "la file d'attente est pleine (20 rendus en attente), réessaie plus tard",
};

class PixelautoError extends Error {
  /**
   * @param {number} status - Code HTTP (0 si l'API n'a pas pu être jointe).
   * @param {string} message
   * @param {string[]} [errors] - Détail des erreurs de validation (422).
   */
  constructor(status, message, errors = []) {
    super(message);
    this.name = "PixelautoError";
    this.status = status;
    this.errors = errors;
  }
}

const NOT_CONFIGURED_MESSAGE =
  "❌ L'API pixelauto n'est pas configurée (PIXELAUTO_URL et API_KEY dans le .env).";

function isConfigured() {
  return Boolean(PIXELAUTO_URL && API_KEY);
}

async function request(
  method,
  route,
  { body, timeout = REQUEST_TIMEOUT_MS } = {},
) {
  let response;
  try {
    response = await fetch(`${PIXELAUTO_URL.replace(/\/+$/, "")}${route}`, {
      method,
      headers: {
        "X-API-Key": API_KEY,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const reason =
      error.name === "TimeoutError" ? "délai dépassé" : error.message;
    throw new PixelautoError(0, `API injoignable (${reason})`);
  }

  if (response.ok) return response;

  const data = await response.json().catch(() => null);
  const errors = data?.detail?.errors ?? [];
  const message =
    STATUS_MESSAGES[response.status] ??
    (typeof data?.detail === "string"
      ? data.detail
      : `l'API a répondu ${response.status}`);
  throw new PixelautoError(response.status, message, errors);
}

async function requestJson(method, route, options) {
  const response = await request(method, route, options);
  return response.json();
}

module.exports = {
  NOT_CONFIGURED_MESSAGE,
  PixelautoError,
  isConfigured,
  /** Met un épisode en file d'attente. */
  createVideo: (episode) => requestJson("POST", "/videos", { body: episode }),
  /** État d'un rendu. */
  getVideo: (id) => requestJson("GET", `/videos/${encodeURIComponent(id)}`),
  /** Derniers rendus, du plus récent au plus ancien. */
  listVideos: async (limit = 20, options) => {
    const data = await requestJson("GET", `/videos?limit=${limit}`, options);
    return Array.isArray(data) ? data : (data.videos ?? data.items ?? []);
  },
  /** Annule un rendu en attente ou en cours (→ cancelled), sinon le supprime (→ deleted). */
  deleteVideo: async (id) => {
    const response = await request(
      "DELETE",
      `/videos/${encodeURIComponent(id)}`,
    );
    return response.json().catch(() => ({}));
  },
  /** Journal du rendu. */
  getLog: async (id) =>
    (await requestJson("GET", `/videos/${encodeURIComponent(id)}/log`)).log,
  /** Télécharge le MP4 d'un rendu terminé. */
  downloadVideo: async (id) => {
    const response = await request(
      "GET",
      `/videos/${encodeURIComponent(id)}/file`,
      { timeout: DOWNLOAD_TIMEOUT_MS },
    );
    return Buffer.from(await response.arrayBuffer());
  },
};
