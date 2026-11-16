# Préparation de la release 0.1.0

La candidature SignPath Foundation a été envoyée et sa réception confirmée. AudioForge n’est pas encore admis ou signé. Aucune attribution de signature effective n’est affichée.

## Téléchargement

Les futures versions seront disponibles sur [GitHub Releases](https://github.com/raphaelmounirpro-creator/Audio-Forge/releases). Aucun installateur public n’est actuellement proposé. Le fichier local dans `releases/0.1.0/` est ignoré par Git : il ne constitue pas un téléchargement GitHub. Il contient les anciennes notices et ne doit pas être téléversé tel quel.

AudioForge propose une interface française Windows pour analyser des liens de médias autorisés, télécharger de l’audio ou de la vidéo, gérer une file d’attente et un historique local, et convertir l’audio avec FFmpeg. Il reste une version de développement ; les parcours réseau complets nécessitent encore des essais.

## Licences et sources

Les textes officiels yt-dlp, ses notices tierces et la licence Deno sont copiés dans les ressources de l’installateur. Le verrou `src-tauri/binaries/notices.lock.json` indique des URL de commits immuables et les SHA-256 ; `tools:fetch` les récupère et `tools:verify` les vérifie. Les dossiers de fournisseurs inactifs, dont BtbN, sont retirés pendant la synchronisation.

Le build FFmpeg reste Gyan 9.0.2 GPLv3. Revenir à un build LGPL ne supprimerait pas les obligations relatives aux sources et notices. Aucun remplacement de binaire n’est effectué ici.

Les références connues et les manques précis sont dans [STATUS.json](STATUS.json). Le commit FFmpeg et le tarball yt-dlp seuls ne couvrent pas toutes les dépendances de leurs exécutables autonomes. Une page générique d’un fournisseur ne prouve pas la disponibilité des sources exactes. Il reste à obtenir les versions, sources, correctifs et recettes correspondantes, puis à les archiver ou à fournir un accès approprié vérifié pour chaque composant concerné.

## Avant publication

1. Compléter les sources et notices listées dans STATUS.json, avec provenance et empreintes. Les sources propres AudioForge restent MIT ; les outils séparés gardent leurs licences.
2. Faire la revue de redistribution des composants réellement embarqués, y compris les dépendances npm, Cargo et Deno. Ne lever le blocage de STATUS.json qu’après résolution documentée de chaque point.
3. Exécuter `npm run release:check`, les tests et une nouvelle compilation Windows ; installer cette nouvelle version dans Sandbox et vérifier les notices installées.
4. Créer la GitHub Release `v0.1.0` depuis le commit validé, joindre l’installateur reconstruit, les sources correspondantes, notices et SHA256SUMS. Indiquer clairement son absence de signature si l’admission est encore en attente.
5. Télécharger les fichiers depuis la release publique et comparer leurs empreintes. Mettre à jour la page de téléchargement puis la candidature avec cette URL.

La publication de sources seules ne satisfait pas à elle seule l’exigence SignPath d’un logiciel déjà diffusé sous la forme à signer. Le blocage des binaires ne dépend pas de l’acceptation SignPath : une version non signée peut être publiée une fois les obligations de redistribution résolues.
