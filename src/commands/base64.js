const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

const addOptions = (subcommand) =>
  subcommand
    .addStringOption((option) =>
      option
        .setName("texte")
        .setDescription("Le texte à traiter")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("url")
        .setDescription("Utiliser la variante base64url (- et _, sans =)"),
    );

module.exports = {
  data: new SlashCommandBuilder()
    .setName("base64")
    .setDescription("Encode ou décode du base64.")
    .addSubcommand((subcommand) =>
      addOptions(
        subcommand
          .setName("encoder")
          .setDescription("Encode un texte en base64."),
      ),
    )
    .addSubcommand((subcommand) =>
      addOptions(
        subcommand.setName("decoder").setDescription("Décode du base64."),
      ),
    ),
  async execute(interaction) {
    const text = interaction.options.getString("texte", true);
    const encoding = interaction.options.getBoolean("url")
      ? "base64url"
      : "base64";

    if (interaction.options.getSubcommand() === "encoder") {
      await replyWithCode(interaction, {
        content: Buffer.from(text, "utf8").toString(encoding),
      });
      return;
    }

    const input = text.replace(/\s/g, "");
    const pattern =
      encoding === "base64url" ? BASE64URL_PATTERN : BASE64_PATTERN;
    if (!pattern.test(input)) {
      await interaction.reply({
        content: `❌ Ce texte n'est pas du ${encoding} valide.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const decoded = Buffer.from(input, encoding);
    const asText = decoded.toString("utf8");
    // Le caractère de remplacement signale des octets qui ne sont pas de l'UTF-8.
    if (asText.includes("\uFFFD")) {
      await replyWithCode(interaction, {
        header: "Contenu binaire, affiché en hexadécimal :",
        content: decoded
          .toString("hex")
          .replace(/(.{2})/g, "$1 ")
          .trim(),
        filename: "decode.txt",
      });
      return;
    }

    await replyWithCode(interaction, { content: asText });
  },
};
