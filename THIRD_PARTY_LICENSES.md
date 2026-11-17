# Composants et licences — inventaire provisoire

**Aucune release publique n'a été faite.** Le code propre d'AudioForge est placé sous licence MIT, sur décision de son titulaire. Cela ne modifie pas les licences des composants tiers.

## Composants téléchargés à la demande (non redistribués)

L'installateur ne contient ni yt-dlp, ni FFmpeg/ffprobe, ni Deno, et `npm run release:check` refuse toute configuration qui les y ajouterait. À la demande de l'utilisateur, l'application les télécharge depuis leurs distributeurs officiels, puis vérifie les SHA-256 compilés dans le programme (`src-tauri/binaries/sources.lock.json` et `tool-lock.json`). Les obligations de redistribution de ces programmes (notices, sources correspondantes) incombent à ces distributeurs et ne s'appliquent pas à l'installateur d'AudioForge. Ce schéma reste à confirmer par un avis juridique si nécessaire.

| Composant | Distributeur | Licence |
| --- | --- | --- |
| yt-dlp 2026.10.26, exécutable Windows autonome | [GitHub yt-dlp](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26) | **GPLv3+** pour le binaire autonome, selon la [documentation officielle](https://github.com/yt-dlp/yt-dlp/tree/2026.10.26#licensing) |
| FFmpeg/ffprobe 9.0.2 Essentials | [gyan.dev](https://www.gyan.dev/ffmpeg/builds/), référencé par [FFmpeg](https://www.ffmpeg.org/download.html) | **GPLv3** (`--enable-gpl --enable-version3`) |
| Deno v2.9.8 | [GitHub Deno](https://github.com/denoland/deno/releases/tag/v2.9.8) | MIT pour Deno ; dépendances sous leurs propres licences |

Les textes de licence amont restent conservés dans `src-tauri/binaries/licenses/` pour référence, verrouillés par `notices.lock.json`. Ils ne sont plus copiés dans l'installateur.

## Version web (site)

Le site distribue, sans modification, les paquets npm suivants. Ils ne font pas partie de l'application de bureau : ils sont déclarés en `devDependencies` et absents du build `npm run build`.

| Paquet | Version | Licence | Rôle |
| --- | --- | --- | --- |
| @ffmpeg/core | 0.12.10 | **GPL-2.0-or-later** | FFmpeg compilé en WebAssembly, avec LAME, x264, x265, libvpx, Opus, Vorbis et d'autres bibliothèques |
| @ffmpeg/ffmpeg | 0.12.15 | MIT | Pilotage du moteur dans un worker |
| @ffmpeg/util | 0.12.2 | MIT | Utilitaires |

Le site renvoie au [code source de ffmpeg.wasm 0.12.10](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10), qui fixe les versions de FFmpeg et des bibliothèques compilées. **À confirmer :** la GPL demande que le distributeur fournisse lui-même la source correspondante. Le plus sûr est de publier sur le site, ou dans une release GitHub, une archive des sources de ffmpeg.wasm 0.12.10 et de ses sous-modules, avec le texte de la GPL.

## Dépendances applicatives

`npm run notices:deps` génère [src-tauri/notices/THIRD_PARTY_NOTICES.txt](src-tauri/notices/THIRD_PARTY_NOTICES.txt), installé avec l'application. Ce fichier reproduit les licences des composants compilés dans `audioforge.exe` ou intégrés à son interface. L'[inventaire](src-tauri/notices/inventory.json) indique pour chacun la version, la licence déclarée et l'empreinte de chaque texte. `npm run release:check` refuse des notices qui ne correspondent plus à `package-lock.json`, `src-tauri/Cargo.lock` ou aux compléments verrouillés.

- **Interface :** 7 paquets npm de production (React, React DOM, scheduler, Lucide React, police Inter sous SIL OFL 1.1, API et plugin de dialogue Tauri). S'y ajoutent Vite et Tailwind CSS, dont le code se retrouve dans le bundle.
- **Programme :** 190 crates liées pour `x86_64-pc-windows-msvc`, dont SQLite intégré par rusqlite. Les dépendances de test et de compilation et les macros procédurales ne sont pas intégrées au programme : elles sont exclues. Les sources exactes des quatre crates MPL-2.0 (cssparser, selectors, dtoa-short, option-ext) sont disponibles sur crates.io à l'adresse indiquée.
- **Compléments verrouillés** dans [supplements.lock.json](src-tauri/notices/supplements.lock.json) : textes amont absents de quatre paquets crates.io ; licence et notices du SDK Microsoft WebView2 1.0.3800.47, dont le chargeur statique est lié au programme (bibliothèque vérifiée identique à celle du SDK) ; notices de la bibliothèque standard Rust 1.98.1.
- **Runtime C MSVC :** lié statiquement (réglage par défaut de Tauri). Ses conditions de redistribution relèvent de la licence Microsoft des outils de compilation et restent à confirmer.
- **WebView2 :** le runtime Microsoft n'est pas intégré. L'installateur télécharge son programme d'amorçage si nécessaire, selon les conditions Microsoft.

Les outils de développement et de test (Vitest, Testing Library, Playwright, jsdom, Prettier, TypeScript, fflate) ne sont pas distribués. Aucune dépendance payante n'est imposée.

## Blocage de publication

Voir [le dossier de release](docs/distribution/README.md) et [les points non résolus](docs/distribution/STATUS.json). `npm run release:check` échoue tant que ces points restent ouverts. La présence des textes de licence est vérifiée indépendamment de la disponibilité des sources correspondantes.
