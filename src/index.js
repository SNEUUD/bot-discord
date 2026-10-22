require("dotenv").config();
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const logger = require("./utils/logger");
const loadModules = require("./utils/loadModules");

const { DISCORD_TOKEN } = process.env;

if (!DISCORD_TOKEN) {
  logger.error("DISCORD_TOKEN est manquant dans le fichier .env.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
client.components = new Collection();

const commandsPath = path.join(__dirname, "commands");
for (const { module: command } of loadModules(commandsPath, [
  "data",
  "execute",
])) {
  client.commands.set(command.data.name, command);
}

// Boutons, menus et modales : le customId "prefixe:args" est routé vers le
// composant dont le customId vaut "prefixe".
const componentsPath = path.join(__dirname, "components");
for (const { module: component } of loadModules(componentsPath, [
  "customId",
  "execute",
])) {
  client.components.set(component.customId, component);
}

const eventsPath = path.join(__dirname, "events");
for (const { file, module: event } of loadModules(eventsPath, [
  "name",
  "execute",
])) {
  const handler = async (...args) => {
    try {
      await event.execute(...args, client);
    } catch (error) {
      logger.error(`Erreur dans l'événement ${event.name} (${file}) :`, error);
    }
  };
  if (event.once) {
    client.once(event.name, handler);
  } else {
    client.on(event.name, handler);
  }
}

client.on("error", (error) => {
  logger.error("Erreur du client Discord :", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Promesse rejetée non gérée :", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Exception non interceptée :", error);
  process.exit(1);
});

async function shutdown(signal) {
  logger.info(`${signal} reçu, déconnexion...`);
  await client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

client.login(DISCORD_TOKEN);
