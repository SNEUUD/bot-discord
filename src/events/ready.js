const { Events } = require("discord.js");
const logger = require("../utils/logger");

const { GUILD_ID } = process.env;

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.success(`Connecté en tant que ${client.user.tag}.`);

    // Enregistre les commandes à chaque démarrage pour qu'un déploiement
    // (ex. Coolify) suffise à les mettre à jour sur Discord.
    const commands = client.commands.map((command) => command.data.toJSON());
    try {
      const registered = await client.application.commands.set(
        commands,
        GUILD_ID,
      );
      logger.success(
        `${registered.size} commande(s) enregistrée(s) ${GUILD_ID ? "sur le serveur" : "globalement"}.`,
      );

      // Des commandes globales (ex. un ancien `npm run deploy` sans GUILD_ID)
      // s'afficheraient en double avec celles du serveur.
      if (GUILD_ID) {
        const globalCommands = await client.application.commands.fetch();
        if (globalCommands.size > 0) {
          await client.application.commands.set([]);
          logger.info(
            `${globalCommands.size} commande(s) globale(s) supprimée(s) pour éviter les doublons.`,
          );
        }
      }
    } catch (error) {
      logger.error("Échec de l'enregistrement des commandes :", error);
    }
  },
};
