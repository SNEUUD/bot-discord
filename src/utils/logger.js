const COLORS = {
  info: "\x1b[36m",
  success: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const color = COLORS[level] ?? "";
  const method =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  method(
    `${color}[${timestamp}] [${level.toUpperCase()}]${RESET} ${message}`,
    ...args,
  );
}

module.exports = {
  info: (message, ...args) => log("info", message, ...args),
  success: (message, ...args) => log("success", message, ...args),
  warn: (message, ...args) => log("warn", message, ...args),
  error: (message, ...args) => log("error", message, ...args),
};
