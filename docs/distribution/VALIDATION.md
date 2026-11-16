# Validation des corrections de distribution

Contrôles effectués le 16 novembre 2026 :

- 19 tests frontend réussis ; compilation TypeScript/Vite réussie.
- 16 tests des scripts réussis, dont installation des notices dans un dossier vierge, détection d’altération, refus de provenance non verrouillée et retrait des fournisseurs inactifs.
- SHA-256 des quatre exécutables actifs vérifiés. Aucun exécutable tiers remplacé.
- Quatre textes officiels verrouillés récupérés et vérifiés depuis le dépôt GitHub public : Unlicense yt-dlp, notices tierces yt-dlp, MIT Deno et GPLv3 FFmpeg. Le LICENSE précédemment extrait de l’archive Gyan reste également présent.
- Ancien LICENSE BtbN absent du dépôt public (HTTP 404).
- `release:check` échoue comme attendu et affiche les points non résolus de STATUS.json. Ce résultat ne constitue pas un échec des tests ; c’est le blocage de redistribution actuellement voulu.
- Un brouillon GitHub Release `v0.1.0` a été créé, avec zéro fichier joint. Il n’est pas public.

La [validation Windows du commit f9a8366](https://github.com/raphaelmounirpro-creator/Audio-Forge/actions/runs/43923745499) a été déclenchée ; elle était encore en cours lors de la rédaction de ce document. Les résultats natifs du précédent run ne valident pas l’installation des nouvelles notices. Aucune nouvelle installation Sandbox n’est déclarée réussie ici.

Les textes amont sont conservés octet pour octet, y compris leurs espaces et leurs adresses d’auteurs publiques. `.gitattributes` empêche la conversion des fins de ligne pour ces fichiers. L’exception du contrôle d’e-mail du manifeste s’applique seulement aux textes dont le SHA-256 correspond au verrou de notices ; la détection des jetons et clés privées reste active.

Restent nécessaires : [sources et notices manquantes](STATUS.json), nouvelle compilation, installation avec contrôle des ressources, puis publication et téléchargement de contrôle. Des [demandes de sources prêtes à transmettre](SOURCE-REQUESTS.md) sont disponibles ; aucun message n’a été envoyé.
