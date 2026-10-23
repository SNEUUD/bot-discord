const logger = require("./logger");

/**
 * Traduit le message d'erreur (en anglais) d'une bibliothèque à partir d'une
 * liste de règles. Chaque règle est passée à `String.prototype.replace`, la
 * traduction peut donc utiliser $1, $2… ou être une fonction.
 * @param {string} message - Message d'origine.
 * @param {[RegExp, string | Function][]} rules - Règles [motif, traduction].
 * @param {string} fallback - Message renvoyé si aucune règle ne correspond.
 * @returns {string}
 */
function translateError(message, rules, fallback) {
  for (const [pattern, translation] of rules) {
    if (pattern.test(message)) return message.replace(pattern, translation);
  }
  logger.warn(`Message d'erreur non traduit : ${message}`);
  return fallback;
}

module.exports = translateError;
