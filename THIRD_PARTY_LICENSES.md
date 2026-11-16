# Composants et licences — inventaire provisoire

**L'audit de redistribution des binaires est incomplet et aucune release publique n'a été faite.** Le code propre d'AudioForge est placé sous licence MIT, sur décision de son titulaire. Cela ne modifie pas les licences et obligations des composants tiers, notamment GPLv3 pour le build FFmpeg utilisé.

## Composants natifs récupérés

Versions et archives exactes : `src-tauri/binaries/sources.lock.json`. Empreintes des exécutables : `src-tauri/binaries/tool-lock.json`. FFmpeg utilise maintenant une URL nommée 9.0.2 et une empreinte publiée par le distributeur.

| Composant | Source retenue | État des obligations |
| --- | --- | --- |
| yt-dlp 2026.10.26, exécutable Windows autonome | [Release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26) | Le projet distingue le code source et les exécutables embarquant d'autres composants. Ne pas appliquer automatiquement l'Unlicense du code au binaire complet ; contrôler la section officielle [License](https://github.com/yt-dlp/yt-dlp#license), les dépendances et leurs sources avant distribution. Notices complètes encore à rassembler. |
| FFmpeg/ffprobe 9.0.2 Essentials Gyan | [Distributeur](https://www.gyan.dev/ffmpeg/builds/) référencé par [FFmpeg](https://www.ffmpeg.org/download.html) | Build **GPLv3**, annoncé ainsi par le distributeur et confirmé par ses options `--enable-gpl --enable-version3`. Le texte `LICENSE` est dans `src-tauri/binaries/licenses/GyanD-codexffmpeg/`. Sources correspondantes et notices tierces encore à archiver avant distribution publique. Les mentions du premier build BtbN conservées dans l'arbre ne décrivent plus le composant actif. |
| Deno v2.9.8 | [Release](https://github.com/denoland/deno/releases/tag/v2.9.8) | Licence du projet et notices de ses dépendances à conserver. [Licence source](https://github.com/denoland/deno/blob/v2.9.8/LICENSE.md). Inventaire du binaire complet encore à terminer. |

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
