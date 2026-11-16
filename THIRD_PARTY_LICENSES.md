# Composants et licences — inventaire provisoire

**L'audit de redistribution des binaires est incomplet et aucune release publique n'a été faite.** Le code propre d'AudioForge est placé sous licence MIT, sur décision de son titulaire. Cela ne modifie pas les licences et obligations des composants tiers, notamment GPLv3 pour le build FFmpeg utilisé.

## Composants natifs récupérés

Versions et archives exactes : `src-tauri/binaries/sources.lock.json`. Empreintes des exécutables : `src-tauri/binaries/tool-lock.json`. FFmpeg utilise maintenant une URL nommée 9.0.2 et une empreinte publiée par le distributeur.

| Composant | Source retenue | État des obligations |
| --- | --- | --- |
| yt-dlp 2026.10.26, exécutable Windows autonome | [Release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26) | Le binaire autonome combiné relève de **GPLv3+**, selon la [documentation officielle](https://github.com/yt-dlp/yt-dlp/tree/2026.10.26#licensing). Les textes exacts `LICENSE` et `THIRD_PARTY_LICENSES.txt` sont inclus dans `licenses/yt-dlp-yt-dlp/`, avec commit et SHA-256 dans `notices.lock.json`. Sources exactes des dépendances et recette complète encore à inventorier. |
| FFmpeg/ffprobe 9.0.2 Essentials Gyan | [Distributeur](https://www.gyan.dev/ffmpeg/builds/) référencé par [FFmpeg](https://www.ffmpeg.org/download.html) | Build **GPLv3**, confirmé par `--enable-gpl --enable-version3`. Textes `LICENSE` et `COPYING.GPLv3` dans `licenses/GyanD-codexffmpeg/`. Commit moteur identifié : `946fcce07b`. Versions, sources et scripts des bibliothèques statiques encore à obtenir : le commit moteur seul est insuffisant. Les notices BtbN obsolètes ont été retirées. |
| Deno v2.9.8 | [Release](https://github.com/denoland/deno/releases/tag/v2.9.8) | Le texte MIT exact est inclus dans `licenses/denoland-deno/LICENSE.md`, avec commit et SHA-256 dans `notices.lock.json`. L’inventaire et les notices des dépendances du binaire complet restent à terminer. |

Les fichiers `SOURCE.txt` indiquent la provenance et l'empreinte des archives ; **ils ne remplacent ni les textes de licence ni les sources correspondantes exigibles**.

## Dépendances applicatives

`package-lock.json` et `src-tauri/Cargo.lock` verrouillent les versions transitives. L'inventaire final doit inclure les dépendances réellement embarquées, pas uniquement les bibliothèques ci-dessous.

- React / React DOM, Vite, TypeScript et Tailwind CSS : consulter les fichiers LICENSE des versions installées.
- Tauri, ses plugins et Rust : consulter les licences de chaque crate verrouillé.
- Lucide React : conserver sa licence et ses mentions.
- Inter : police distribuée localement par `@fontsource/inter`, conserver sa licence SIL Open Font License fournie par le paquet.
- SQLite et sa liaison Rust : distinguer la licence de SQLite de celle de rusqlite et de ses dépendances.
- fflate : utilitaire de préparation des archives, dépendance de développement.
- Vitest, Testing Library, Playwright, jsdom et Prettier : outils de développement, non requis chez l'utilisateur final.
- WebView2 : composant Microsoft soumis à ses propres conditions d'installation/redistribution ; le bootstrapper n'est pas assimilé à une bibliothèque sous licence open source du projet.

Avant distribution : produire l'inventaire détaillé, copier les notices exactes, relever la configuration FFmpeg, fournir ou proposer les sources lorsque nécessaire, puis fixer la licence du projet et vérifier l'installateur. Aucune dépendance payante n'est imposée.

## Blocage de publication

Voir [le dossier de release](docs/distribution/README.md) et [les points non résolus](docs/distribution/STATUS.json). `npm run release:check` échoue tant que ces points restent ouverts. La présence des textes de licence est vérifiée indépendamment de la disponibilité des sources correspondantes.
