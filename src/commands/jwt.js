const { SlashCommandBuilder, MessageFlags, time } = require("discord.js");
const replyWithCode = require("../utils/replyWithCode");

const DATE_CLAIMS = {
  iat: "Émis le",
  nbf: "Valide à partir du",
  exp: "Expire le",
};

function decodePart(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("jwt")
    .setDescription("Décode un JWT (sans vérifier la signature).")
    .addStringOption((option) =>
      option
        .setName("token")
        .setDescription("Le JWT à décoder")
        .setRequired(true),
    ),
  async execute(interaction) {
    const token = interaction.options
      .getString("token", true)
      .trim()
      .replace(/^Bearer\s+/i, "");
    const parts = token.split(".");

    if (parts.length !== 3) {
      await interaction.reply({
        content:
          "❌ Un JWT est composé de 3 parties séparées par des points (header.payload.signature).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let header;
    let payload;
    try {
      header = decodePart(parts[0]);
      payload = decodePart(parts[1]);
    } catch {
      await interaction.reply({
        content:
          "❌ Impossible de décoder ce JWT : header ou payload invalide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = [];
    for (const [claim, label] of Object.entries(DATE_CLAIMS)) {
      if (typeof payload[claim] !== "number") continue;
      const date = new Date(payload[claim] * 1000);
      lines.push(`**${label}** : ${time(date, "F")} (${time(date, "R")})`);
    }
    if (typeof payload.exp === "number") {
      lines.unshift(
        payload.exp * 1000 < Date.now() ? "🔴 **Expiré**" : "🟢 **Non expiré**",
      );
    }
    lines.push("-# ⚠️ La signature n'est pas vérifiée.");

    await replyWithCode(interaction, {
      header: lines.join("\n"),
      content: JSON.stringify({ header, payload }, null, 2),
      language: "json",
      filename: "jwt.json",
    });
  },
};
