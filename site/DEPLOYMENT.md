# Déploiement Docker

Ce déploiement cible une instance unique de l’application avec SQLite sur un volume Docker persistant. Il ne nécessite aucun serveur applicatif externe.

## Première installation

1. Cloner le dépôt, entrer dans `site/`, puis créer le fichier de production :

   ```bash
   cp .env.production.example .env
   ```

2. Remplacer tous les placeholders. Générer notamment un secret aléatoire long, par exemple avec `openssl rand -base64 48`. Ne jamais versionner `.env`.

3. Utiliser le vrai domaine HTTPS pour `BETTER_AUTH_URL` et `PUBLIC_SITE_URL`, par exemple `https://cv.example.com`.

4. Construire et démarrer :

   ```bash
   docker compose up -d --build
   docker compose ps
   docker compose logs migrate
   curl --fail http://127.0.0.1:${APP_PORT:-3000}/api/health
   ```

Le service `migrate` exécute `prisma migrate deploy`, puis le bootstrap minimal. Sur une base vide, il crée le contenu initial, un premier snapshot et le compte administrateur. Sur une base déjà initialisée, il ne réinitialise pas le CV et ne modifie pas les snapshots.

`ADMIN_PASSWORD` sert uniquement lors de la création initiale du compte correspondant à `ADMIN_EMAIL`. Le modifier ensuite dans `.env` ne change pas le mot de passe stocké. `ADMIN_EMAIL` détermine aussi quel compte possède les droits d’administration ; une nouvelle adresse prive immédiatement l’ancienne de ces droits et peut créer un nouveau compte au prochain bootstrap. L’inscription publique est fermée.

5. Se connecter à `/admin`, ouvrir **Sauvegarde**, puis importer l’export JSON V6 produit par l’administration locale. L’import remplace uniquement la version de travail du CV : il ne remplace ni les comptes Better Auth, ni les sessions, ni le snapshot public. Les exports V2, V3, V4 et V5 restent également importables.

6. Vérifier `/preview`, puis utiliser **Publier le CV**. Le site public ne change qu’à cette publication globale.

La base de développement `prisma/dev.db` ne doit pas être copiée comme méthode de migration principale. Elle peut contenir des sessions et des artefacts propres au poste local.

## Variables requises

- `DATABASE_URL` : `file:/app/data/cv.db` dans Docker.
- `BETTER_AUTH_URL` : origine HTTPS publique exacte, sans chemin supplémentaire.
- `PUBLIC_SITE_URL` : origine publique utilisée par les metadata et URL absolues.
- `BETTER_AUTH_SECRET` : secret aléatoire long et stable entre les redémarrages.
- `ADMIN_EMAIL` : identifiant créé au premier bootstrap.
- `ADMIN_PASSWORD` : mot de passe initial unique, d’au moins 12 caractères.
- `SETTINGS_ENCRYPTION_KEY` : clé maître de 32 octets encodée en base64, utilisée uniquement pour chiffrer les secrets administrables.
- `APP_PORT` : port publié sur l’hôte.
- `APP_BIND` : adresse d’écoute publiée, `127.0.0.1` par défaut. Un proxy hors de l’hôte exige une adresse adaptée et un pare-feu.
- `AUDIENCE_MEASUREMENT_ENABLED` : interrupteur non secret, actif par défaut ; définir `false` pour couper pages vues et navigateurs quotidiens.

### Mesure d’audience locale

La page d’accueil enregistre uniquement des agrégats quotidiens dans `DailyPageView` : pages vues humaines et navigateurs distincts du jour. `POST /api/audience` ne reçoit aucun corps et ne renvoie aucune statistique. Les robots connus, `/admin`, `/preview`, `/api/health` et les autres pages ne sont pas comptabilisés.

Le cookie first-party `cv_audience_day=1` est booléen : il ne contient ni identifiant, ni date, ni adresse IP, ni empreinte. Il est `HttpOnly`, `SameSite=Lax`, limité à `/`, sécurisé en production et expire au prochain changement de jour en Europe/Paris. Un navigateur n’est donc dédupliqué que pendant la journée courante, jamais entre deux jours.

La page `/confidentialite` permet de s’opposer à la mesure. Le cookie `cv_audience_optout=1`, lui aussi sans identifiant, mémorise ce choix pendant 13 mois ; il bloque les deux compteurs et supprime le cookie journalier. La réactivation supprime les deux cookies pour repartir sans historique individuel.

Les lignes quotidiennes âgées de plus de 25 mois sont supprimées opportunément, au plus une fois par jour. Aucun secret ni service analytics tiers n’est nécessaire. Le déploiement doit appliquer la migration additive `20260920170000_daily_unique_visitors` avec `prisma migrate deploy` ; elle conserve les pages vues historiques et initialise leurs navigateurs quotidiens à zéro.

### Formulaire de contact SMTP et Turnstile

Le formulaire reste masqué tant que `CONTACT_FORM_ENABLED=true` et que ses configurations SMTP et Turnstile complètes ne sont pas valides. Renseigner sur le VPS, sans committer les valeurs réelles :

- `CONTACT_SMTP_HOST` et `CONTACT_SMTP_PORT` : serveur SMTP générique et port ;
- `CONTACT_SMTP_SECURE=true` pour une connexion TLS directe, habituellement sur le port 465 ;
- `CONTACT_SMTP_SECURE=false` pour une connexion qui négocie STARTTLS, habituellement sur le port 587 ;
- `CONTACT_SMTP_USER` et `CONTACT_SMTP_PASSWORD` : identifiants SMTP, à fournir ensemble lorsqu’une authentification est requise ;
- `CONTACT_FROM_EMAIL` : adresse fixe et autorisée par le domaine SMTP ;
- `CONTACT_FROM_NAME` : nom d’expéditeur visible ;
- `CONTACT_TO_EMAIL` : destinataire des messages ;
- `TURNSTILE_SITE_KEY` : clé publique du widget Cloudflare Turnstile ;
- `TURNSTILE_SECRET_KEY` : secret utilisé uniquement côté serveur pour Siteverify.

Dans Cloudflare, créer un widget Turnstile en mode **Managed**, autoriser votre domaine public, puis reporter ses deux clés réelles dans l’environnement du VPS. Ne jamais utiliser les clés officielles de test de `.env.example` en production et ne jamais committer le secret. L’application refuse explicitement ces clés de test en environnement de production.

L’adresse saisie par le visiteur est placée dans `Reply-To`, jamais dans `From`, afin de préserver l’alignement SPF/DKIM/DMARC. Les messages sont transmis par e-mail et ne sont pas enregistrés dans SQLite. Le serveur valide chaque jeton auprès de Siteverify avec un délai maximal, contrôle le hostname et l’action attendus, et n’envoie pas l’adresse IP du visiteur à cette API. Une vérification absente, refusée ou indisponible bloque l’envoi SMTP avec un message générique.

Après toute modification de ces variables, reconstruire/redémarrer le service pour recharger l’environnement :

```bash
docker compose up -d --build app
docker compose ps
```

Après redémarrage, vérifier sur le domaine public que le widget apparaît, qu’un envoi valide arrive à destination, qu’un échec de vérification n’envoie aucun e-mail et qu’aucun secret n’est exposé dans le HTML ou les réponses réseau.

### Configuration administrable

L’apparence publique est stockée dans `VisualTheme`, `ThemeSchedule` et les sélections non sensibles de `SystemSettings`. Elle ne nécessite aucune variable d’environnement. La migration additive `20260920223000_visual_themes` crée les deux thèmes intégrés sans activer de programmation ; le rendu reste donc historique après mise à jour tant qu’aucune règle n’est configurée dans `/admin/settings`.

Les règles sont évaluées côté serveur en `Europe/Paris`, indépendamment du navigateur. Elles ne sont incluses ni dans les snapshots éditoriaux ni dans l’export JSON V6. Une sauvegarde complète de l’instance doit donc continuer à inclure le volume SQLite en plus des exports de contenu.

Avant d’enregistrer un mot de passe SMTP ou un secret Turnstile depuis `/admin/settings`, définir une clé maître aléatoire sur le VPS :

```bash
openssl rand -base64 32
```

Reporter exactement le résultat dans `SETTINGS_ENCRYPTION_KEY`, puis reconstruire/redémarrer l’application pour charger la variable :

```bash
docker compose up -d --build app
docker compose ps
```

La page **Configuration** permet ensuite de gérer le formulaire de contact, SMTP, Turnstile et le toggle de mesure d’audience. Les valeurs enregistrées en base prennent le dessus sur les variables ENV ; les actions « Réinitialiser vers ENV » remettent les valeurs concernées à `null`, de sorte que la configuration du VPS redevienne immédiatement effective. `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `PUBLIC_SITE_URL`, `APP_BIND`, `APP_PORT`, `SETTINGS_ENCRYPTION_KEY` et `ADMIN_EMAIL` restent volontairement gérés hors de l’administration.

La rotation de `SETTINGS_ENCRYPTION_KEY` n’est pas automatisée. Changer cette clé rend les secrets déjà chiffrés illisibles ; il faut alors réenregistrer le mot de passe SMTP et le secret Turnstile avec la nouvelle clé. Conserver la clé stable et sauvegardée dans le gestionnaire de secrets du VPS. Sans clé valide, les fallbacks ENV continuent à fonctionner et aucun secret ne peut être persisté en clair.

`ADMIN_PASSWORD` reste un secret de bootstrap uniquement. Le changement du mot de passe d’un compte existant s’effectue dans `/admin/settings` et reste entièrement géré par Better Auth.

Par défaut, le port publié n’écoute que sur `127.0.0.1` pour un reverse proxy installé sur l’hôte. Si le proxy doit joindre le port depuis une autre machine, adapter `APP_BIND` et limiter l’accès par pare-feu. Un proxy dans le même réseau Docker peut joindre directement le service `app` sur le port `3000`.

## Reverse proxy HTTPS

Le proxy termine HTTPS et transmet vers le port HTTP interne `3000`. Il doit conserver `Host` et envoyer au minimum :

- `X-Forwarded-Proto: https` ;
- `X-Real-IP` avec l’adresse cliente, en remplaçant toute valeur reçue du navigateur ;
- `X-Forwarded-For` reconstruit ou contrôlé par le proxy ;
- le nom d’hôte public d’origine.

Les valeurs de `BETTER_AUTH_URL` et `PUBLIC_SITE_URL` doivent correspondre exactement à cette origine HTTPS. Better Auth utilise alors des cookies sécurisés et valide cette origine. L’application actuelle ne nécessite pas de WebSocket dédié.

L’application envoie HSTS et une politique CSP pour bloquer l’intégration en iframe, les objets, les changements de base d’URL et les formulaires vers d’autres origines. Le reverse proxy doit servir le site exclusivement en HTTPS pour que HSTS soit effectif.

Le rate limiting Better Auth protège les routes d’authentification en production, mais sa mémoire est locale au processus. Ajouter également une limitation de débit sur `/admin/login` et `/api/auth/*` au niveau du reverse proxy ou du CDN pour une protection durable contre la force brute.

Le formulaire limite en mémoire les envois réussis (3), les tentatives par client (10) et toutes les tentatives confondues (120) sur 15 minutes. `X-Real-IP` est la seule adresse utilisée pour la limite par client ; sans en-tête fourni par un proxy de confiance, les visiteurs partagent cette limite. Configurer en complément une limite au niveau du reverse proxy sur `POST /api/contact` afin de réduire le trafic abusif avant qu’il n’atteigne Node.js. Cette protection proxy reste nécessaire contre les volumes que le processus applicatif ne peut pas absorber seul.

## Vérifications

- `/api/health` retourne `200` uniquement si Next.js et SQLite répondent ; sa réponse ne contient aucune donnée sensible et n’est pas comptabilisée comme visite.
- `/confidentialite` décrit la mesure locale et permet de vérifier l’opposition puis sa réactivation depuis un navigateur de test.
- `/api/cv` sert le PDF sélectionné dans l’administration ; aucun PDF personnel n’est inclus dans l’image.
- `/admin`, `/preview`, l’export et l’import exigent une session administrateur.
- Les données SQLite résident dans `/app/data/cv.db`, sur le volume `cv_data`. Ne jamais utiliser `docker compose down -v` en production.

## Mise à jour

1. Vérifier que la version de `package.json` et son entrée dans `../CHANGELOG.md` correspondent à la release attendue. Cette version applicative est indépendante des publications de contenu enregistrées dans `PublishedSnapshot`.
2. Exporter une sauvegarde JSON V6 depuis l’administration et sauvegarder le volume `cv_data` avec la méthode cohérente de l’hébergeur. Ce volume contient SQLite et les PDF envoyés depuis `/admin/cv`. La migration additive `20261006120000_pdf_resumes` conserve les données existantes et ajoute le choix du PDF actif.
3. Mettre à jour puis reconstruire :

   ```bash
   git pull --ff-only
   docker compose up -d --build
   docker compose ps
   curl --fail http://127.0.0.1:${APP_PORT:-3000}/api/health
   ```

Le service `migrate` réapplique uniquement les migrations manquantes. Le bootstrap est idempotent tant que le profil principal et le compte administrateur existent.

Après redémarrage, la version déployée peut être contrôlée dans l’état système de `/admin/settings`. Elle provient de `package.json` au moment du build et ne dépend d’aucune variable d’environnement ni donnée SQLite.

### Script manuel sur le VPS

Le script versionné [`scripts/update-cvstudio.sh`](scripts/update-cvstudio.sh) remplace l’ancien bloc `cat <<'SCRIPT'` à coller dans un terminal. Il est enregistré avec des fins de ligne Unix. Après avoir récupéré une première fois le commit qui le contient, l’installer puis le lancer en root depuis le VPS :

```bash
cd /opt/cv/site
sudo install -m 700 scripts/update-cvstudio.sh /usr/local/sbin/update-cvstudio.sh
sudo /usr/local/sbin/update-cvstudio.sh
```

Le script se détache de la session et écrit son journal dans `/var/log/cvstudio/` ; la commande affiche le chemin à suivre avec `tail -f`. `--foreground` le garde dans le terminal et `--force` reconstruit le commit déjà présent. Le dépôt est attendu dans `/opt/cv` ; définir `CVSTUDIO_REPO` pour un autre emplacement. Avant de modifier Git ou la base, il arrête brièvement `app`, archive le volume complet `cv_data` (SQLite **et** PDF) avec une copie de `.env` dans `/opt/cv/backups/predeploy-*`, puis redémarre `app`. Le répertoire de sauvegarde n’est pas versionné et ses fichiers sont réservés à root. Le script refuse les modifications suivies localement et les historiques divergents.

Lors d’une modification ultérieure du script lui-même, réexécuter la commande `install` après la mise à jour du dépôt pour remplacer la copie dans `/usr/local/sbin`.

Les mises à jour sont lancées depuis le serveur avec le script manuel ci-dessus. Les installations qui avaient activé le profil Compose `updates` doivent repérer l’ancien conteneur avec `docker ps --filter label=com.docker.compose.service=updater`, puis l’arrêter et le supprimer avec `docker rm -f <ID_DU_CONTENEUR>`. Cette opération ne touche pas au volume `cv_data`.

## Sauvegardes et restauration

L’export JSON administratif est la sauvegarde portable recommandée pour le contenu éditorial du CV. Il conserve notamment profil, parcours, relations de compétences, projets, liens de projets, permis, textes éditoriaux, ordres, statuts et notes privées. Les PDF envoyés et leur sélection ne sont pas inclus dans ce JSON.

Compléter cet export par une sauvegarde régulière du volume `cv_data`. Ne pas copier naïvement `cv.db` pendant une écriture. Utiliser soit un snapshot cohérent fourni par l’hôte, soit arrêter brièvement l’application avant la copie, soit employer l’API de sauvegarde en ligne de SQLite avec un outil adapté.

## Rollback

Conserver l’export JSON et une sauvegarde cohérente du volume avant chaque mise à jour. Pour revenir en arrière, redéployer le commit ou l’image précédente. Les migrations Prisma sont appliquées vers l’avant : une ancienne image peut être incompatible avec une base déjà migrée. Dans ce cas, restaurer ensemble l’image et la sauvegarde de base prises avant la migration.
