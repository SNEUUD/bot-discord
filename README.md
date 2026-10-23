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
- `PIXELAUTO_URL` et `API_KEY` (optionnels) : URL de base et clé de l'API pixelauto, nécessaires à `/video`.

## Utilisation

```bash
npm start        # démarre le bot
npm run dev      # démarre le bot avec rechargement auto (node --watch)
npm run deploy   # enregistre les commandes slash sans démarrer le bot
```

Les commandes slash sont enregistrées automatiquement à chaque démarrage du bot : un déploiement (ex. Coolify) suffit à les mettre à jour, `npm run deploy` n'est pas nécessaire.

## Commandes

| Commande | Description |
|---|---|
| `/ping` | Latence du bot |
| `/clear <nombre>` | Supprime des messages dans le salon |
| `/json [mode] [json]` | Formate, minifie ou valide du JSON (sans `json`, ouvre un champ de saisie) |
| `/jwt <token>` | Décode un JWT et affiche ses dates (signature non vérifiée) |
| `/regex <motif> <texte> [flags]` | Teste une regex et liste les correspondances et groupes |
| `/base64 encoder\|decoder <texte> [url]` | Encode ou décode du base64 / base64url |
| `/hash <texte> [algorithme]` | MD5, SHA-1, SHA-256, SHA-512 |
| `/uuid [nombre]` | Génère des UUID v4 |
| `/timestamp [date]` | Convertit une date ↔ timestamp Unix ↔ formats Discord `<t:…>` |
| `/cron <expression> [fuseau]` | Explique une expression cron et donne les 5 prochaines exécutions |
| `/http <code>` | Explique un code de statut HTTP (avec autocomplétion) |
| `/npm <paquet>` | Version, licence, téléchargements et date de publication d'un paquet |
| `/color <valeur>` | Aperçu d'une couleur et conversions HEX / RGB / HSL |
| `/video creer [fichier]` | Lance le rendu d'une vidéo pixelauto à partir d'un épisode JSON (fichier joint, ou champ de saisie jusqu'à 4000 caractères) |
| `/video suivre <id>` | Suit un rendu en direct (file d'attente, étape, progression) et envoie le MP4 à la fin |
| `/video telecharger <id>` | Envoie le MP4 d'un rendu terminé |
| `/video liste [nombre]` | Derniers rendus |
| `/video journal <id>` | Journal d'un rendu (utile en cas d'échec) |
| `/video annuler <id>` | Annule un rendu en cours, ou supprime un rendu terminé et son MP4 |

Les réponses des commandes utilitaires sont éphémères (visibles uniquement par l'auteur de la commande) ; un résultat trop long pour un message est envoyé en fichier joint.

Après `/video creer`, le message de suivi est public et mis à jour toutes les 4 s, avec un bouton pour annuler le rendu. À la fin, le bot mentionne l'auteur et envoie la vidéo (ou l'erreur). Si le MP4 dépasse la limite d'envoi du serveur (10 Mo sans boost), le bot l'indique : la vidéo reste téléchargeable depuis l'API pendant 14 jours. Le suivi s'arrête si le bot redémarre : le reprendre avec `/video suivre`.

## Ajouter une commande

Créer un fichier dans `src/commands/` exportant `{ data, execute }` (voir `ping.js`).

## Ajouter un composant (bouton, menu, modale)

Créer un fichier dans `src/components/` exportant `{ customId, execute }`. Les interactions dont le `customId` vaut `customId` ou commence par `customId:` lui sont routées, ce qui permet de passer des paramètres (ex. `role:123456`).

## Ajouter un événement

Créer un fichier dans `src/events/` exportant `{ name, once?, execute }` (voir `ready.js`).
