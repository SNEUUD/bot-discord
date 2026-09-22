const { Events } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    logger.success(`Connecté en tant que ${client.user.tag}.`);
  },
};
