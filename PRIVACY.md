# Confidentialité d'AudioForge — projet de politique

Ce document décrit la version de développement et doit être relu avant publication d'une version signée.

## Données locales

Les préférences, la file et l'historique sont conservés dans une base SQLite locale. Les URL sources, titres et chemins peuvent y figurer. Les fichiers téléchargés sont enregistrés dans le dossier choisi. La base n'est pas chiffrée par AudioForge. Effacer une entrée d'historique ne supprime pas son fichier.

## Connexions

AudioForge n'intègre ni compte utilisateur, télémétrie ni service cloud AudioForge. L'analyse et le téléchargement établissent des connexions avec les plateformes et infrastructures de diffusion nécessaires au lien demandé. Ces services reçoivent notamment les informations réseau habituelles, dont l'adresse IP. Ne pas placer de liens confidentiels dans l'historique si ce stockage local ne convient pas.

yt-dlp, FFmpeg et Deno ne sont pas inclus dans l'installateur. Après un clic explicite sur « Télécharger et vérifier », AudioForge les récupère en HTTPS : yt-dlp et Deno depuis GitHub (github.com, puis ses serveurs de fichiers), FFmpeg depuis gyan.dev. Ces sites reçoivent les informations réseau habituelles, dont l'adresse IP ; aucune autre donnée n'est transmise. L'installateur peut télécharger le runtime Microsoft WebView2 s'il manque. Le comportement et les conditions des plateformes, distributeurs et du runtime Microsoft restent distincts de ceux du code AudioForge ; leurs notices doivent être finalisées dans l'inventaire tiers avant diffusion.

Les services de signature et d'intégration concernent la maintenance du projet. Ils ne sont pas nécessaires pour utiliser le logiciel une fois installé. Aucun jeton de signature ou secret de maintenance n'est distribué avec l'application.

## Version web

Les fichiers choisis sur le site sont lus et convertis dans le navigateur, puis gardés en mémoire jusqu'à la fermeture ou au rechargement de l'onglet. Ils ne sont transmis à aucun serveur. Le site ne pose pas de cookie et n'intègre ni compte, ni publicité, ni mesure d'audience.

L'hébergeur du site (Vercel) reçoit les informations réseau habituelles, dont l'adresse IP, lors du chargement des pages et du moteur de conversion. Ses journaux relèvent de sa propre politique de confidentialité. Un lien direct ajouté par l'utilisateur est lu depuis son site d'origine, qui reçoit les mêmes informations.

## Environnement isolé

Les données du disque jetable de Windows Sandbox sont supprimées à sa fermeture. Les fichiers copiés dans le dossier d'export partagé restent sur le PC hôte. Si l'utilisateur autorise le presse-papiers partagé, son contenu devient accessible aux applications de Sandbox.

## État de vérification

Les politiques des composants tiers et du runtime, les données des diagnostics et les limites de protection réseau doivent être revues avant toute distribution publique de l'installateur. Cette politique ne vaut pas attestation juridique ou audit complet de confidentialité.
