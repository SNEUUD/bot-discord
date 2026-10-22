const { processJson } = require("../commands/json");

module.exports = {
  customId: "json",
  async execute(interaction) {
    const [, mode] = interaction.customId.split(":");
    const input = interaction.fields.getTextInputValue("input");
    await processJson(interaction, input, mode);
  },
};
