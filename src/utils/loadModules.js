const fs = require("node:fs");
const path = require("node:path");
const logger = require("./logger");

/**
 * Charge tous les modules .js d'un dossier.
 * Les modules auxquels il manque une des propriétés requises sont ignorés.
 * @param {string} dir - Dossier à parcourir (ignoré s'il n'existe pas).
 * @param {string[]} [requiredKeys] - Propriétés que chaque module doit exporter.
 * @returns {{ file: string, module: any }[]}
 */
function loadModules(dir, requiredKeys = []) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file, module: require(path.join(dir, file)) }))
    .filter(({ file, module }) => {
      const missing = requiredKeys.filter((key) => !(key in module));
      if (missing.length > 0) {
        logger.warn(
          `${path.basename(dir)}/${file} ignoré : propriété(s) manquante(s) ${missing.map((key) => `"${key}"`).join(", ")}.`,
        );
        return false;
      }
      return true;
    });
}

module.exports = loadModules;
