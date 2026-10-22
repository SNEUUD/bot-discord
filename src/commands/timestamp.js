const {
  SlashCommandBuilder,
  MessageFlags,
  TimestampStyles,
  inlineCode,
  time,
} = require("discord.js");

const STYLES = [
  ["Heure courte", TimestampStyles.ShortTime],
  ["Heure longue", TimestampStyles.LongTime],
  ["Date courte", TimestampStyles.ShortDate],
  ["Date longue", TimestampStyles.LongDate],
  ["Date et heure", TimestampStyles.ShortDateTime],
  ["Date et heure complètes", TimestampStyles.LongDateTime],
  ["Relatif", TimestampStyles.RelativeTime],
];

/**
 * Interprète un timestamp Unix (secondes ou millisecondes) ou une date
 * lisible par `Date` (ex. ISO 8601). Sans valeur, renvoie la date actuelle.
 */
function parseDate(input) {
  if (!input) return new Date();
  if (/^-?\d+$/.test(input)) {
    const value = Number(input);
    // Au-delà de 11 chiffres, on considère qu'il s'agit de millisecondes.
    return new Date(input.replace("-", "").length > 11 ? value : value * 1000);
  }
  return new Date(input);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timestamp")
    .setDescription("Convertit une date ou un timestamp Unix.")
    .addStringOption((option) =>
      option
        .setName("date")
        .setDescription(
          "Timestamp Unix ou date ISO (ex. 2026-10-22T14:30+02:00). Maintenant par défaut.",
        ),
    ),
  async execute(interaction) {
    const input = interaction.options.getString("date")?.trim();
    const date = parseDate(input);

    if (Number.isNaN(date.getTime())) {
      await interaction.reply({
        content:
          "❌ Date invalide. Exemples acceptés : `1761143400`, `2026-10-22`, `2026-10-22T14:30+02:00`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const seconds = Math.floor(date.getTime() / 1000);
    const lines = [
      `**Unix (s)** : ${inlineCode(seconds)}`,
      `**Unix (ms)** : ${inlineCode(date.getTime())}`,
      `**ISO 8601** : ${inlineCode(date.toISOString())}`,
      "",
      "**Formats Discord**",
      ...STYLES.map(
        ([label, style]) =>
          `${label} : ${inlineCode(time(seconds, style))} → ${time(seconds, style)}`,
      ),
    ];

    const hasTime = input && /\d{1,2}:\d{2}/.test(input);
    const hasOffset = input && /(Z|[+-]\d{2}:?\d{2})$/i.test(input);
    if (hasTime && !hasOffset) {
      lines.push(
        "",
        "-# ⚠️ Aucun fuseau précisé : l'heure du serveur a été utilisée. Ajoute `Z` ou `+02:00` pour être précis.",
      );
    }

    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
};
