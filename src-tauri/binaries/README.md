# Composants natifs

Les exécutables ne sont jamais acceptés depuis PATH. `npm run tools:pin` verrouille les métadonnées des releases publiques choisies ; `npm run tools:fetch` télécharge, vérifie les archives puis extrait dans ce dossier ; `npm run tools:verify` vérifie les fichiers finaux. Chaque exécution native revérifie le SHA-256 indiqué dans `tool-lock.json`.

Ne pas publier les binaires sans les licences/notices et sources correspondantes exigées. Les exécutables sont exclus de Git ; le manifeste et les sources verrouillées permettent leur récupération reproductible.
