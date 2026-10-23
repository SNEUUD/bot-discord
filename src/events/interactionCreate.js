const { Events, MessageFlags, RESTJSONErrorCodes } = require("discord.js");
const logger = require("../utils/logger");

const ERROR_REPLY = {
  content: "Une erreur s'est produite lors de l'exécution de cette commande.",
  flags: MessageFlags.Ephemeral,
};

// Discord laisse 3 secondes pour répondre : au-delà, le jeton expire et
// toute réponse (y compris le message d'erreur) échoue avec ce code.
function isExpiredInteraction(error) {
  return error?.code === RESTJSONErrorCodes.UnknownInteraction;
}

function warnExpired(interaction, label) {
  const age = Date.now() - interaction.createdTimestamp;
  logger.warn(
    `Interaction expirée avant la réponse de ${label} (${age} ms après sa création).`,
  );
}

async function replyWithError(interaction) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(ERROR_REPLY);
    } else {
      await interaction.reply(ERROR_REPLY);
    }
  } catch (fallbackError) {
    logger.error(
      "Impossible d'envoyer le message d'erreur (interaction probablement expirée) :",
      fallbackError,
    );
  }
}

async function handleCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    logger.error(`Commande inconnue : ${interaction.commandName}`);
    return;
  }

  logger.info(
    `/${interaction.commandName} exécutée par ${interaction.user.tag} dans #${interaction.channel?.name ?? "DM"}`,
  );

  try {
    await command.execute(interaction);
  } catch (error) {
    if (isExpiredInteraction(error)) {
      warnExpired(interaction, `/${interaction.commandName}`);
      return;
    }
    logger.error(
      `Erreur pendant l'exécution de /${interaction.commandName} :`,
      error,
    );
    await replyWithError(interaction);
  }
}

async function handleAutocomplete(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command?.autocomplete) return;

  try {
    await command.autocomplete(interaction);
  } catch (error) {
    logger.error(
      `Erreur pendant l'autocomplétion de /${interaction.commandName} :`,
      error,
    );
  }
}

async function handleComponent(interaction) {
  const [prefix] = interaction.customId.split(":");
  const component = interaction.client.components.get(prefix);

  if (!component) {
    logger.warn(`Aucun composant pour le customId "${interaction.customId}".`);
    return;
  }

  try {
    await component.execute(interaction);
  } catch (error) {
    if (isExpiredInteraction(error)) {
      warnExpired(interaction, `"${interaction.customId}"`);
      return;
    }
    logger.error(
      `Erreur pendant l'exécution du composant "${interaction.customId}" :`,
      error,
    );
    await replyWithError(interaction);
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (
      interaction.isButton() ||
      interaction.isAnySelectMenu() ||
      interaction.isModalSubmit()
    ) {
      await handleComponent(interaction);
    }
  },
};
