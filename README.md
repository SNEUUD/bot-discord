# bot-discord

Base d'un bot Discord en Node.js avec [discord.js](https://discord.js.org/) v14.

## Structure

```
src/
  commands/          # une commande slash par fichier (data + execute)
  events/            # un événement Discord.js par fichier (name, once?, execute)
  index.js           # point d'entrée : charge commandes/événements et se connecte
  deploy-commands.js # enregistre les slash commands auprès de Discord
```

## Installation

```bash
npm install
cp .env.example .env
```

Renseigner dans `.env` :
- `DISCORD_TOKEN` : token du bot (portail développeur Discord > Bot)
- `CLIENT_ID` : ID de l'application
- `GUILD_ID` (optionnel) : ID d'un serveur pour un déploiement instantané des commandes en dev. Sans elle, le déploiement est global (peut prendre jusqu'à 1h à se propager).

## Utilisation

```bash
npm run deploy   # enregistre les commandes slash
npm start        # démarre le bot
npm run dev       # démarre le bot avec rechargement auto (node --watch)
```

## Ajouter une commande

Créer un fichier dans `src/commands/` exportant `{ data, execute }` (voir `ping.js`).

## Ajouter un événement

Créer un fichier dans `src/events/` exportant `{ name, once?, execute }` (voir `ready.js`).
