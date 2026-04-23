# G7 — Téléchargement authentifié du fichier template

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un endpoint `GET /organizations/{org_id}/templates/{template_id}/file` qui streame le fichier `.docx` d'un template, accessible uniquement par un recruteur de l'organisation.

**Architecture:** Un seul endpoint ajouté dans `api/routes/organizations.py`, suivant le pattern `FileResponse` déjà utilisé dans `generation.py`. Aucun changement de modèle DB ni de service.

**Tech Stack:** Python 3.14, FastAPI, FileResponse, pytest-asyncio, testcontainers.

**Spec reference:** [../specs/2026-04-23-remaining-development-design.md](../specs/2026-04-23-remaining-development-design.md) (section G7)

---

## Structure de fichiers créés/modifiés

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/api/routes/organizations.py` | MODIFY | Ajouter l'endpoint GET /{org_id}/templates/{template_id}/file |
| `backend/tests/integration/test_recruiter_api.py` | MODIFY | Ajouter les tests du nouvel endpoint |

---

### Task 1 : Endpoint de téléchargement du fichier template

**Files:**
- Modify: `backend/api/routes/organizations.py`

- [ ] **Step 1 : Écrire le test en premier**

Ouvrir `backend/tests/integration/test_recruiter_api.py`. Trouver la fin du fichier et ajouter :

```python
async def test_download_template_file_ok(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    """Recruiter can download the .docx file of a template they own."""
    # Create org and upload a template first
    org_r = await client.post("/organizations", json={"name": "DL Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    import io
    from docx import Document
    buf = io.BytesIO()
    Document().save(buf)
    buf.seek(0)
    upload_r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        files={"file": ("test.docx", buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={"name": "Test Template"},
    )
    assert upload_r.status_code == 201
    template_id = upload_r.json()["id"]

    r = await client.get(
        f"/organizations/{org_id}/templates/{template_id}/file",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert "application/vnd.openxmlformats" in r.headers["content-type"]
    assert "attachment" in r.headers.get("content-disposition", "")


async def test_download_template_file_wrong_org_returns_403(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    """A recruiter cannot download a template from another organization."""
    # Create org A with recruiter
    org_a = await client.post("/organizations", json={"name": "Org A"}, headers=recruiter_headers)
    org_a_id = org_a.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_a_id}, headers=recruiter_headers)

    # Create org B with a second recruiter
    r2 = await client.post("/auth/register", json={"email": "rec2@test.com", "password": "pass1234", "role": "recruiter"})
    login2 = await client.post("/auth/login", json={"email": "rec2@test.com", "password": "pass1234"})
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}

    org_b = await client.post("/organizations", json={"name": "Org B"}, headers=headers2)
    org_b_id = org_b.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_b_id}, headers=headers2)

    import io
    from docx import Document
    buf = io.BytesIO()
    Document().save(buf)
    buf.seek(0)
    upload_r = await client.post(
        f"/organizations/{org_b_id}/templates",
        headers=headers2,
        files={"file": ("test.docx", buf, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        data={"name": "Org B Template"},
    )
    template_id = upload_r.json()["id"]

    # Recruiter from org A tries to download org B's template
    r = await client.get(
        f"/organizations/{org_b_id}/templates/{template_id}/file",
        headers=recruiter_headers,
    )
    assert r.status_code == 403


async def test_download_template_file_not_found_returns_404(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_r = await client.post("/organizations", json={"name": "NF Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    import uuid
    r = await client.get(
        f"/organizations/{org_id}/templates/{uuid.uuid4()}/file",
        headers=recruiter_headers,
    )
    assert r.status_code == 404
```

- [ ] **Step 2 : Vérifier que les tests échouent (endpoint absent)**

```bash
uv run pytest tests/integration/test_recruiter_api.py::test_download_template_file_ok -v
```

Résultat attendu : FAIL avec 404 ou 405.

- [ ] **Step 3 : Ajouter l'endpoint dans `organizations.py`**

En haut du fichier, ajouter `Path` et `FileResponse` aux imports existants :

```python
from pathlib import Path
from fastapi.responses import FileResponse
```

À la fin du fichier (après le `delete_template` existant), ajouter :

```python
@router.get("/{org_id}/templates/{template_id}/file")
async def download_template_file(
    org_id: UUID, template_id: UUID, current_user: RecruiterUser, db: DB
) -> FileResponse:
    await _get_org_or_404(db, org_id)
    await _require_org_membership(db, current_user.id, org_id)
    tmpl = await template_service.get_template(db, template_id, org_id)
    if tmpl is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="template not found")

    file_path = Path(tmpl.word_file_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="file no longer available")

    safe_name = f"{tmpl.name}.docx".replace("/", "_").replace("..", "_")
    return FileResponse(
        path=str(file_path),
        filename=safe_name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
uv run pytest tests/integration/test_recruiter_api.py -k "download_template" -v
```

Résultat attendu : 3 tests PASSED.

- [ ] **Step 5 : Vérifier que la suite complète passe toujours**

```bash
uv run pytest tests/ -v --tb=short
```

- [ ] **Step 6 : Commit**

```bash
git add backend/api/routes/organizations.py backend/tests/integration/test_recruiter_api.py
git commit -m "feat(g7): add authenticated template file download endpoint"
```
