const { AttachmentBuilder, MessageFlags, codeBlock } = require("discord.js");

const MESSAGE_LIMIT = 2000;

/**
 * Répond en éphémère avec un bloc de code, ou avec un fichier joint si le
 * message dépasserait la limite de Discord.
 * @param {import("discord.js").RepliableInteraction} interaction
 * @param {object} options
 * @param {string} options.content - Contenu du bloc de code.
 * @param {string} [options.language] - Langage pour la coloration syntaxique.
 * @param {string} [options.header] - Texte affiché au-dessus du bloc.
 * @param {string} [options.filename] - Nom du fichier si le contenu est trop long.
 */
async function replyWithCode(
  interaction,
  { content, language = "", header = "", filename = "resultat.txt" },
) {
  // Empêche le contenu de fermer le bloc de code prématurément.
  const block = codeBlock(language, content.replaceAll("```", "`\u200b``"));
  const text = header ? `${header}\n${block}` : block;

  const payload =
    text.length <= MESSAGE_LIMIT
      ? { content: text }
      : {
          content: header || "Résultat trop long, envoyé en fichier :",
          files: [
            new AttachmentBuilder(Buffer.from(content), { name: filename }),
          ],
        };

  if (interaction.deferred) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
}

module.exports = replyWithCode;
