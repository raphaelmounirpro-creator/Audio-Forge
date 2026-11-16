# Préparation SignPath — contrôle du 16 novembre 2026

## Réalisé localement

- Conditions et intégration consultées dans les sources officielles SignPath et Tauri.
- Dépôt public relu : il contient uniquement le README, pas encore les sources de l'application.
- Sélection de publication préparée : 88 fichiers, 538 744 octets au premier contrôle ; aucune alerte dans les motifs de jetons, clés privées, chemins personnels et adresses personnelles recherchés. Ce contrôle ciblé ne vaut pas audit de secrets exhaustif.
- Inventaire Rust Windows x64 : 253 paquets tiers résolus, tous avec une licence déclarée. L'inventaire comprend compilation et tests ; il ne constitue pas une validation des obligations de redistribution. Le projet AudioForge lui-même n'a pas encore de licence déclarée.
- Les quatre actions GitHub référencées sont verrouillées sur les commits résolus de leurs versions officielles.
- **12 tests des scripts réussis**, dont vérification des signatures, garde-fous du workflow, conservation de la signature pendant le bundling, options Sandbox et sélection des composants.
- Les deux modèles XML sont bien formés ; leur validation par le serveur SignPath reste nécessaire.
- Le vérificateur Windows a été essayé sur l'installateur actuel : il le refuse comme non signé, comme attendu. Aucune signature n'a été créée ou simulée.

## Non réalisé

Le titulaire a ensuite choisi MIT et autorisé la publication des sources. La licence active a été ajoutée et les métadonnées mises à jour. Aucun compte SignPath créé, aucune acceptation des conditions du service, aucune candidature envoyée, aucun certificat obtenu et aucun workflow de signature exécuté.

Après ce choix, les 19 tests frontend, les 12 tests des scripts et le build Vite réussissent. Le workflow de validation sans signature est configuré pour ne publier aucun binaire téléchargeable.

La validation locale ne prouve pas que la fondation acceptera le projet, ni que les modèles seront acceptés sans adaptation. La candidature indique honnêtement que le projet est récent, sans réputation externe démontrée.

## Étape suivante

Après choix de licence et autorisation de publication : appliquer la licence choisie, actualiser les documents, publier les sources relues, exécuter la validation GitHub sans signature et compléter les notices/sources tierces. L'admission SignPath, les rôles/MFA, la connexion de l'application GitHub et la politique de production précèdent toute signature réelle.
