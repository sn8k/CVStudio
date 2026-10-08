# CVStudio

CVStudio est une application Next.js pour créer un CV interactif, le prévisualiser et publier une version figée. L’administration permet de gérer le profil, les expériences, les compétences, les projets, les liens, les thèmes, le formulaire de contact et les PDF. Les données sont stockées dans SQLite sur l’installation et ne sont pas incluses dans le dépôt.

Le code est disponible pour consultation avec [droits réservés](../LICENSE.md). Contactez le projet via GitHub pour une licence d’utilisation ou commerciale.

## Démarrage local

Prérequis : Node.js 24 LTS et npm 11 (ou versions compatibles).

```powershell
cd site
npm install
Copy-Item .env.example .env
npx auth secret
```

Inscrivez le secret généré dans `BETTER_AUTH_SECRET` de `.env`, puis choisissez `ADMIN_EMAIL` et `ADMIN_PASSWORD`. Ces valeurs restent locales. Initialisez et démarrez l’application :

```powershell
npm run db:init
npm run dev
```

Ouvrez <http://localhost:3000/> pour le site public, <http://localhost:3000/admin> pour l’administration et <http://localhost:3000/preview> pour l’aperçu privé. Une base neuve reçoit uniquement un profil de démonstration fictif. Modifiez ce contenu et vos coordonnées dans l’administration avant toute mise en ligne.

`npm run db:seed` crée le contenu de démonstration seulement si aucun profil n’existe déjà. Le compte administrateur est créé à partir des variables d’environnement lors du premier lancement ; son mot de passe se change ensuite dans l’administration. Une installation existante conserve son contenu et ses publications.

## Publication du contenu

Les modifications dans `/admin` sont des brouillons. Vérifiez-les dans l’aperçu, puis utilisez **Publier maintenant** pour créer un instantané public. L’export JSON administratif contient les données éditoriales ; les PDF doivent être sauvegardés séparément depuis `data/cv-files` ou le volume Docker.

## Configuration

`.env.example` prépare un environnement local avec SMTP de test et les clés de test Cloudflare Turnstile. Aucun message réel n’est envoyé en mode test. Pour la production, partez de `.env.production.example`, définissez les secrets propres à l’installation et consultez [DEPLOYMENT.md](DEPLOYMENT.md).

La page `/admin/settings` configure le contact, SMTP, Turnstile, la mesure d’audience et les thèmes. `SETTINGS_ENCRYPTION_KEY` doit être une clé aléatoire de 32 octets encodés en base64 pour chiffrer les secrets enregistrés en base. Une valeur enregistrée dans l’administration prime sur sa variable d’environnement.

La mise à jour se lance sur le serveur avec [`scripts/update-cvstudio.sh`](scripts/update-cvstudio.sh). Le script vérifie le dépôt Git avant de télécharger ; par défaut, il attend `https://github.com/sn8k/CVStudio.git`. Définissez `CVSTUDIO_GIT_REMOTE` pour votre propre dépôt. La branche attendue est `main`.

## Commandes utiles

```powershell
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:init
npm run db:seed
```

Les autres commandes de test sont décrites dans `package.json`. Certains tests navigateur nécessitent Microsoft Edge et une base de test isolée ; évitez de les lancer sur une installation contenant des données réelles.

## Structure

- `app/` : pages publiques, administration et API ;
- `components/` : interface du CV et composants d’administration ;
- `lib/` : données, authentification et services ;
- `prisma/` : schéma, migrations et contenu de démonstration ;
- `scripts/` : initialisation, tests et mise à jour ;

Les fichiers `.env`, bases SQLite, PDF, sauvegardes et notes locales sont exclus de Git. Le dossier `site/` est l’emplacement principal de l’application.
