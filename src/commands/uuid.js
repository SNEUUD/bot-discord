const crypto = require("node:crypto");
const { SlashCommandBuilder } = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uuid")
    .setDescription("Génère un ou plusieurs UUID v4.")
    .addIntegerOption((option) =>
      option
        .setName("nombre")
        .setDescription("Nombre d'UUID à générer (1-20)")
        .setMinValue(1)
        .setMaxValue(20),
    ),
  async execute(interaction) {
    const count = interaction.options.getInteger("nombre") ?? 1;
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());

    await replyWithCode(interaction, { content: uuids.join("\n") });
  },
};
