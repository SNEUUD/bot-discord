const {
  SlashCommandBuilder,
  MessageFlags,
  inlineCode,
  time,
} = require("discord.js");
const { CronExpressionParser } = require("cron-parser");
const cronstrue = require("cronstrue/i18n");
const translateError = require("../utils/translateError");

const NEXT_RUNS = 5;

// Noms des champs tels qu'ils apparaissent dans les messages de cronstrue
// (seconds, DOM…) et de cron-parser (dayOfMonth, CronDayOfMonth…).
const FIELD_NAMES = {
  second: "secondes",
  seconds: "secondes",
  minute: "minutes",
  minutes: "minutes",
  hour: "heures",
  hours: "heures",
  dayofmonth: "jour du mois",
  dom: "jour du mois",
  month: "mois",
  dayofweek: "jour de la semaine",
  dow: "jour de la semaine",
};

function fieldName(name) {
  const key = name.replace(/^Cron/, "").toLowerCase();
  return `« ${FIELD_NAMES[key] ?? name} »`;
}

const CRON_ERRORS = [
  // cronstrue
  [/^cron expression is empty$/, "l'expression est vide."],
  [
    /^Expression has only (\d+) parts?\. At least 5 parts are required\.$/,
    "l'expression n'a que $1 champ(s), il en faut au moins 5.",
  ],
  [
    /^Expression has (\d+) parts; too many!$/,
    "l'expression a $1 champs, c'est trop.",
  ],
  [/^Unknown special expression\.$/, "expression spéciale inconnue."],
  [
    /^Expression contains invalid values: '(.*)'$/,
    "valeur(s) invalide(s) : « $1 ».",
  ],
  [
    /^The 'W' character can be specified only when[\s\S]*$/,
    "le caractère W ne s'utilise qu'avec un seul jour du mois, pas avec une plage ou une liste.",
  ],
  [
    /^step value must be greater than 0$/,
    "le pas (après /) doit être supérieur à 0.",
  ],
  [
    /^DOW nth weekday must be >= (\d+) and <= (\d+)$/,
    "le numéro d'occurrence (après #) doit être compris entre $1 et $2.",
  ],
  [
    /^(\w+) part must be >= (\d+) and <= (\d+)$/,
    (_, field, min, max) =>
      `le champ ${fieldName(field)} doit être compris entre ${min} et ${max}.`,
  ],
  // cron-parser
  [
    /^Invalid range: (\S+), min(?:\(\d+\))? > max(?:\(\d+\))?$/,
    "plage invalide : $1, le début est après la fin.",
  ],
  [
    /^Invalid range: (\S+), outside the (\S+) range of the (\w+) field$/,
    (_, range, bounds, field) =>
      `plage invalide : ${range}, en dehors de l'intervalle ${bounds} du champ ${fieldName(field)}.`,
  ],
  [
    /^Invalid range: (\S+), no usable value in the (\w+) field$/,
    (_, range, field) =>
      `plage invalide : ${range}, aucune valeur utilisable dans le champ ${fieldName(field)}.`,
  ],
  [
    /^Invalid step: (\S+), must be positive$/,
    "pas invalide : $1, il doit être positif.",
  ],
  [
    /^Invalid step: (\S+), wider than the (\S+) range of the (\w+) field$/,
    (_, step, bounds, field) =>
      `pas invalide : ${step}, plus grand que l'intervalle ${bounds} du champ ${fieldName(field)}.`,
  ],
  [
    /^Invalid explicit day of month definition$/,
    "cette date n'existe dans aucun mois (ex. 31 février).",
  ],
  [
    /^(\w+) Validation error, duplicate values found: (.+)$/,
    (_, field, value) =>
      `valeur en double dans le champ ${fieldName(field)} : ${value}.`,
  ],
  [
    /^(\w+) Validation error, got value (\S+) expected range (\d+-\d+)/,
    (_, field, value, bounds) =>
      `valeur ${value} en dehors de l'intervalle ${bounds} du champ ${fieldName(field)}.`,
  ],
  [
    /^Constraint error, got (value|range) (\S+) expected range (\S+)$/,
    (_, kind, value, bounds) =>
      `${kind === "range" ? "plage" : "valeur"} ${value} en dehors de l'intervalle ${bounds}.`,
  ],
  [
    /^Constraint error, too many values in (\w+) field/,
    (_, field) => `trop de valeurs dans le champ ${fieldName(field)}.`,
  ],
  [
    /^Constraint error, cannot repeat at every (\S+) time\.$/,
    "impossible de répéter tous les $1.",
  ],
  [
    /^Constraint error, invalid dayOfWeek `#` and `(.+)` special characters are incompatible$/,
    "# et $1 ne peuvent pas être combinés dans le jour de la semaine.",
  ],
  [
    /^Constraint error, invalid dayOfWeek occurrence number \(#\)$/,
    "numéro d'occurrence (après #) invalide.",
  ],
  [
    /^\w+ Validation error, unexpected standalone L$/,
    "L seul n'est pas accepté dans le jour de la semaine (ex. 5L pour le dernier vendredi du mois).",
  ],
  [
    /^Validation error, cannot resolve alias "(.+)"$/,
    "alias inconnu : « $1 ».",
  ],
  [/^Invalid characters, got value: (.+)$/, "caractères invalides : « $1 »."],
  [/^Invalid repeat: (.+)$/, "répétition invalide : « $1 »."],
  [/^Invalid list value format$/, "format de liste invalide."],
  [
    /^Invalid cron expression, too many fields$/,
    "trop de champs (6 au maximum).",
  ],
  [/^Invalid cron expression, too long/, "l'expression est trop longue."],
  [
    /^(Out of the time span range|Invalid expression, loop limit exceeded)$/,
    "aucune prochaine exécution trouvée.",
  ],
];

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
      const reason = translateError(
        String(error.message ?? error).replace(/^Error:\s*/, ""),
        CRON_ERRORS,
        "format non reconnu.",
      );
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
