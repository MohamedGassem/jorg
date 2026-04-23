# G5 — Template d'exemple téléchargeable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre à disposition un fichier `.docx` d'exemple illustrant la syntaxe des placeholders, accessible via `GET /templates/sample` (auth recruteur), avec un bouton "Télécharger un exemple" dans l'UI.

**Architecture:** Fichier statique `backend/static/sample_template.docx` généré par un script Python one-shot (python-docx). Endpoint dans un nouveau router `api/routes/templates.py` sans prefix (monté dans `main.py`). Bouton frontend dans la page `/recruiter/templates`.

**Tech Stack:** Python 3.14, FastAPI, FileResponse, python-docx, Next.js 15.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section G5)

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/static/sample_template.docx` | CREATE | Fichier Word d'exemple versionné en git |
| `backend/scripts/generate_sample_template.py` | CREATE | Script one-shot pour générer le docx |
| `backend/api/routes/templates.py` | CREATE | Router `GET /templates/sample` |
| `backend/main.py` | MODIFY | Enregistrer le nouveau router |
| `frontend/app/(recruiter)/recruiter/templates/page.tsx` | MODIFY | Bouton "Télécharger un exemple" |

---

### Task 1 : Générer le fichier `sample_template.docx`

**Files:**
- Create: `backend/scripts/generate_sample_template.py`
- Create: `backend/static/sample_template.docx`

- [ ] **Step 1 : Créer le dossier `backend/static/` et le script**

```bash
mkdir -p backend/static backend/scripts
```

- [ ] **Step 2 : Créer le script `backend/scripts/generate_sample_template.py`**

```python
#!/usr/bin/env python3
"""One-shot script to generate backend/static/sample_template.docx."""
from pathlib import Path
from docx import Document
from docx.shared import Pt


def main() -> None:
    doc = Document()

    doc.add_heading("Dossier de compétences — {{NOM}} {{PRENOM}}", level=1)

    doc.add_heading("Informations générales", level=2)
    table = doc.add_table(rows=4, cols=2)
    table.style = "Table Grid"
    rows = table.rows
    rows[0].cells[0].text = "Titre"
    rows[0].cells[1].text = "{{TITRE}}"
    rows[1].cells[0].text = "Localisation"
    rows[1].cells[1].text = "{{LOCALISATION}}"
    rows[2].cells[0].text = "TJM"
    rows[2].cells[1].text = "{{TJM}} €/j"
    rows[3].cells[0].text = "Disponibilité"
    rows[3].cells[1].text = "{{DISPONIBILITE}}"

    doc.add_heading("Résumé", level=2)
    doc.add_paragraph("{{RESUME}}")

    doc.add_heading("Expériences professionnelles", level=2)
    doc.add_paragraph("{{#EXPERIENCES}}")
    p = doc.add_paragraph()
    run = p.add_run("{{EXP_CLIENT}} — {{EXP_ROLE}}")
    run.bold = True
    doc.add_paragraph("Période : {{EXP_DEBUT}} – {{EXP_FIN}}")
    doc.add_paragraph("Description : {{EXP_DESCRIPTION}}")
    doc.add_paragraph("Technologies : {{EXP_TECHNOLOGIES}}")
    doc.add_paragraph("{{/EXPERIENCES}}")

    doc.add_heading("Compétences", level=2)
    doc.add_paragraph("{{#COMPETENCES}}")
    doc.add_paragraph("• {{COMP_NOM}} ({{COMP_CATEGORIE}})")
    doc.add_paragraph("{{/COMPETENCES}}")

    doc.add_heading("Formations", level=2)
    doc.add_paragraph("{{#FORMATIONS}}")
    doc.add_paragraph("{{FORMATION_ECOLE}} — {{FORMATION_DIPLOME}} ({{FORMATION_DEBUT}}–{{FORMATION_FIN}})")
    doc.add_paragraph("{{/FORMATIONS}}")

    out = Path(__file__).parent.parent / "static" / "sample_template.docx"
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out))
    print(f"Generated: {out}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3 : Exécuter le script depuis `backend/`**

```bash
cd backend
uv run python scripts/generate_sample_template.py
```

Résultat attendu : `Generated: .../backend/static/sample_template.docx`

- [ ] **Step 4 : Vérifier que le fichier existe**

```bash
ls -lh static/sample_template.docx
```

Résultat attendu : fichier > 0 bytes.

- [ ] **Step 5 : Commit**

```bash
git add backend/static/sample_template.docx backend/scripts/generate_sample_template.py
git commit -m "feat(g5): add sample template docx and generation script"
```

---

### Task 2 : Endpoint `GET /templates/sample`

**Files:**
- Create: `backend/api/routes/templates.py`
- Modify: `backend/main.py`

- [ ] **Step 1 : Créer `backend/api/routes/templates.py`**

```python
# backend/api/routes/templates.py
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from api.deps import require_role
from models.user import User, UserRole

router = APIRouter(tags=["templates"])

RecruiterUser = Annotated[User, Depends(require_role(UserRole.RECRUITER))]

SAMPLE_PATH = Path(__file__).parent.parent.parent / "static" / "sample_template.docx"


@router.get("/templates/sample")
async def download_sample_template(current_user: RecruiterUser) -> FileResponse:
    if not SAMPLE_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sample template not available",
        )
    return FileResponse(
        path=str(SAMPLE_PATH),
        filename="jorg-sample-template.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
```

- [ ] **Step 2 : Enregistrer le router dans `main.py`**

Ajouter l'import :

```python
from api.routes.templates import router as templates_router
```

Ajouter après les autres `include_router` :

```python
app.include_router(templates_router)
```

- [ ] **Step 3 : Écrire le test**

Créer `backend/tests/integration/test_sample_template.py` :

```python
# backend/tests/integration/test_sample_template.py
from httpx import AsyncClient


async def test_sample_template_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/templates/sample")
    assert r.status_code == 401


async def test_candidate_cannot_download_sample(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/templates/sample", headers=candidate_headers)
    assert r.status_code == 403


async def test_recruiter_can_download_sample(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/templates/sample", headers=recruiter_headers)
    assert r.status_code == 200
    assert "application/vnd.openxmlformats" in r.headers["content-type"]
    assert len(r.content) > 0
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_sample_template.py -v
```

Résultat attendu : 3 tests PASSED.

- [ ] **Step 5 : Commit**

```bash
git add backend/api/routes/templates.py backend/main.py \
        backend/tests/integration/test_sample_template.py
git commit -m "feat(g5): add GET /templates/sample endpoint"
```

---

### Task 3 : Bouton "Télécharger un exemple" dans l'UI recruteur

**Files:**
- Modify: `frontend/app/(recruiter)/recruiter/templates/page.tsx`

- [ ] **Step 1 : Ajouter le bouton dans la section header de la page**

Ouvrir `frontend/app/(recruiter)/recruiter/templates/page.tsx`.

Repérer la ligne :

```tsx
<h1 className="text-2xl font-bold">Templates</h1>
```

Remplacer par :

```tsx
<div className="flex items-center justify-between gap-4">
  <h1 className="text-2xl font-bold">Templates</h1>
  <a
    href="/api/templates/sample"
    onClick={async (e) => {
      e.preventDefault();
      const { api } = await import("@/lib/api");
      const blob = await api.getBlob("/templates/sample");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jorg-sample-template.docx";
      a.click();
      URL.revokeObjectURL(url);
    }}
    className={buttonVariants({ variant: "outline", size: "sm" })}
  >
    Télécharger un exemple
  </a>
</div>
```

- [ ] **Step 2 : Ajouter `getBlob` dans `frontend/lib/api.ts`**

Ouvrir `frontend/lib/api.ts`. Repérer la classe ou l'objet `api` et ajouter la méthode :

```typescript
async getBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.blob();
},
```

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Résultat attendu : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add frontend/app/\(recruiter\)/recruiter/templates/page.tsx frontend/lib/api.ts
git commit -m "feat(g5): add download sample template button in recruiter UI"
```
