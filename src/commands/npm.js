const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  time,
} = require("discord.js");

const REQUEST_TIMEOUT_MS = 5000;
const PACKAGE_NAME_PATTERN =
  /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${url} a répondu ${response.status}`);
  }
  return response.json();
}

function repositoryUrl(repository) {
  const url = typeof repository === "string" ? repository : repository?.url;
  return url
    ?.replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("npm")
    .setDescription("Affiche les informations d'un paquet npm.")
    .addStringOption((option) =>
      option
        .setName("paquet")
        .setDescription("Nom du paquet (ex. discord.js, @discordjs/rest)")
        .setRequired(true),
    ),
  async execute(interaction) {
    const name = interaction.options
      .getString("paquet", true)
      .trim()
      .toLowerCase();

    if (!PACKAGE_NAME_PATTERN.test(name)) {
      await interaction.reply({
        content: "❌ Nom de paquet invalide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [latest, downloads, search] = await Promise.all([
      fetchJson(
        `https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`,
      ),
      fetchJson(`https://api.npmjs.org/downloads/point/last-week/${name}`),
      fetchJson(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(name)}&size=5`,
      ),
    ]);

    if (!latest) {
      await interaction.editReply(`❌ Le paquet \`${name}\` est introuvable.`);
      return;
    }

    const publishedAt = search?.objects?.find(
      (result) => result.package.name === name,
    )?.package.date;
    const repository = repositoryUrl(latest.repository);
    const links = [
      repository && `[Dépôt](${repository})`,
      latest.homepage && `[Site](${latest.homepage})`,
    ].filter(Boolean);

    const embed = new EmbedBuilder()
      .setTitle(`${latest.name}@${latest.version}`)
      .setURL(`https://www.npmjs.com/package/${latest.name}`)
      .setColor(0xcb3837)
      .setDescription(latest.description || "*Pas de description.*")
      .addFields(
        { name: "Version", value: latest.version, inline: true },
        { name: "Licence", value: latest.license || "—", inline: true },
        {
          name: "Téléchargements / semaine",
          value: downloads ? downloads.downloads.toLocaleString("fr-FR") : "—",
          inline: true,
        },
        {
          name: "Publiée",
          value: publishedAt ? time(new Date(publishedAt), "R") : "—",
          inline: true,
        },
        {
          name: "Dépendances",
          value: String(Object.keys(latest.dependencies ?? {}).length),
          inline: true,
        },
        {
          name: "Node",
          value: latest.engines?.node ?? "—",
          inline: true,
        },
      );
    if (links.length > 0) {
      embed.addFields({ name: "Liens", value: links.join(" · ") });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
