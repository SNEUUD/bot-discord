const zlib = require("node:zlib");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  inlineCode,
} = require("discord.js");

const PREVIEW_SIZE = 64;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Génère un PNG carré uni, sans dépendance externe. */
function solidPng([r, g, b], size = PREVIEW_SIZE) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits par canal
  header[9] = 2; // RGB

  const row = Buffer.alloc(1 + size * 3); // octet de filtre + pixels
  for (let x = 0; x < size; x++) row.set([r, g, b], 1 + x * 3);
  const pixels = Buffer.concat(Array(size).fill(row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((value) => Math.round(value * 255));
}

function rgbToHsl([r, g, b]) {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, Math.round(l * 100)];

  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [
    Math.round((h * 60 + 360) % 360),
    Math.round(s * 100),
    Math.round(l * 100),
  ];
}

/** Interprète #rgb, #rrggbb, rgb(r, g, b) ou hsl(h, s%, l%). */
function parseColor(input) {
  const value = input.trim().toLowerCase();

  const hex = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits =
      hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  }

  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    return channels.every((c) => c <= 255) ? channels : null;
  }

  const hsl = value.match(
    /^hsla?\(\s*(\d+)(?:deg)?\s*,?\s*(\d+)%\s*,?\s*(\d+)%/,
  );
  if (hsl) {
    const [h, s, l] = hsl.slice(1, 4).map(Number);
    return s <= 100 && l <= 100 ? hslToRgb(h % 360, s, l) : null;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("color")
    .setDescription("Affiche une couleur et ses conversions (HEX, RGB, HSL).")
    .addStringOption((option) =>
      option
        .setName("valeur")
        .setDescription("Ex. #5865f2, rgb(88, 101, 242), hsl(235, 86%, 65%)")
        .setRequired(true),
    ),
  async execute(interaction) {
    const rgb = parseColor(interaction.options.getString("valeur", true));

    if (!rgb) {
      await interaction.reply({
        content:
          "❌ Couleur invalide. Formats acceptés : `#5865f2`, `#fff`, `rgb(88, 101, 242)`, `hsl(235, 86%, 65%)`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const hex = `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    const [h, s, l] = rgbToHsl(rgb);
    const preview = new AttachmentBuilder(solidPng(rgb), {
      name: "couleur.png",
    });

    const embed = new EmbedBuilder()
      .setTitle(hex.toUpperCase())
      .setColor(rgb)
      .setThumbnail("attachment://couleur.png")
      .addFields(
        { name: "HEX", value: inlineCode(hex), inline: true },
        {
          name: "RGB",
          value: inlineCode(`rgb(${rgb.join(", ")})`),
          inline: true,
        },
        {
          name: "HSL",
          value: inlineCode(`hsl(${h}, ${s}%, ${l}%)`),
          inline: true,
        },
        {
          name: "Décimal",
          value: inlineCode(parseInt(hex.slice(1), 16)),
          inline: true,
        },
      );

    await interaction.reply({
      embeds: [embed],
      files: [preview],
      flags: MessageFlags.Ephemeral,
    });
  },
};
