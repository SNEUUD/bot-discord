const fs = require('node:fs');
const path = require('node:path');

/**
 * Charge tous les modules .js d'un dossier.
 * @param {string} dir - Dossier à parcourir.
 * @returns {{ file: string, module: any }[]}
 */
function loadModules(dir) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, module: require(path.join(dir, file)) }));
}

module.exports = loadModules;
