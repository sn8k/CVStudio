# Changelog

Les changements significatifs de CVStudio sont documentés ici. Ce journal suit l'esprit de Keep a Changelog et décrit les versions de l'application, pas chaque commit Git.

## [0.5.0] — 2026-10-06

### Ajouté

- Envoi de plusieurs CV PDF depuis `/admin/cv`, sélection immédiate du PDF public et suppression des fichiers inutiles. Les PDF envoyés résident dans le volume Docker persistant.
- Mise à jour depuis GitHub dans `/admin/settings` pour les installations Docker Compose qui activent le service `updater` : vérification de `main`, récupération sans fusion et reconstruction de l’application.

### Infrastructure

- Migration additive `PdfResume` et sélection du PDF actif dans `SystemSettings` ; le PDF historique reste disponible en repli.
- Service de mise à jour interne protégé par jeton, avec accès au dépôt local et au moteur Docker uniquement dans le profil Compose `updates`.

## [0.4.0] — 2026-09-21

### Ajouté

- Aperçu administrateur temporaire d’un thème, sans modifier le mode, le thème par défaut ni les règles programmées.
- Centres d’intérêt enrichis avec description courte et image facultatives, gérées par le modèle `Media` existant.
- Carrousel public compact des centres d’intérêt avec commandes, clavier, glisser souris, défilement tactile et fallback sans image.
- Format de publication et sauvegarde JSON V6, avec import rétrocompatible des formats V2 à V5.

### Amélioré

- État visuel masqué des secrets SMTP et Turnstile configurés, sans jamais transmettre leur valeur au navigateur.
- Feedback du bouton de publication : état en cours, prévention des doubles clics, succès, erreur et date de dernière publication.
- Diagnostic SMTP serveur structuré et expurgé des secrets, tandis que le message public reste générique.
- Rendu d’impression des centres d’intérêt sous forme de liste compacte sans grandes images.

### Corrigé

- Synchronisation du mode de thème Manuel / Automatique et des sélecteurs avec l’état réellement persisté après sauvegarde.

## [0.3.0] — 2026-09-20

### Ajouté

- CV public interactif avec parcours structuré, compétences reliées aux expériences et projets, aperçu privé et publication explicite par instantanés.
- Administration du profil, des expériences, compétences, formations, projets, liens et contenus éditoriaux.
- Export et restauration JSON V5 de la version de travail, avec import des formats V2 à V4.
- Formulaire de contact SMTP protégé par validation serveur, honeypot, limitation de débit et Cloudflare Turnstile.
- Mesure d'audience locale avec pages vues, navigateurs distincts quotidiens sans identifiant, exclusion des robots, opposition individuelle et page de confidentialité.
- Configuration globale dans `/admin/settings` pour le contact, SMTP, Turnstile, l'audience et le mot de passe administrateur.
- Thèmes visuels configurables avec palette claire intégrée, couleurs ou dégradés personnalisés et validation minimale des contrastes.
- Sélection automatique en heure de Paris par plages horaires et périodes calendaires, événements annuels compris, avec mode manuel prioritaire.
- Version SemVer issue de `site/package.json`, affichée dans l’administration et documentée par ce changelog.

### Amélioré

- Carrousel de projets infini avec glisser à la souris, commandes clavier, pauses d'animation et respect de la réduction des mouvements.
- Détails de projets dans un dialogue accessible avec solution de repli sans JavaScript.
- Gestion des liens publics regroupée avec l'identité et les coordonnées dans l'administration.
- Résolution du thème côté serveur pour éviter le flash d’une palette intermédiaire, avec fallback systématique vers l’apparence historique.
- Mise en page responsive, styles d'impression A4 et téléchargement conditionnel du PDF fourni.

### Sécurité et infrastructure

- Authentification et changement de mot de passe gérés par Better Auth, avec révocation facultative des autres sessions.
- Chiffrement AES-256-GCM des mots de passe SMTP et secrets Turnstile persistés, à partir d'une clé maître externe.
- Migrations additives pour les pages vues quotidiennes, les navigateurs distincts quotidiens et les réglages système.
- Modèles dédiés `VisualTheme` et `ThemeSchedule`, séparés du contenu éditorial, des snapshots publiés et des exports V5.
- Image Docker standalone non-root, migrations Prisma au démarrage et healthcheck applicatif.
