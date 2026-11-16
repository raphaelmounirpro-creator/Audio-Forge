# AudioForge 0.1.0 — brouillon de release

Version de développement pour Windows 10/11 x64. Ce brouillon ne constitue pas une release publique et ne propose aucun téléchargement.

## Fonctions

- Interface française pour les liens de médias autorisés et la sélection des formats audio/vidéo.
- File d’attente avec annulation, nouvelle tentative et historique SQLite local.
- Sorties audio MP3, M4A, Opus, FLAC et WAV ; multiplexage vidéo avec FFmpeg.
- Aucun compte AudioForge, abonnement, publicité ou télémétrie.

## État et limites

Les tests frontend et scripts ainsi que la compilation web passent. Une précédente compilation native a été installée dans Windows Sandbox. Le nouvel installateur avec les notices corrigées n’a pas encore été reconstruit et testé. Les parcours réseau complets restent à valider.

La candidature SignPath Foundation est en cours d’examen ; aucun certificat ni signature n’a été obtenu. Une éventuelle version non signée peut être bloquée par Windows. Conserver les protections actives.

## Avant de rendre ce brouillon public

Résoudre [les blocages de redistribution](STATUS.json), reconstruire et installer le résultat dans Sandbox, puis joindre l’installateur, ses sources correspondantes et notices ainsi que SHA256SUMS. Vérifier les empreintes après téléchargement depuis GitHub. Le code propre AudioForge reste MIT ; les licences des outils tiers s’appliquent séparément.

[Code signing policy](https://github.com/raphaelmounirpro-creator/Audio-Forge/blob/main/CODE_SIGNING_POLICY.md) · [Confidentialité](https://github.com/raphaelmounirpro-creator/Audio-Forge/blob/main/PRIVACY.md) · [Licences tierces](https://github.com/raphaelmounirpro-creator/Audio-Forge/blob/main/THIRD_PARTY_LICENSES.md)
