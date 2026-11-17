# Validation des corrections de distribution

Contrôles effectués le 16 novembre 2026 :

- 19 tests frontend réussis ; compilation TypeScript/Vite réussie.
- 16 tests des scripts réussis, dont installation des notices dans un dossier vierge, détection d’altération, refus de provenance non verrouillée et retrait des fournisseurs inactifs.
- SHA-256 des quatre exécutables actifs vérifiés. Aucun exécutable tiers remplacé.
- Quatre textes officiels verrouillés récupérés et vérifiés depuis le dépôt GitHub public : Unlicense yt-dlp, notices tierces yt-dlp, MIT Deno et GPLv3 FFmpeg. Le LICENSE précédemment extrait de l’archive Gyan reste également présent.
- Ancien LICENSE BtbN absent du dépôt public (HTTP 404).
- `release:check` échoue comme attendu et affiche les points non résolus de STATUS.json. Ce résultat ne constitue pas un échec des tests ; c’est le blocage de redistribution actuellement voulu.
- Un brouillon GitHub Release `v0.1.0` a été créé, avec zéro fichier joint. Il n’est pas public.

Notices des dépendances d'AudioForge, générées ensuite le même jour :

- `npm run notices:deps` : 9 paquets npm, 190 crates liées et 7 compléments verrouillés. Chaque composant a au moins un texte de licence ; la génération échoue sinon.
- Compléments récupérés depuis des commits GitHub figés, le paquet NuGet officiel du SDK WebView2 1.0.3800.47 et la toolchain Rust 1.98.1. `WebView2LoaderStatic.lib` (x64) de la crate est identique octet pour octet à celui du SDK.
- 23 tests des scripts réussis, dont 7 nouveaux : sélection des crates liées, exclusion des dépendances de développement, refus d'une crate sans licence, sources de compléments immuables, détection de verrous modifiés et tolérance des fins de ligne CRLF.
- Contrôle de la sélection publiée : aucune alerte. L'exception d'adresse e-mail ne couvre ces notices que si leurs empreintes correspondent à l'inventaire et au verrou.
- Non fait : revue humaine du fichier généré, conditions du runtime C MSVC lié statiquement, installation de ces notices dans Sandbox.

Composants téléchargés à la demande (décision du titulaire, même jour) :

- L'installateur n'embarque plus yt-dlp, FFmpeg ni Deno : `tauri.conf.json` ne déclare plus que `notices/**/*`, et `release:check` refuse toute ressource ou sidecar qui réintroduirait un programme tiers.
- Nouveau module Rust `install.rs` : téléchargement après un clic, par `curl.exe` et `tar.exe` de Windows, vérification SHA-256 de l'archive puis de chaque fichier, installation dans le profil, progression et annulation. Les empreintes et sources sont compilées dans le programme.
- Vérifié sur l'hôte : 21 tests frontend, dont 2 nouveaux (aucun téléchargement sans clic, progression, annulation et échec affichés) ; 25 tests de scripts ; compilation TypeScript/Vite ; formatage Rust ; contrôle de la sélection publiée sans alerte.
- Chaîne réelle reproduite sur l'hôte avec les commandes exactes du programme. Les trois archives ont été téléchargées par `curl.exe` depuis GitHub et gyan.dev : tailles et SHA-256 identiques au verrou. `tar.exe -tf` liste un seul `ffmpeg.exe` et un seul `ffprobe.exe` ; `ffplay.exe` n'est pas extrait. Les quatre programmes extraits correspondent à `tool-lock.json`. `--max-filesize` refuse un fichier plus gros que prévu (code 63).
- **Compilation isolée réussie** (`build-2026-11-16T19-36-57-879Z`) : intégrité des composants, 21 tests frontend, 25 tests des scripts, 21 tests Rust (dont 7 nouveaux), test d'intégration des conversions, essais FFmpeg et installateur NSIS. Le test Rust du zip a réellement utilisé `tar.exe`. Le précédent essai avait échoué parce que l'instantané Sandbox n'incluait pas `.github`, que lit le test du workflow de signature ; `prepare-sandbox.mjs` le copie désormais.
- Nouvel installateur : 3 311 368 octets au lieu de 113 881 468, SHA-256 `b4903362d0d6d5c612e41d4b2fc16a6bc1988d86c766aadb9311e0fac22eefcb`.
- Installation dans Sandbox réussie : seuls `audioforge.exe` et `uninstall.exe` sont installés, les notices installées correspondent à l'inventaire, l'application démarre et crée sa base SQLite.
- `npm run sandbox:open` ne démarrait plus la machine isolée sans message ; le lancement a été fait avec `wsb start` puis `wsb connect`.

La [validation Windows du commit f9a8366](https://github.com/raphaelmounirpro-creator/Audio-Forge/actions/runs/43923745499) a **réussi** (terminée le 16 novembre 2026 à 18:07 UTC) : récupération et intégrité des composants, tests frontend, scripts, Rust et média, compilation de l’application puis assemblage NSIS. Les étapes de signature ont été ignorées et aucun installateur n’a été exporté. Ce run prouve la construction avec les nouvelles notices, pas leur installation. Aucune nouvelle installation Sandbox n’est déclarée réussie ici.

Les textes amont sont conservés octet pour octet, y compris leurs espaces et leurs adresses d’auteurs publiques. `.gitattributes` empêche la conversion des fins de ligne pour ces fichiers. L’exception du contrôle d’e-mail du manifeste s’applique seulement aux textes dont le SHA-256 correspond au verrou de notices ; la détection des jetons et clés privées reste active.

Restent nécessaires : [sources et notices manquantes](STATUS.json), nouvelle compilation, installation avec contrôle des ressources, puis publication et téléchargement de contrôle. Des [demandes de sources prêtes à transmettre](SOURCE-REQUESTS.md) sont disponibles ; aucun message n’a été envoyé.
