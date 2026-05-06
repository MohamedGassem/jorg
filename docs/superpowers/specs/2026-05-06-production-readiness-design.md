# Design : Production Readiness — Jorg Demo

**Date :** 2026-05-06
**Contexte :** Le projet est en développement local et doit être mis en ligne pour une démo avec de vraies données (CVs candidats réels). Déploiement sur une VM unique (Render / Railway / Fly.io). Objectif : corriger les blocages au déploiement et sécuriser les données avant la mise en ligne.

---

## Périmètre

Six améliorations ciblées, estimées à ~3 jours de travail :

| #   | Sujet                                | Effort    |
| --- | ------------------------------------ | --------- |
| 1   | Stockage fichiers → S3/Cloudflare R2 | ~1 jour   |
| 2   | Génération PDF → Gotenberg           | ~0.5 jour |
| 3   | Secrets management + `.env.example`  | ~2h       |
| 4   | Rate limiting (slowapi)              | ~1h       |
| 5   | OAuth state → base de données        | ~0.5 jour |
| 6   | Seuil de couverture calibré          | ~1h       |

---

## 1. Stockage fichiers — S3/Cloudflare R2

### Problème

`backend/core/storage.py` sauvegarde les fichiers dans `backend/uploads/` (filesystem local). Sur les PaaS (Render, Railway, Fly.io), ce dossier est éphémère : il se vide à chaque redéploiement. Les CVs générés seraient perdus.

### Design

Créer une interface abstraite `StorageBackend` avec deux implémentations, en suivant le pattern déjà utilisé pour les emails (`EmailBackend`).

**Interface :**

```python
class StorageBackend(Protocol):
    async def save(self, file_bytes: bytes, filename: str) -> str: ...  # retourne la clé
    async def delete(self, key: str) -> None: ...
    async def get_url(self, key: str, expires_in: int = 3600) -> str: ...
```

**Implémentations :**

- `LocalStorageBackend` — conserve le comportement actuel (dev local, tests)
- `S3StorageBackend` — utilise `boto3` + Cloudflare R2 (compatible API S3)

**Configuration :**

```
STORAGE_BACKEND=local|s3
S3_BUCKET_NAME=...
S3_ENDPOINT_URL=...         # https://xxx.r2.cloudflarestorage.com pour R2
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_REGION=auto              # R2 utilise "auto"
```

**URLs des fichiers :** Signed URLs avec expiration (3600s par défaut) — les fichiers restent privés, jamais exposés publiquement.

**Impact sur le code existant :** `generation_service.py` continue d'appeler `save_upload()` / `delete_file()` sans changement. Seul `storage.py` est refactorisé.

**Choix Cloudflare R2 :** Compatible S3 API, pas de frais de sortie (egress), gratuit jusqu'à 10 GB de stockage — idéal pour une démo.

---

## 2. Génération PDF — Gotenberg

### Problème

`generation_service.py` appelle LibreOffice en subprocess headless. LibreOffice n'est pas disponible sur les PaaS standard sans Docker custom. L'échec de conversion est actuellement non-fatal et silencieux.

### Design

Remplacer l'appel LibreOffice par [Gotenberg](https://gotenberg.dev) v8 — microservice Docker dédié à la conversion de documents, appelé via HTTP.

**Flux :**

```
FastAPI → POST /forms/libreoffice/convert (multipart) → Gotenberg → PDF bytes
```

**Configuration :**

```
GOTENBERG_URL=http://localhost:3000   # vide = conversion PDF désactivée
```

**Comportement :**

- Si `GOTENBERG_URL` est vide : génération DOCX uniquement (inchangé)
- Si `GOTENBERG_URL` est défini et la conversion échoue : erreur remontée proprement (plus de silencieux)

**Dépendance Python :** Aucune nouvelle — `httpx` est déjà dans le projet.

**docker-compose.yml** (à créer pour le déploiement) :

```yaml
services:
  api:
    build: ./backend
    environment:
      - GOTENBERG_URL=http://gotenberg:3000
  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
```

---

## 3. Secrets management

### Problème

Risque de commit accidentel de secrets, et absence de validation stricte au démarrage.

### Design

**Validations au démarrage** — Ajouter un `@field_validator` sur `secret_key` dans `backend/core/config.py` :

```python
@field_validator("secret_key")
@classmethod
def validate_secret_key(cls, v: str) -> str:
    if len(v) < 32:
        raise ValueError("SECRET_KEY must be at least 32 characters")
    return v
```

**`.env.example`** — Créer à la racine du projet avec toutes les clés et des valeurs fictives :

```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/jorg
SECRET_KEY=change-me-to-a-random-string-of-at-least-32-chars
STORAGE_BACKEND=local
GOTENBERG_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
...
```

**Vérification `.gitignore`** — Confirmer que `.env` est bien ignoré (déjà le cas, à vérifier).

**`docs/deployment.md`** — Documenter les variables obligatoires et leur format pour le PaaS cible.

---

## 4. Rate limiting

### Problème

Aucune protection contre les abus sur les routes sensibles (brute force auth, génération massive de documents).

### Design

Ajouter `slowapi` (wrapper FastAPI de `limits`).

**Setup dans `main.py` :**

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

**Limites appliquées :**

| Route                       | Limite           |
| --------------------------- | ---------------- |
| `POST /auth/login`          | 10/minute par IP |
| `POST /auth/register`       | 5/minute par IP  |
| `POST /auth/password-reset` | 5/minute par IP  |
| `POST /generation/generate` | 5/minute par IP  |

Les autres routes restent sans limite.

**Storage :** En mémoire (défaut slowapi) — suffisant pour une VM single-process.

**Nouvelle dépendance :** `slowapi>=0.1.9`

---

## 5. OAuth state → base de données

### Problème

`backend/routers/auth.py` stocke les états CSRF OAuth dans `_oauth_states: dict[str, str]` en mémoire. Un redémarrage du processus pendant un flow OAuth en cours invalide le state et bloque l'utilisateur.

### Design

**Nouvelle table `oauth_states` :**

```sql
CREATE TABLE oauth_states (
    state       VARCHAR PRIMARY KEY,   -- UUID généré
    provider    VARCHAR NOT NULL,
    created_at  TIMESTAMP NOT NULL,
    expires_at  TIMESTAMP NOT NULL     -- created_at + 10 minutes
);
```

**Nouveau fichier `backend/services/oauth_state_service.py` :**

- `create_state(db, provider) → str` — insère et retourne le state UUID
- `consume_state(db, state) → str | None` — lit + supprime en une transaction atomique, retourne le provider ou None si inexistant/expiré

**Nettoyage des states expirés :** Au moment du `consume_state`, une requête `DELETE WHERE expires_at < now()` est exécutée pour éviter l'accumulation. Pas de job séparé nécessaire.

**Migration Alembic :** Nouvelle migration `create_oauth_states_table`.

**Impact sur `auth.py` :** Remplacer les deux appels au dict (`_oauth_states[state] = provider` et `_oauth_states.pop(state)`) par les deux fonctions du service. Le test override existant reste compatible.

---

## 6. Seuil de couverture

### Problème

Le seuil actuel `--cov-fail-under=20` dans `pyproject.toml` ne détecte aucune régression : on peut supprimer des tests sans que la CI échoue.

### Design

1. **Mesurer** — Lancer `pytest --cov=backend --cov-report=term-missing` pour obtenir la couverture réelle.
2. **Fixer le seuil à couverture_réelle - 5%** — Laisse de la marge pour les nouvelles fonctionnalités.
3. **Exclure les fichiers légitimement non-testés** dans `pyproject.toml` :

```toml
[tool.coverage.run]
omit = [
    "backend/alembic/*",
    "backend/core/config.py",
    "backend/main.py",
]
```

Pas de nouveaux tests à écrire dans cette itération.

---

## Ordre d'implémentation recommandé

1. Secrets + `.env.example` — rapide, débloque la config pour la suite
2. OAuth state → DB — migration simple, élimine un risque avant tout le reste
3. Rate limiting — quasi-gratuit, une heure max
4. Stockage S3/R2 — le plus critique pour les données, à faire avant tout test avec vraies données
5. Gotenberg PDF — optionnel si la démo n'exige pas de PDF
6. Seuil de couverture — en dernier, après avoir validé que les tests passent avec les changements

---

## Ce qui est hors périmètre

Les éléments suivants sont identifiés mais non traités dans cette itération :

- Queue de tâches async (ARQ/Celery) pour la génération de documents
- OpenTelemetry / distributed tracing
- Refactoring `CandidateQueryBuilder`
- Frontend state management
- Tests de charge / performance testing
