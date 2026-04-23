# C1 — Disponibilité & préférences mission

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un candidat de déclarer sa disponibilité, son mode de travail, sa localisation préférée, ses domaines métier et la durée de mission souhaitée — avec exposition dans les templates recruteur.

**Architecture:** 6 nouvelles colonnes sur `candidate_profiles` (3 enums Postgres + date + varchar + array). Migration Alembic autogénérée. Schémas Pydantic mis à jour. Formulaire candidat étendu. 4 nouveaux champs dans `PROFILE_FIELDS` recruteur.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, Next.js 15 + shadcn/ui, pytest + testcontainers.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section C1)

**Prérequis:** Plans 1–6 + P0/P1/P2 + G1+G2 mergés sur `master`. Toutes les commandes backend depuis `backend/`.

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/models/candidate_profile.py` | MODIFY | Ajouter enums + colonnes |
| `backend/alembic/versions/XXXX_add_availability_fields.py` | CREATE | Migration Alembic (autogénérée) |
| `backend/schemas/candidate.py` | MODIFY | Étendre CandidateProfileRead + Update |
| `backend/services/candidate_service.py` | MODIFY | Validation availability_date |
| `backend/tests/integration/test_candidate_api.py` | MODIFY | Tester les nouveaux champs |
| `frontend/app/(candidate)/candidate/profile/page.tsx` | MODIFY | Section disponibilité & préférences |
| `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx` | MODIFY | 4 nouveaux champs dans PROFILE_FIELDS |
| `frontend/types/api.ts` | MODIFY | Ajouter les champs au type CandidateProfile |

---

### Task 1 : Modèle DB — enums et colonnes

**Files:**
- Modify: `backend/models/candidate_profile.py`

- [ ] **Step 1 : Ajouter les enums dans `candidate_profile.py`**

Ouvrir `backend/models/candidate_profile.py`. Après la classe `ContractType` existante (ligne ~37), ajouter :

```python
class AvailabilityStatus(StrEnum):
    AVAILABLE_NOW = "available_now"
    AVAILABLE_FROM = "available_from"
    NOT_AVAILABLE = "not_available"


class WorkMode(StrEnum):
    REMOTE = "remote"
    ONSITE = "onsite"
    HYBRID = "hybrid"


class MissionDuration(StrEnum):
    SHORT = "short"      # < 3 mois
    MEDIUM = "medium"    # 3–6 mois
    LONG = "long"        # 6 mois+
    PERMANENT = "permanent"
```

- [ ] **Step 2 : Ajouter les imports nécessaires**

En tête du fichier, s'assurer que `ARRAY` et `Text` sont importés depuis `sqlalchemy` :

```python
from sqlalchemy import (
    ARRAY, JSON, Boolean, CheckConstraint, Date, Enum, ForeignKey,
    Integer, String, Text,
)
```

- [ ] **Step 3 : Ajouter les colonnes sur `CandidateProfile`**

Dans la classe `CandidateProfile`, après `extra_fields`, ajouter :

```python
availability_status: Mapped[AvailabilityStatus] = mapped_column(
    Enum(AvailabilityStatus, name="availability_status"),
    default=AvailabilityStatus.NOT_AVAILABLE,
    nullable=False,
)
availability_date: Mapped[date | None] = mapped_column(Date, nullable=True)
work_mode: Mapped[WorkMode | None] = mapped_column(
    Enum(WorkMode, name="work_mode"), nullable=True
)
location_preference: Mapped[str | None] = mapped_column(String(200), nullable=True)
preferred_domains: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), nullable=True)
mission_duration: Mapped[MissionDuration | None] = mapped_column(
    Enum(MissionDuration, name="mission_duration"), nullable=True
)
```

- [ ] **Step 4 : Exporter les nouveaux enums dans `models/__init__.py`**

Ouvrir `backend/models/__init__.py`. Ajouter les nouveaux enums à l'import de `candidate_profile` :

```python
from models.candidate_profile import (
    AvailabilityStatus,
    CandidateProfile,
    Certification,
    ContractType,
    Education,
    Experience,
    Language,
    LanguageLevel,
    MissionDuration,
    Skill,
    SkillCategory,
    WorkMode,
)
```

Et dans `__all__` :

```python
"AvailabilityStatus",
"MissionDuration",
"WorkMode",
```

- [ ] **Step 5 : Commit**

```bash
git add backend/models/candidate_profile.py backend/models/__init__.py
git commit -m "feat(c1): add availability/preference enums and columns to CandidateProfile model"
```

---

### Task 2 : Migration Alembic

**Files:**
- Create: `backend/alembic/versions/XXXX_add_availability_fields.py`

- [ ] **Step 1 : Générer la migration**

```bash
uv run alembic revision --autogenerate -m "add_availability_fields_to_candidate_profiles"
```

Résultat attendu : un nouveau fichier dans `alembic/versions/` contenant les `op.add_column` et `op.create_enum` pour les 6 nouvelles colonnes.

- [ ] **Step 2 : Vérifier le contenu de la migration générée**

Ouvrir le fichier généré. Vérifier qu'il contient :
- `sa.Enum('available_now','available_from','not_available', name='availability_status')`
- `sa.Enum('remote','onsite','hybrid', name='work_mode')`
- `sa.Enum('short','medium','long','permanent', name='mission_duration')`
- `sa.Column('availability_date', sa.Date(), nullable=True)`
- `sa.Column('location_preference', sa.String(200), nullable=True)`
- `sa.Column('preferred_domains', sa.ARRAY(sa.String(50)), nullable=True)`
- Le `down_revision` doit pointer sur `8ac7cd2e1874` (la dernière migration RGPD).

Si l'autogénération a ajouté des choses incorrectes, les corriger manuellement.

- [ ] **Step 3 : Appliquer la migration sur la DB de dev**

```bash
uv run alembic upgrade head
```

Résultat attendu : `Running upgrade 8ac7cd2e1874 -> XXXX, add_availability_fields_to_candidate_profiles`

- [ ] **Step 4 : Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat(c1): alembic migration — add availability fields to candidate_profiles"
```

---

### Task 3 : Schémas Pydantic

**Files:**
- Modify: `backend/schemas/candidate.py`

- [ ] **Step 1 : Écrire un test de validation qui échoue**

Ouvrir `backend/tests/integration/test_candidate_api.py`. Ajouter à la fin :

```python
async def test_update_profile_availability_fields(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={
            "availability_status": "available_now",
            "work_mode": "remote",
            "location_preference": "Paris",
            "preferred_domains": ["finance", "tech"],
            "mission_duration": "medium",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["availability_status"] == "available_now"
    assert data["work_mode"] == "remote"
    assert data["location_preference"] == "Paris"
    assert data["preferred_domains"] == ["finance", "tech"]
    assert data["mission_duration"] == "medium"


async def test_availability_date_required_when_status_is_available_from(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"availability_status": "available_from", "availability_date": None},
    )
    assert r.status_code == 422


async def test_availability_date_accepted_with_available_from(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"availability_status": "available_from", "availability_date": "2026-06-01"},
    )
    assert r.status_code == 200
    assert r.json()["availability_date"] == "2026-06-01"


async def test_preferred_domains_invalid_value_rejected(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"preferred_domains": ["invalid_domain"]},
    )
    assert r.status_code == 422
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
uv run pytest tests/integration/test_candidate_api.py -k "availability" -v
```

Résultat attendu : FAIL (champs non présents dans les schémas).

- [ ] **Step 3 : Mettre à jour les schémas dans `schemas/candidate.py`**

Ajouter les imports des nouveaux enums en haut :

```python
from models.candidate_profile import (
    AvailabilityStatus,
    ContractType,
    LanguageLevel,
    MissionDuration,
    SkillCategory,
    WorkMode,
)
```

Définir la liste des domaines valides et le validateur :

```python
from pydantic import field_validator

VALID_DOMAINS = {
    "finance", "retail", "industry", "public",
    "health", "tech", "telecom", "energy", "other",
}
```

Dans `CandidateProfileUpdate`, ajouter après `extra_fields` :

```python
availability_status: AvailabilityStatus | None = None
availability_date: date | None = None
work_mode: WorkMode | None = None
location_preference: str | None = None
preferred_domains: list[str] | None = None
mission_duration: MissionDuration | None = None

@field_validator("preferred_domains")
@classmethod
def validate_domains(cls, v: list[str] | None) -> list[str] | None:
    if v is None:
        return v
    invalid = set(v) - VALID_DOMAINS
    if invalid:
        raise ValueError(f"invalid domains: {invalid}")
    return v
```

Dans `CandidateProfileRead`, ajouter après `extra_fields` :

```python
availability_status: AvailabilityStatus
availability_date: date | None
work_mode: WorkMode | None
location_preference: str | None
preferred_domains: list[str] | None
mission_duration: MissionDuration | None
```

- [ ] **Step 4 : Ajouter la validation métier dans `candidate_service.py`**

Ouvrir `backend/services/candidate_service.py`. Modifier `update_profile` pour ajouter :

```python
async def update_profile(
    db: AsyncSession,
    profile: CandidateProfile,
    data: CandidateProfileUpdate,
) -> CandidateProfile:
    from models.candidate_profile import AvailabilityStatus

    updates = data.model_dump(exclude_unset=True)

    # Validate: availability_date required when status = available_from
    new_status = updates.get("availability_status", profile.availability_status)
    new_date = updates.get("availability_date", profile.availability_date)
    if new_status == AvailabilityStatus.AVAILABLE_FROM and new_date is None:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="availability_date is required when availability_status is 'available_from'",
        )

    for field, value in updates.items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_candidate_api.py -k "availability" -v
```

Résultat attendu : 4 tests PASSED.

- [ ] **Step 6 : Commit**

```bash
git add backend/schemas/candidate.py backend/services/candidate_service.py \
        backend/tests/integration/test_candidate_api.py
git commit -m "feat(c1): add availability/preference fields to schemas and validation"
```

---

### Task 4 : Formulaire candidat — section disponibilité

**Files:**
- Modify: `frontend/types/api.ts`
- Modify: `frontend/app/(candidate)/candidate/profile/page.tsx`

- [ ] **Step 1 : Mettre à jour le type `CandidateProfile` dans `frontend/types/api.ts`**

Ouvrir `frontend/types/api.ts`. Repérer l'interface `CandidateProfile` (ou équivalent) et ajouter :

```typescript
export type AvailabilityStatus = "available_now" | "available_from" | "not_available";
export type WorkMode = "remote" | "onsite" | "hybrid";
export type MissionDuration = "short" | "medium" | "long" | "permanent";

export const VALID_DOMAINS = [
  "finance", "retail", "industry", "public",
  "health", "tech", "telecom", "energy", "other",
] as const;
export type Domain = typeof VALID_DOMAINS[number];
```

Dans l'interface `CandidateProfile`, ajouter :

```typescript
availability_status: AvailabilityStatus;
availability_date: string | null;
work_mode: WorkMode | null;
location_preference: string | null;
preferred_domains: Domain[] | null;
mission_duration: MissionDuration | null;
```

- [ ] **Step 2 : Ajouter la section "Disponibilité & préférences" dans `profile/page.tsx`**

Ouvrir `frontend/app/(candidate)/candidate/profile/page.tsx`. Localiser la fin du formulaire (avant le bouton de soumission). Ajouter une `Card` dédiée :

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { VALID_DOMAINS, type AvailabilityStatus, type WorkMode, type MissionDuration } from "@/types/api";

// Dans le composant, ajouter les états :
const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>(
  profile.availability_status ?? "not_available"
);
const [availabilityDate, setAvailabilityDate] = useState(profile.availability_date ?? "");
const [workMode, setWorkMode] = useState<WorkMode | "">(profile.work_mode ?? "");
const [locationPreference, setLocationPreference] = useState(profile.location_preference ?? "");
const [preferredDomains, setPreferredDomains] = useState<string[]>(
  profile.preferred_domains ?? []
);
const [missionDuration, setMissionDuration] = useState(profile.mission_duration ?? "");
```

Dans le formulaire (avant le bouton submit) :

```tsx
<Card>
  <CardHeader><CardTitle>Disponibilité & préférences mission</CardTitle></CardHeader>
  <CardContent className="space-y-6">
    {/* Statut de disponibilité */}
    <div className="space-y-2">
      <Label>Disponibilité</Label>
      <RadioGroup
        value={availabilityStatus}
        onValueChange={(v) => setAvailabilityStatus(v as AvailabilityStatus)}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="available_now" id="av-now" />
          <Label htmlFor="av-now">Disponible maintenant</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="available_from" id="av-from" />
          <Label htmlFor="av-from">Disponible à partir du</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="not_available" id="av-no" />
          <Label htmlFor="av-no">Non disponible</Label>
        </div>
      </RadioGroup>
      {availabilityStatus === "available_from" && (
        <Input
          type="date"
          value={availabilityDate}
          onChange={(e) => setAvailabilityDate(e.target.value)}
          required
        />
      )}
    </div>

    {/* Mode de travail */}
    <div className="space-y-2">
      <Label htmlFor="work-mode">Mode de travail</Label>
      <Select value={workMode} onValueChange={(v) => setWorkMode(v as WorkMode)}>
        <SelectTrigger id="work-mode"><SelectValue placeholder="Choisir…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="remote">Télétravail</SelectItem>
          <SelectItem value="onsite">Présentiel</SelectItem>
          <SelectItem value="hybrid">Hybride</SelectItem>
        </SelectContent>
      </Select>
    </div>

    {/* Localisation préférée */}
    <div className="space-y-2">
      <Label htmlFor="location-pref">Localisation préférée</Label>
      <Input
        id="location-pref"
        value={locationPreference}
        onChange={(e) => setLocationPreference(e.target.value)}
        placeholder="ex: Paris, Lyon"
      />
    </div>

    {/* Domaines métier */}
    <div className="space-y-2">
      <Label>Domaines métier</Label>
      <div className="grid grid-cols-3 gap-2">
        {VALID_DOMAINS.map((domain) => (
          <div key={domain} className="flex items-center gap-2">
            <Checkbox
              id={`domain-${domain}`}
              checked={preferredDomains.includes(domain)}
              onCheckedChange={(checked) => {
                setPreferredDomains((prev) =>
                  checked ? [...prev, domain] : prev.filter((d) => d !== domain)
                );
              }}
            />
            <Label htmlFor={`domain-${domain}`} className="capitalize">{domain}</Label>
          </div>
        ))}
      </div>
    </div>

    {/* Durée de mission */}
    <div className="space-y-2">
      <Label htmlFor="mission-dur">Durée de mission souhaitée</Label>
      <Select value={missionDuration} onValueChange={setMissionDuration}>
        <SelectTrigger id="mission-dur"><SelectValue placeholder="Choisir…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="short">Court terme (&lt; 3 mois)</SelectItem>
          <SelectItem value="medium">Moyen terme (3–6 mois)</SelectItem>
          <SelectItem value="long">Long terme (6 mois+)</SelectItem>
          <SelectItem value="permanent">CDI / Permanent</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </CardContent>
</Card>
```

Inclure ces champs dans le payload envoyé lors du `PUT /candidates/me/profile` :

```typescript
availability_status: availabilityStatus,
availability_date: availabilityStatus === "available_from" ? availabilityDate || null : null,
work_mode: workMode || null,
location_preference: locationPreference || null,
preferred_domains: preferredDomains.length > 0 ? preferredDomains : null,
mission_duration: missionDuration || null,
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add frontend/types/api.ts frontend/app/\(candidate\)/candidate/profile/page.tsx
git commit -m "feat(c1): add availability/preference form section in candidate profile"
```

---

### Task 5 : Nouveaux champs dans PROFILE_FIELDS recruteur

**Files:**
- Modify: `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`
- Modify: `backend/services/generation_service.py`

- [ ] **Step 1 : Ajouter les 4 champs dans `PROFILE_FIELDS`**

Ouvrir `frontend/app/(recruiter)/recruiter/templates/[id]/page.tsx`. Repérer la constante `PROFILE_FIELDS`. Ajouter à la fin du tableau :

```typescript
{ value: "availability_status", label: "Disponibilité" },
{ value: "work_mode", label: "Mode de travail" },
{ value: "location_preference", label: "Localisation préférée" },
{ value: "mission_duration", label: "Durée de mission souhaitée" },
```

- [ ] **Step 2 : Exposer les champs dans `_profile_flat` du generation service**

Ouvrir `backend/services/generation_service.py`. Dans `_profile_flat`, ajouter après `"annual_salary"` :

```python
"availability_status": str(profile.availability_status.value) if profile.availability_status else "",
"work_mode": str(profile.work_mode.value) if profile.work_mode else "",
"location_preference": profile.location_preference or "",
"mission_duration": str(profile.mission_duration.value) if profile.mission_duration else "",
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4 : Vérifier les tests backend**

```bash
cd backend && uv run pytest tests/ -v --tb=short
```

Résultat attendu : tous les tests passent.

- [ ] **Step 5 : Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/templates/\[id\]/page.tsx \
        backend/services/generation_service.py
git commit -m "feat(c1): expose availability/preference fields in PROFILE_FIELDS and generation service"
```
