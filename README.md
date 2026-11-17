# AudioForge

Application Windows 10/11 x64 en français pour récupérer des contenus audio et vidéo autorisés, choisir leur format et organiser les fichiers sur son ordinateur.

## Téléchargement

[![Installateur Windows x64 — Disponibilité](https://img.shields.io/badge/Installateur_Windows_x64-Disponibilit%C3%A9-2563EB?style=for-the-badge)](https://github.com/raphaelmounirpro-creator/Audio-Forge/releases)

L’installateur NSIS x64 a été compilé. La [préparation de la release 0.1.0](docs/distribution/README.md) indique les vérifications qui restent avant sa publication sur GitHub Releases.

## But du projet

AudioForge rend les outils yt-dlp et FFmpeg accessibles dans une interface de bureau. Le parcours principal est simple : coller un lien, analyser le média, choisir un format et suivre son traitement dans une file d'attente.

Le projet impose une gratuité à **100 %** : aucun abonnement, publicité, compte AudioForge ou API payante obligatoire. Les conversions, préférences et données d'historique sont traitées localement. Internet reste nécessaire pour les médias distants et pour la première installation des composants.

yt-dlp, FFmpeg et Deno ne sont pas inclus dans l'installateur. Au premier usage, AudioForge propose de les télécharger (environ 173 Mo) depuis leurs distributeurs officiels, GitHub et gyan.dev. Il vérifie leur empreinte SHA-256 avant de les enregistrer dans le profil Windows de l'utilisateur. Rien n'est téléchargé sans un clic explicite.

## Fonctionnalités

| Fonctionnalité | Description |
| --- | --- |
| Analyse des liens | Récupération du titre, de la durée et des formats accessibles via yt-dlp. Sources initiales : YouTube, Vimeo, Wikimedia et Archive.org, selon leur compatibilité et la disponibilité des contenus. |
| Téléchargement audio | Sorties MP3, M4A/AAC, Opus, FLAC, WAV ou flux original. Débits MP3 proposés : 128, 192, 256 et 320 kb/s. |
| Téléchargement vidéo | Choix d'une résolution maximale et sorties MP4, MKV, WebM ou format original. Multiplexage des pistes audio et vidéo avec FFmpeg lorsque nécessaire. |
| Playlists et lots | Import TXT, analyse jusqu’à 25 liens par lot, sélection paginée et compteur par playlist. |
| File d'attente | Progression, annulation, relance individuelle ou groupée. De 1 à 5 tâches simultanées configurables. |
| Conversion locale | Sélection d’un fichier Windows et conversion audio ou MP4 compatible dans la file. |
| Profils | Profils prêts à l’emploi et profils personnalisés conservés dans SQLite. |
| Historique | Recherche, tri, doublons et ouverture des fichiers. Affiche l’auteur et la durée disponibles, la taille et l’état du fichier sur disque. |
| Préférences | Dossier de destination, formats par défaut, débit MP3 et nombre de tâches simultanées. |
| Interface française | Accueil, Téléchargements, Historique, Paramètres et À propos ; thème sombre et navigation au clavier. |

La conversion en FLAC ou MP3 320 kb/s n'améliore pas la qualité d'une source déjà compressée. Le changement de conteneur vidéo dépend de la compatibilité des codecs.

## État du développement

Un premier paquet de la version de développement **0.1.0** a démarré dans Windows Sandbox et créé sa base SQLite. L’installateur du lot actuel a été compilé. Son sélecteur de fichiers et le parcours complet de téléchargement dans l’application installée restent à vérifier.

Les validations enregistrées comprennent :

- 31 tests frontend, 32 tests Rust et 30 tests de scripts.
- 6 tests navigateur, dont la navigation au clavier et l’affichage agrandi.
- 2 tests natifs de conversion, dont MP4 vers MP3 via la file et vérification de SQLite après réouverture.
- 1 test réseau du moteur avec un fichier public Wikimedia.

Les parcours complets sur chaque plateforme, la robustesse des téléchargements en conditions réelles et l'ensemble du cahier des charges 1.0 restent à valider. La liste des fonctionnalités ne constitue pas une garantie de compatibilité avec tous les contenus ou tous les sites.

## Limites actuelles

- L'installateur de développement ne possède pas de signature d'éditeur reconnue. Smart App Control a bloqué son installation directe sur le PC de développement.
- Windows Sandbox permet un usage isolé provisoire. Ses données sont temporaires : les fichiers à conserver doivent être copiés dans le dossier partagé avant fermeture.
- Les miniatures, les pochettes, les métadonnées complètes et le nommage avancé restent à compléter.
- Les protections réseau et les processus enfants nécessitent encore des vérifications avant une diffusion large.
- Le téléchargement des composants à la demande est compilé, et l'installateur qui en dépend a été installé et démarré dans Windows Sandbox. Il reste à télécharger réellement les composants depuis l'application installée, puis à réaliser une conversion.
- Aucun téléchargement public d'un installateur n'est annoncé dans cette présentation.

## Technologies

| Partie | Technologies |
| --- | --- |
| Interface | React, TypeScript strict, Vite, Tailwind CSS, Lucide |
| Application native | Tauri 2, Rust |
| Multimédia | yt-dlp, FFmpeg, ffprobe, Deno lorsque nécessaire aux extracteurs |
| Données | SQLite local |
| Tests | Vitest, Testing Library, tests Rust, Playwright |
| Distribution prévue | Installateur Windows NSIS x64 |

## Confidentialité et sécurité

Aucun compte AudioForge, aucune télémétrie et aucun serveur distant AudioForge ne sont nécessaires au fonctionnement. Les plateformes sources reçoivent les connexions utiles aux contenus demandés.

Le projet prévoit la validation des URL et des chemins, des arguments de processus contrôlés et la vérification des exécutables par SHA-256. Ces mesures ne remplacent pas un audit de sécurité complet ou une signature d'éditeur reconnue.

## Utilisation autorisée

AudioForge est destiné aux contenus dont l'utilisateur détient les droits ou pour lesquels il dispose d'une autorisation. Les contenus privés, l'utilisation de cookies de connexion et le contournement des DRM ou des contrôles d'accès sont exclus du périmètre initial.

## Licence

Le code propre d'AudioForge est distribué sous [licence MIT](LICENSE). Les licences des bibliothèques intégrées sont installées avec l'application. yt-dlp, FFmpeg et Deno, téléchargés depuis leurs distributeurs, conservent leurs propres licences, notamment GPLv3 pour le build FFmpeg. Voir [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Développement

Prérequis : Node.js, Rust stable MSVC, Microsoft C++ Build Tools avec SDK Windows, et WebView2 pour l'application de bureau.

```powershell
npm ci
npm run tools:fetch
npm run tools:verify
npm run dev
```

`npm run dev` ouvre uniquement l'aperçu web ; les commandes natives nécessitent `npm run desktop:dev`. La compilation Windows se lance avec `npm run desktop:build`. Tests : `npm test`, `npm run test:scripts` et les suites Rust décrites dans le workflow.

## Code signing policy

La candidature SignPath Foundation a été envoyée et sa réception confirmée ; AudioForge n'est pas encore admis ou signé. La [validation Windows GitHub](https://github.com/raphaelmounirpro-creator/Audio-Forge/actions/runs/43906288257) a réussi les tests, la compilation release et la génération NSIS, sans exporter de binaire téléchargeable. Voir la [politique de signature](CODE_SIGNING_POLICY.md), la [confidentialité](PRIVACY.md) et les [prérequis de candidature](docs/signing/PREPARATION.md). La signature doit être demandée manuellement après admission ; aucune release n'est publiée automatiquement.
