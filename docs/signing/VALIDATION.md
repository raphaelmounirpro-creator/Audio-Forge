# Préparation SignPath — contrôle du 16 novembre 2026

## Réalisé localement

- Conditions et intégration consultées dans les sources officielles SignPath et Tauri.
- Sources complètes publiées sous licence MIT sur `main`, commit `0e06ecb81a12e7d262543fa8ebcbfce7fe549064`. Les installateurs, caches et données personnelles ne sont pas inclus.
- Sélection de publication préparée : 88 fichiers, 538 744 octets au premier contrôle ; aucune alerte dans les motifs de jetons, clés privées, chemins personnels et adresses personnelles recherchés. Ce contrôle ciblé ne vaut pas audit de secrets exhaustif.
- Inventaire Rust Windows x64 : 253 paquets tiers résolus, tous avec une licence déclarée. L'inventaire comprend compilation et tests ; il ne constitue pas une validation des obligations de redistribution. La licence du code propre AudioForge est désormais MIT.
- Les quatre actions GitHub référencées sont verrouillées sur les commits résolus de leurs versions officielles.
- **12 tests des scripts réussis**, dont vérification des signatures, garde-fous du workflow, conservation de la signature pendant le bundling, options Sandbox et sélection des composants.
- Les deux modèles XML sont bien formés ; leur validation par le serveur SignPath reste nécessaire.
- Le vérificateur Windows a été essayé sur l'installateur actuel : il le refuse comme non signé, comme attendu. Aucune signature n'a été créée ou simulée.

## Non réalisé

Le titulaire a ensuite choisi MIT et autorisé la publication des sources. La licence active a été ajoutée et les métadonnées mises à jour. Aucun compte SignPath créé, aucune acceptation des conditions du service, aucune candidature envoyée, aucun certificat obtenu et aucun workflow de signature exécuté.

Après ce choix, les 19 tests frontend, les 12 tests des scripts et le build Vite réussissent. Le workflow de validation sans signature est configuré pour ne publier aucun binaire téléchargeable.

## Validation GitHub réellement exécutée

[Exécution 43906288257](https://github.com/raphaelmounirpro-creator/Audio-Forge/actions/runs/43906288257), sur le commit de publication `0e06ecb81a12e7d262543fa8ebcbfce7fe549064` : **réussie**.

- Installation Node/Rust verrouillés, récupération et intégrité des composants : réussies.
- Tests frontend : 19 réussis.
- Tests des scripts : 12 réussis.
- Tests Rust : 14 réussis, aucun ignoré.
- Intégration Rust des cinq conversions : un test réussi.
- Essais FFmpeg/multiplexage/refus d'écrasement : réussis.
- Compilation release Tauri et génération NSIS : réussies ; le journal confirme un installateur généré.
- Les étapes SignPath et de téléversement d'artefacts sont ignorées pour ce run non signé. L'API GitHub confirme **zéro artefact exporté**.

Ce résultat prouve une construction GitHub hébergée à partir des sources publiques. Il ne vaut ni admission SignPath, ni vérification de signature, ni publication d'un installateur signé.

La validation locale ne prouve pas que la fondation acceptera le projet, ni que les modèles seront acceptés sans adaptation. La candidature indique honnêtement que le projet est récent, sans réputation externe démontrée.

## Étape suivante

Compléter les notices/sources tierces et le dossier de release ; renseigner les informations du responsable dans la candidature officielle. L'admission SignPath, les rôles/MFA, la connexion de l'application GitHub et la politique de production précèdent toute signature réelle. Aucune de ces étapes externes n'est simulée par le workflow.
