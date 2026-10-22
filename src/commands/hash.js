const crypto = require("node:crypto");
const { SlashCommandBuilder } = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");

const ALGORITHMS = ["md5", "sha1", "sha256", "sha512"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hash")
    .setDescription("Calcule le hash d'un texte.")
    .addStringOption((option) =>
      option
        .setName("texte")
        .setDescription("Le texte à hasher")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("algorithme")
        .setDescription("Algorithme à utiliser (tous par défaut)")
        .addChoices(
          ...ALGORITHMS.map((algorithm) => ({
            name: algorithm.toUpperCase(),
            value: algorithm,
          })),
        ),
    ),
  async execute(interaction) {
    const text = interaction.options.getString("texte", true);
    const algorithm = interaction.options.getString("algorithme");
    const algorithms = algorithm ? [algorithm] : ALGORITHMS;

    const lines = algorithms.map(
      (name) =>
        `${name.padEnd(7)}${crypto.createHash(name).update(text, "utf8").digest("hex")}`,
    );

    await replyWithCode(interaction, { content: lines.join("\n") });
  },
};
