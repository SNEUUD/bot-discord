const {
  SlashCommandBuilder,
  MessageFlags,
  inlineCode,
  time,
} = require("discord.js");
const { CronExpressionParser } = require("cron-parser");
const cronstrue = require("cronstrue/i18n");

const NEXT_RUNS = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cron")
    .setDescription(
      "Explique une expression cron et donne ses prochaines exécutions.",
    )
    .addStringOption((option) =>
      option
        .setName("expression")
        .setDescription("L'expression cron (ex. */15 9-17 * * 1-5)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("fuseau")
        .setDescription(
          "Fuseau horaire d'exécution (UTC par défaut, ex. Europe/Paris)",
        ),
    ),
  async execute(interaction) {
    const expression = interaction.options.getString("expression", true).trim();
    const timezone = interaction.options.getString("fuseau")?.trim() || "UTC";

    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: timezone });
    } catch {
      await interaction.reply({
        content: `❌ Fuseau horaire inconnu : ${inlineCode(timezone)} (ex. valides : UTC, Europe/Paris).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let description;
    let runs;
    try {
      description = cronstrue.toString(expression, {
        locale: "fr",
        use24HourTimeFormat: true,
      });
      const iterator = CronExpressionParser.parse(expression, { tz: timezone });
      runs = Array.from({ length: NEXT_RUNS }, () => iterator.next().toDate());
    } catch (error) {
      // cronstrue lève des chaînes, cron-parser des Error.
      const reason = String(error.message ?? error).replace(/^Error:\s*/, "");
      await interaction.reply({
        content: `❌ Expression cron invalide : ${reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = [
      `${inlineCode(expression)} (${timezone})`,
      `**${description}**`,
      "",
      `**${NEXT_RUNS} prochaines exécutions** (dans ton heure locale) :`,
      ...runs.map((run) => `• ${time(run, "F")} (${time(run, "R")})`),
    ];

    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
    });
  },
};
