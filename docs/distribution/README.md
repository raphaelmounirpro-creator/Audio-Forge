# Préparation de la release 0.1.0

La candidature SignPath Foundation a été envoyée et sa réception confirmée. AudioForge n’est pas encore admis ou signé. Aucune attribution de signature effective n’est affichée.

## Téléchargement

Les futures versions seront disponibles sur [GitHub Releases](https://github.com/raphaelmounirpro-creator/Audio-Forge/releases). Aucun installateur public n’est actuellement proposé. Le fichier local dans `releases/0.1.0/` est ignoré par Git : il ne constitue pas un téléchargement GitHub. Depuis le 17 novembre 2026, c'est l'installateur reconstruit sans programme tiers (3 311 368 octets, SHA-256 `b4903362…`). Il reste non signé et ne doit pas être téléversé avant la résolution des points de STATUS.json. L'ancien installateur, qui embarquait yt-dlp, FFmpeg et Deno, n'est plus dans ce dossier.

AudioForge propose une interface française Windows pour analyser des liens de médias autorisés, télécharger de l’audio ou de la vidéo, gérer une file d’attente et un historique local, et convertir l’audio avec FFmpeg. Il reste une version de développement ; les parcours réseau complets nécessitent encore des essais.

## Licences et sources

**L'installateur ne redistribue plus yt-dlp, FFmpeg ni Deno.** Au premier usage, et seulement après un clic de l'utilisateur, l'application les télécharge depuis leurs distributeurs officiels, puis vérifie leurs SHA-256. `npm run release:check` refuse toute configuration Tauri qui embarquerait de nouveau un programme tiers. Les demandes de sources correspondantes préparées dans [SOURCE-REQUESTS.md](SOURCE-REQUESTS.md) ne sont donc plus nécessaires pour publier AudioForge.

Les licences des bibliothèques compilées dans AudioForge sont générées par `npm run notices:deps` dans `src-tauri/notices/`, puis installées avec l'application. Les textes absents des paquets amont sont verrouillés par URL immuable et SHA-256. Voir [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md).

Les points restants sont dans [STATUS.json](STATUS.json).

## Avant publication

1. Résoudre les points de STATUS.json : conditions du runtime C MSVC lié statiquement et revue humaine des notices générées.
2. Vérifier que le paquet destiné à la release correspond à l’empreinte du paquet installé et testé dans Sandbox. Le [rapport de validation](VALIDATION.md#validation-du-paquet-actuel--18-novembre-2026) consigne le téléchargement des composants et la conversion réussis dans l’application.
3. Exécuter `npm run release:check`.
4. Créer la GitHub Release `v0.1.0` depuis le commit validé, avec l'installateur reconstruit et SHA256SUMS. Indiquer clairement son absence de signature si l'admission est encore en attente.
5. Télécharger les fichiers depuis la release publique et comparer leurs empreintes. Mettre à jour la page de téléchargement puis la candidature avec cette URL.

La publication de sources seules ne satisfait pas à elle seule l’exigence SignPath d’un logiciel déjà diffusé sous la forme à signer. Une version non signée peut être publiée une fois les points de STATUS.json résolus.
