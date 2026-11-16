# Préparer la signature d'AudioForge

## État réel

L'installateur 0.1.0 reste non signé. Aucun compte SignPath ou certificat n'est disponible dans cette session. Le titulaire a choisi MIT pour son code et autorisé la publication des sources et du workflow. Les obligations des binaires embarqués restent incomplètes. **La candidature n'est pas encore prête à être présentée comme admissible.**

Les modèles XML et le workflow sont publiés. Le build GitHub hébergé [43906288257](https://github.com/raphaelmounirpro-creator/Audio-Forge/actions/runs/43906288257) a réussi les tests, la compilation et l'assemblage NSIS, sans exporter de binaire. Les modèles ne sont pas encore validés par SignPath ; aucune signature n'a été obtenue.

## Décisions nécessaires

Le titulaire a choisi **MIT** pour le code propre d'AudioForge et autorisé la publication des sources. Cette décision ne change pas les obligations GPL et autres des composants embarqués. Le texte de licence actif est à la racine dans `LICENSE` ; les deux fichiers `.proposed.txt` conservent les textes étudiés et ne remplacent pas ce choix.

Les sources proposées pour publication sont préparées séparément sous `.local/signpath-candidate`. Les données de Sandbox, caches, journaux, installateurs, comptes et fichiers personnels n'en font pas partie. Le manifeste décrit la sélection exacte et la licence MIT est incluse.

## Chaîne proposée

1. Compiler sur un runner Windows hébergé GitHub à partir du dépôt public et de versions verrouillées.
2. Exécuter les tests puis construire `audioforge.exe` sans installer.
3. Sur demande manuelle, transmettre uniquement cet exécutable au projet SignPath accepté.
4. Vérifier la signature et l'horodatage, puis construire NSIS avec `--no-binary-patching` pour préserver la signature du programme.
5. Signer l'installateur dans une deuxième demande ; vérifier le résultat et son empreinte.
6. Examiner, installer et tester les fichiers signés avant une publication séparée.

Les exécutables tiers ne sont pas soumis individuellement avec le certificat AudioForge. Le run GitHub sans signature construit l'installateur sur le runner, sans exporter de binaire téléchargeable ni publier de release. Les téléversements d'artefacts sont conditionnés à la demande explicite de signature après admission.

## Configuration après admission

Créer et protéger l'environnement GitHub `signpath-production` : limiter les déploiements à `main`, configurer une revue humaine, et y conserver le secret `SIGNPATH_API_TOKEN`. Variables nécessaires : `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG`, `SIGNPATH_APP_CONFIGURATION`, `SIGNPATH_INSTALLER_CONFIGURATION`. `SIGNPATH_FOUNDATION_ACCEPTED=true` ne doit être défini qu'après acceptation effective.

Dans SignPath, lier le dépôt à un Trusted Build System GitHub hébergé, faire approuver les modèles XML, fixer les restrictions de produit/version et imposer l'approbation humaine des demandes de production. Les permissions de l'application GitHub SignPath et les conditions du service devront être examinées au moment de la connexion par le responsable.

## Limites connues

- La fondation reste libre d'accepter un projet récent ou de refuser sa candidature.
- Le bootstrapper WebView2 et les sources correspondantes des outils tiers nécessitent une revue avant distribution.
- Le workflow exige une licence active ; les modèles XML ne remplacent pas la configuration validée côté SignPath.
- Il faudra vérifier aussi la signature du programme réellement installé, pas seulement celle du setup ou de la copie en sortie du build.
- Les signatures des fichiers tiers et les règles Windows restent applicables séparément.

Sources consultées : [conditions](https://signpath.org/terms), [candidature](https://signpath.org/apply), [intégration GitHub](https://docs.signpath.io/trusted-build-systems/github), [signature Windows Tauri](https://v2.tauri.app/distribute/sign/windows/).
