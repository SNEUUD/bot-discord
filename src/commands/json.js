const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");
const translateError = require("../utils/translateError");

const MODES = {
  formater: "Formater",
  minifier: "Minifier",
  valider: "Valider",
};

// Messages de JSON.parse (V8). Les anciennes versions de Node utilisent la
// forme courte "Unexpected token } in JSON at position 5".
const JSON_ERRORS = [
  [/^Unexpected end of JSON input$/, "le JSON se termine trop tôt"],
  [/^Expected property name or '\}'$/, "nom de propriété ou « } » attendu"],
  [
    /^Expected double-quoted property name$/,
    "nom de propriété entre guillemets doubles attendu",
  ],
  [
    /^Expected ':' after property name$/,
    "« : » attendu après le nom de propriété",
  ],
  [
    /^Expected ',' or '\}' after property value$/,
    "« , » ou « } » attendu après la valeur",
  ],
  [
    /^Expected ',' or '\]' after array element$/,
    "« , » ou « ] » attendu après l'élément du tableau",
  ],
  [/^Unterminated string$/, "chaîne non fermée"],
  [
    /^Bad control character in string literal$/,
    "caractère de contrôle dans une chaîne (retour à la ligne non échappé ?)",
  ],
  [/^Bad escaped character$/, "séquence d'échappement invalide"],
  [/^Bad Unicode escape$/, "séquence d'échappement Unicode invalide"],
  [
    /^Unexpected non-whitespace character after JSON$/,
    "contenu en trop après la fin du JSON",
  ],
  [/^Exponent part is missing a number$/, "exposant sans nombre"],
  [/^No number after minus sign$/, "aucun nombre après le signe moins"],
  [/^Unterminated fractional number$/, "nombre décimal incomplet"],
  [
    /^Unexpected token '(.+?)', [\s\S]* is not valid JSON$/,
    "caractère inattendu « $1 »",
  ],
  [/^Unexpected token (.)$/, "caractère inattendu « $1 »"],
  [/^Unexpected string$/, "chaîne inattendue"],
  [/^Unexpected number$/, "nombre inattendu"],
  [/^"[\s\S]*" is not valid JSON$/, "valeur non reconnue"],
];
const JSON_ERROR_LOCATION =
  / (?:in JSON )?at position (\d+)(?: \(line (\d+) column (\d+)\))?$/;

function translateJsonError(message) {
  const location = message.match(JSON_ERROR_LOCATION);
  const reason = translateError(
    message.replace(JSON_ERROR_LOCATION, ""),
    JSON_ERRORS,
    "syntaxe invalide",
  );
  if (!location) return reason;
  const [, position, line, column] = location;
  return `${reason} (${line ? `ligne ${line}, colonne ${column}` : `position ${position}`})`;
}

function describe(value) {
  if (Array.isArray(value)) return `tableau de ${value.length} élément(s)`;
  if (value === null) return "null";
  if (typeof value === "object") {
    return `objet de ${Object.keys(value).length} clé(s)`;
  }
  return typeof value;
}

/**
 * Traite le JSON saisi (via l'option de la commande ou la modale).
 * @param {import("discord.js").RepliableInteraction} interaction
 * @param {string} input
 * @param {keyof MODES} mode
 */
async function processJson(interaction, input, mode) {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    await interaction.reply({
      content: `❌ JSON invalide : ${translateJsonError(error.message)}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (mode === "valider") {
    await interaction.reply({
      content: `✅ JSON valide (${describe(parsed)}).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const output =
    mode === "minifier"
      ? JSON.stringify(parsed)
      : JSON.stringify(parsed, null, 2);
  await replyWithCode(interaction, {
    content: output,
    language: "json",
    filename: "resultat.json",
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("json")
    .setDescription("Formate, minifie ou valide du JSON.")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Action à effectuer (formater par défaut)")
        .addChoices(
          ...Object.entries(MODES).map(([value, name]) => ({ name, value })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName("json")
        .setDescription(
          "JSON à traiter (laisser vide pour ouvrir un champ de saisie)",
        ),
    ),
  processJson,
  translateJsonError,
  async execute(interaction) {
    const mode = interaction.options.getString("mode") ?? "formater";
    const input = interaction.options.getString("json");

    if (input) {
      await processJson(interaction, input, mode);
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`json:${mode}`)
      .setTitle(`${MODES[mode]} du JSON`)
      .addLabelComponents((label) =>
        label
          .setLabel("JSON")
          .setTextInputComponent((textInput) =>
            textInput
              .setCustomId("input")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          ),
      );
    await interaction.showModal(modal);
  },
};
