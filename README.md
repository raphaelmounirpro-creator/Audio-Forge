# AudioForge

Application Windows 10/11 x64 en français pour récupérer des contenus audio et vidéo autorisés, choisir leur format et organiser les fichiers sur son ordinateur.

## But du projet

AudioForge rend les outils yt-dlp et FFmpeg accessibles dans une interface de bureau. Le parcours principal est simple : coller un lien, analyser le média, choisir un format et suivre son traitement dans une file d'attente.

Le projet impose une gratuité à **100 %** : aucun abonnement, publicité, compte AudioForge ou API payante obligatoire. Les conversions, préférences et données d'historique sont traitées localement. Internet reste nécessaire pour les médias distants et certains composants d'installation.

## Fonctionnalités

| Fonctionnalité | Description |
| --- | --- |
| Analyse des liens | Récupération du titre, de la durée et des formats accessibles via yt-dlp. Sources initiales : YouTube, Vimeo, Wikimedia et Archive.org, selon leur compatibilité et la disponibilité des contenus. |
| Téléchargement audio | Sorties MP3, M4A/AAC, Opus, FLAC, WAV ou flux original. Débits MP3 proposés : 128, 192, 256 et 320 kb/s. |
| Téléchargement vidéo | Choix d'une résolution maximale et sorties MP4, MKV, WebM ou format original. Multiplexage des pistes audio et vidéo avec FFmpeg lorsque nécessaire. |
| Playlists et lots | Analyse de plusieurs liens et sélection des éléments d'une playlist. Limites actuelles : 25 liens par lot et 200 éléments par analyse de playlist. |
| File d'attente | Progression, états des tâches, annulation et nouvelle tentative. De 1 à 5 téléchargements simultanés configurables. |
| Historique | Stockage SQLite local, recherche, filtres et ouverture des fichiers existants. Retirer une entrée ne supprime pas le fichier. |
| Préférences | Dossier de destination, formats par défaut, débit MP3 et nombre de tâches simultanées. |
| Interface française | Accueil, Téléchargements, Historique, Paramètres et À propos ; thème sombre et navigation au clavier. |

La conversion en FLAC ou MP3 320 kb/s n'améliore pas la qualité d'une source déjà compressée. Le changement de conteneur vidéo dépend de la compatibilité des codecs.

## État du développement

La version de développement **0.1.0** a été compilée, installée et démarrée dans Windows Sandbox. Les conversions locales et l'intégrité des composants installés ont été vérifiées. L'utilisateur a également confirmé le fonctionnement d'AudioForge dans cet environnement.

Les validations enregistrées comprennent :

- 19 tests frontend ;
- 14 tests Rust ;
- un test d'intégration Rust couvrant cinq formats audio ;
- six tests navigateur, dont la navigation au clavier et l'affichage agrandi ;
- des tests des scripts de préparation et de lancement.

Les parcours complets sur chaque plateforme, la robustesse des téléchargements en conditions réelles et l'ensemble du cahier des charges 1.0 restent à valider. La liste des fonctionnalités ne constitue pas une garantie de compatibilité avec tous les contenus ou tous les sites.

## Limites actuelles

- L'installateur de développement ne possède pas de signature d'éditeur reconnue. Smart App Control a bloqué son installation directe sur le PC de développement.
- Windows Sandbox permet un usage isolé provisoire. Ses données sont temporaires : les fichiers à conserver doivent être copiés dans le dossier partagé avant fermeture.
- Les miniatures, les pochettes, les métadonnées complètes, le nommage avancé et les playlists progressives restent à compléter.
- Les protections réseau et les processus enfants nécessitent encore des vérifications avant une diffusion large.
- Les licences, notices et sources correspondantes des composants redistribués doivent être rassemblées avant une distribution publique complète.
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

La licence finale du projet reste à définir après vérification des dépendances et de leurs obligations de redistribution. La gratuité du logiciel ne dispense pas du respect des licences tierces.
