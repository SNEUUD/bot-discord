const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Répond avec la latence du bot."),
  async execute(interaction) {
    const { resource } = await interaction.reply({
      content: "Connexion...",
      withResponse: true,
    });
    const latency =
      resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(
      `Latence : ${latency}ms | API : ${Math.round(interaction.client.ws.ping)}ms`,
    );
  },
};
