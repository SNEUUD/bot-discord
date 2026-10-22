# bot-discord

Base d'un bot Discord en Node.js avec [discord.js](https://discord.js.org/) v14.

## Structure

```
src/
  commands/          # une commande slash par fichier (data, execute, autocomplete?)
  components/        # un bouton / menu / modale par fichier (customId, execute)
  events/            # un événement Discord.js par fichier (name, once?, execute)
  index.js           # point d'entrée : charge commandes/événements et se connecte
  deploy-commands.js # enregistre les slash commands sans démarrer le bot
```

## Installation

```bash
npm install
cp .env.example .env
```

Renseigner dans `.env` :
- `DISCORD_TOKEN` : token du bot (portail développeur Discord > Bot)
- `CLIENT_ID` : ID de l'application (utilisé uniquement par `npm run deploy`)
- `GUILD_ID` (optionnel) : ID d'un serveur pour un enregistrement instantané des commandes. Sans elle, l'enregistrement est global (peut prendre jusqu'à 1h à se propager).

## Utilisation

```bash
npm start        # démarre le bot
npm run dev      # démarre le bot avec rechargement auto (node --watch)
npm run deploy   # enregistre les commandes slash sans démarrer le bot
```

Les commandes slash sont enregistrées automatiquement à chaque démarrage du bot : un déploiement (ex. Coolify) suffit à les mettre à jour, `npm run deploy` n'est pas nécessaire.

## Ajouter une commande

Créer un fichier dans `src/commands/` exportant `{ data, execute }` (voir `ping.js`).

## Ajouter un composant (bouton, menu, modale)

Créer un fichier dans `src/components/` exportant `{ customId, execute }`. Les interactions dont le `customId` vaut `customId` ou commence par `customId:` lui sont routées, ce qui permet de passer des paramètres (ex. `role:123456`).

## Ajouter un événement

Créer un fichier dans `src/events/` exportant `{ name, once?, execute }` (voir `ready.js`).
