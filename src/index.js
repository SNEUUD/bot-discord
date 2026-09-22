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

const commandsPath = path.join(__dirname, "commands");
for (const { file, module: command } of loadModules(commandsPath)) {
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    logger.warn(
      `La commande ${file} n'a pas de propriété "data" ou "execute".`,
    );
  }
}

const eventsPath = path.join(__dirname, "events");
for (const { module: event } of loadModules(eventsPath)) {
  const handler = (...args) => event.execute(...args, client);
  if (event.once) {
    client.once(event.name, handler);
  } else {
    client.on(event.name, handler);
  }
}

client.on("error", (error) => {
  logger.error("Erreur du client Discord :", error);
});

client.login(DISCORD_TOKEN);
