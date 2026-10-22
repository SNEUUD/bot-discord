const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");

const MODES = {
  formater: "Formater",
  minifier: "Minifier",
  valider: "Valider",
};

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
      content: `❌ JSON invalide : ${error.message}`,
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
