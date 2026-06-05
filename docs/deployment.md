# Guide de déploiement — Jorg

## Variables d'environnement obligatoires

| Variable       | Description                                       |
| -------------- | ------------------------------------------------- |
| `DATABASE_URL` | URL PostgreSQL async (`postgresql+asyncpg://...`) |
| `SECRET_KEY`   | Clé aléatoire ≥ 32 caractères                     |
| `ENV`          | `production` pour activer les cookies secure      |
| `FRONTEND_URL` | URL publique du frontend                          |
| `CORS_ORIGINS` | JSON array des origines autorisées                |

## Stockage fichiers (documents générés)

### Local (dev uniquement)

```
STORAGE_BACKEND=local
```

Les fichiers sont sauvegardés dans `backend/uploads/`. **Éphémère sur les PaaS.**

### S3 / Cloudflare R2 (production)

1. Créer un bucket R2 sur [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. Créer une API token R2 avec permission "Object Read & Write"
3. Configurer :

```
STORAGE_BACKEND=s3
S3_BUCKET_NAME=<nom-du-bucket>
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<clé>
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=auto
```

## Conversion PDF (Gotenberg)

Gotenberg tourne en sidecar Docker sur le port 3000 :

```
GOTENBERG_URL=http://gotenberg:3000
```

Sans cette variable, seule la génération DOCX est disponible.

## Déploiement avec docker-compose

```bash
cp .env.example .env
# Remplir .env

docker-compose up -d
docker-compose exec api alembic upgrade head
```

## Maintenance manuelle des langues

Après un deploy qui contient la table `language_references`, lancer d'abord le
seed et le dry-run de nettoyage :

```bash
python scripts/manage_language_references.py
```

Si le rapport confirme des lignes ESCO de langues non référencées dans
`skill_references`, appliquer le nettoyage :

```bash
python scripts/manage_language_references.py --apply-prune
```

L'import des langues ESCO complètes est optionnel et demande un CSV disponible
dans l'environnement :

```bash
python scripts/manage_language_references.py --esco-csv data/esco/skills_fr.csv
```

## Checklist avant mise en ligne

- [ ] `SECRET_KEY` est aléatoire et ≥ 32 caractères
- [ ] `ENV=production`
- [ ] `DATABASE_URL` pointe vers la vraie DB PostgreSQL
- [ ] `STORAGE_BACKEND=s3` + credentials R2 configurés
- [ ] `FRONTEND_URL` et `CORS_ORIGINS` pointent vers le domaine de production
- [ ] OAuth Google/LinkedIn : redirect URIs mises à jour dans les consoles développeur
