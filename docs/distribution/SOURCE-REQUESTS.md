# Demandes de sources à transmettre aux fournisseurs

Ces messages sont des brouillons. Aucun message n’a été envoyé. Ils servent à obtenir les éléments manquants avant la distribution de l’installateur, sans prétendre que l’audit est terminé.

## Gyan — FFmpeg 9.0.2 Essentials

Canal officiel : [site du distributeur, rubrique notes/contact](https://www.gyan.dev/ffmpeg/builds/) ou [dépôt du distributeur](https://github.com/GyanD/codexffmpeg).

```text
Subject: Corresponding source for FFmpeg 9.0.2 Essentials Windows build

Hello,

We are preparing an open source Windows application, AudioForge, and would
like to redistribute your unmodified ffmpeg.exe and ffprobe.exe as separate
programs in its installer. Before doing so, we need to complete our source
and licence distribution materials.

Archive:
https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip
SHA-256:
60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba

We found the FFmpeg source reference 946fcce07b in your release page. Could
you provide the complete corresponding source for this exact build,
including the exact versions/commits and sources of statically linked
libraries, patches, build scripts and configuration, plus third-party
licence/copyright notices? A versioned source archive or immutable links
to the complete materials would help us verify and preserve them.

We have not published an installer containing these binaries. Our own
application code is MIT; third-party tools retain their respective licences.

Project: https://github.com/raphaelmounirpro-creator/Audio-Forge

Thank you.
```

## yt-dlp — exécutable autonome 2026.10.26

Le fichier officiel [THIRD_PARTY_LICENSES.txt de cette version](https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/THIRD_PARTY_LICENSES.txt) indique le contact des mainteneurs pour les sources tierces indisponibles. Le tarball du projet seul n’est pas présenté ici comme l’ensemble des sources du binaire autonome.

```text
Subject: Corresponding source inventory for yt-dlp.exe 2026.10.26

Hello,

We are preparing AudioForge, an open source Windows application, and would
like to redistribute your unmodified standalone yt-dlp.exe as a separate
program. We have not yet published an installer containing it.

Asset:
https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe
SHA-256:
f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d

We retained the release's LICENSE and THIRD_PARTY_LICENSES.txt and recognise
the GPLv3+ licensing of the combined PyInstaller executable. We also found
the source tarball and tagged workflows.

Could you point us to the exact dependency source inventory and build
materials for this Windows x64 asset, including Python, PyInstaller and
native/transitive bundled libraries, with versions, patches and relevant
source archives? We want to provide complete, verifiable corresponding
source access rather than merely linking to current project homepages.

Project: https://github.com/raphaelmounirpro-creator/Audio-Forge

Thank you.
```
