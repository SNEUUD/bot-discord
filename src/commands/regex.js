const vm = require("node:vm");
const { SlashCommandBuilder, MessageFlags, inlineCode } = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");

const MAX_DISPLAYED_MATCHES = 25;
const TIMEOUT_MS = 1000;

// Exécuté dans un contexte isolé avec un timeout pour qu'une regex
// catastrophique (backtracking exponentiel) ne bloque pas le bot.
const matchScript = new vm.Script(`
  Array.from(text.matchAll(new RegExp(pattern, flags)), (match) => ({
    value: match[0],
    index: match.index,
    groups: match.slice(1),
    named: match.groups ? { ...match.groups } : null,
  }));
`);

function formatMatch(match, position) {
  const lines = [
    `#${position} à l'index ${match.index} : ${JSON.stringify(match.value)}`,
  ];
  match.groups.forEach((group, i) => {
    lines.push(`    groupe ${i + 1} : ${JSON.stringify(group ?? null)}`);
  });
  for (const [name, value] of Object.entries(match.named ?? {})) {
    lines.push(`    ${name} : ${JSON.stringify(value ?? null)}`);
  }
  return lines.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("regex")
    .setDescription("Teste une expression régulière sur un texte.")
    .addStringOption((option) =>
      option
        .setName("motif")
        .setDescription("L'expression régulière, sans les / (ex. \\d+)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("texte")
        .setDescription("Le texte à analyser")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("flags")
        .setDescription(
          "Flags de la regex (ex. i, m, s). g est toujours actif.",
        ),
    ),
  async execute(interaction) {
    const pattern = interaction.options.getString("motif", true);
    const text = interaction.options.getString("texte", true);
    const extraFlags = interaction.options.getString("flags") ?? "";

    if (!/^[dgimsuvy]*$/.test(extraFlags)) {
      await interaction.reply({
        content:
          "❌ Flags invalides. Valeurs possibles : d, g, i, m, s, u, v, y.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const flags = [...new Set(`g${extraFlags}`)].join("");

    let matches;
    try {
      matches = matchScript.runInNewContext(
        { text, pattern, flags },
        { timeout: TIMEOUT_MS },
      );
    } catch (error) {
      const reason =
        error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
          ? `l'exécution a dépassé ${TIMEOUT_MS} ms (backtracking excessif ?)`
          : error.message;
      await interaction.reply({
        content: `❌ Regex invalide : ${reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const title = `${inlineCode(`/${pattern}/${flags}`)} : **${matches.length} correspondance(s)**`;
    if (matches.length === 0) {
      await interaction.reply({
        content: title,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const displayed = matches
      .slice(0, MAX_DISPLAYED_MATCHES)
      .map((match, i) => formatMatch(match, i + 1));
    if (matches.length > MAX_DISPLAYED_MATCHES) {
      displayed.push(
        `… et ${matches.length - MAX_DISPLAYED_MATCHES} autre(s).`,
      );
    }

    await replyWithCode(interaction, {
      header: title,
      content: displayed.join("\n"),
      filename: "correspondances.txt",
    });
  },
};
