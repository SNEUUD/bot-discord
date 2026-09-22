require('dotenv').config();
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const logger = require('./utils/logger');
const loadModules = require('./utils/loadModules');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  logger.error('DISCORD_TOKEN et/ou CLIENT_ID sont manquants dans le fichier .env.');
  process.exit(1);
}

const commandsPath = path.join(__dirname, 'commands');
const commands = loadModules(commandsPath).map(({ module: command }) => command.data.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    logger.info(`Déploiement de ${commands.length} commande(s)...`);

    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);

    const data = await rest.put(route, { body: commands });

    logger.success(`${data.length} commande(s) déployée(s) avec succès.`);
  } catch (error) {
    logger.error('Échec du déploiement des commandes :', error);
  }
})();
