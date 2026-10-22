const { STATUS_CODES } = require("node:http");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const CATEGORIES = {
  1: ["Information", 0x5865f2],
  2: ["Succès", 0x57f287],
  3: ["Redirection", 0xfee75c],
  4: ["Erreur client", 0xed4245],
  5: ["Erreur serveur", 0x99001f],
};

const DESCRIPTIONS = {
  100: "Le client peut continuer à envoyer le corps de la requête.",
  101: "Le serveur accepte de changer de protocole (ex. WebSocket).",
  200: "La requête a réussi.",
  201: "La requête a réussi et une ressource a été créée.",
  202: "La requête a été acceptée mais son traitement n'est pas terminé.",
  204: "La requête a réussi, sans contenu à renvoyer.",
  206: "Seule une partie de la ressource est renvoyée (en-tête Range).",
  301: "La ressource a été déplacée définitivement vers une nouvelle URL.",
  302: "La ressource se trouve temporairement à une autre URL.",
  303: "Le résultat se trouve à une autre URL, à récupérer avec GET.",
  304: "La ressource n'a pas changé depuis la version en cache.",
  307: "Redirection temporaire, en conservant la méthode et le corps.",
  308: "Redirection définitive, en conservant la méthode et le corps.",
  400: "La requête est mal formée ou invalide.",
  401: "Une authentification est nécessaire (ou celle fournie est invalide).",
  403: "Le serveur refuse l'accès, même authentifié.",
  404: "La ressource demandée n'existe pas.",
  405: "La méthode HTTP n'est pas autorisée pour cette ressource.",
  406: "Aucun format disponible ne correspond à l'en-tête Accept.",
  408: "Le client a mis trop de temps à envoyer sa requête.",
  409: "La requête est en conflit avec l'état actuel de la ressource.",
  410: "La ressource a été supprimée définitivement.",
  411: "L'en-tête Content-Length est requis.",
  413: "Le corps de la requête est trop volumineux.",
  414: "L'URL est trop longue.",
  415: "Le format du corps (Content-Type) n'est pas supporté.",
  418: "Je suis une théière (poisson d'avril de la RFC 2324).",
  422: "La requête est bien formée mais son contenu est invalide.",
  429: "Trop de requêtes : limite de débit atteinte.",
  431: "Les en-têtes de la requête sont trop volumineux.",
  451: "Ressource indisponible pour des raisons légales.",
  500: "Erreur interne du serveur.",
  501: "Le serveur ne prend pas en charge cette fonctionnalité.",
  502: "Le proxy ou la passerelle a reçu une réponse invalide du serveur amont.",
  503: "Le service est temporairement indisponible (surcharge, maintenance).",
  504: "Le proxy ou la passerelle n'a pas reçu de réponse à temps du serveur amont.",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("http")
    .setDescription("Explique un code de statut HTTP.")
    .addIntegerOption((option) =>
      option
        .setName("code")
        .setDescription("Le code HTTP (ex. 404)")
        .setMinValue(100)
        .setMaxValue(599)
        .setRequired(true)
        .setAutocomplete(true),
    ),
  async autocomplete(interaction) {
    const query = String(interaction.options.getFocused()).toLowerCase();
    const choices = Object.entries(STATUS_CODES)
      .map(([code, name]) => ({ name: `${code} ${name}`, value: Number(code) }))
      .filter((choice) => choice.name.toLowerCase().includes(query))
      .slice(0, 25);
    await interaction.respond(choices);
  },
  async execute(interaction) {
    const code = interaction.options.getInteger("code", true);
    const [category, color] = CATEGORIES[Math.floor(code / 100)];
    const name = STATUS_CODES[code];

    const embed = new EmbedBuilder()
      .setTitle(`${code} ${name ?? "Code non standard"}`)
      .setURL(
        `https://developer.mozilla.org/fr/docs/Web/HTTP/Reference/Status/${code}`,
      )
      .setColor(color)
      .setDescription(
        DESCRIPTIONS[code] ??
          (name
            ? "Voir la documentation MDN pour le détail."
            : "Ce code n'est pas défini par les standards HTTP."),
      )
      .addFields({
        name: "Catégorie",
        value: `${code.toString()[0]}xx · ${category}`,
      });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
