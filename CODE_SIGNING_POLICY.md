# Code signing policy

**Statut : candidature SignPath Foundation en préparation. Aucune admission ni signature de production obtenue.** Ce document est une proposition à confirmer par le responsable du projet.

## Périmètre proposé

Signer uniquement le programme `audioforge.exe` construit à partir des sources AudioForge, puis son installateur NSIS. yt-dlp, FFmpeg, ffprobe et Deno conservent leurs signatures et licences propres ; ils ne sont pas signés au nom d'AudioForge.

Le workflow manuel lie les artefacts au commit GitHub qui les construit. Chaque demande doit être soumise à une politique SignPath de production exigeant une approbation humaine. Le dépôt et le service de signature doivent utiliser l'authentification multifacteur.

## Responsabilités proposées

- Responsable du dépôt et auteur : `raphaelmounirpro-creator`.
- Relecture et approbation de signature : membres à confirmer dans la candidature et dans les droits SignPath. Aucun rôle SignPath n'est créé par ce document.
- La clé privée reste chez le prestataire ; elle n'est jamais ajoutée au dépôt ou à l'installateur.

## Confidentialité

Voir [PRIVACY.md](PRIVACY.md). L'application traite les fichiers et l'historique localement. Les communications avec les sources demandées et les composants système doivent rester documentées.

## Attribution après acceptation uniquement

Après admission effective, ajouter l'attribution requise : « Free code signing provided by SignPath.io, certificate by SignPath Foundation », avec les liens vers [SignPath.io](https://about.signpath.io/) et [SignPath Foundation](https://signpath.org/). Cette mention ne signifie pas que le projet bénéficie déjà du service.

## Contrôles

Avant diffusion : licence choisie, sources publiques correspondant au build, obligations des composants complétées, métadonnées AudioForge/version contrôlées, signature Authenticode valide et horodatée. Un test d'installation sur Windows protégé reste nécessaire ; une signature ne garantit pas l'absence de tout avertissement ou de blocage d'un composant tiers.
