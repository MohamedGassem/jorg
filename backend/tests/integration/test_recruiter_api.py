# backend/tests/integration/test_recruiter_api.py
import io

from docx import Document  # type: ignore[import-untyped]
from httpx import AsyncClient


# ---- Auth & role guards -----------------------------------------------------


async def test_get_recruiter_profile_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/recruiters/me/profile")
    assert r.status_code == 401


async def test_candidate_cannot_get_recruiter_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/recruiters/me/profile", headers=candidate_headers)
    assert r.status_code == 403


# ---- RecruiterProfile -------------------------------------------------------


async def test_get_recruiter_profile_auto_creates(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/recruiters/me/profile", headers=recruiter_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] is None
    assert data["organization_id"] is None
    assert "id" in data


async def test_update_recruiter_profile(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"first_name": "Bob", "last_name": "Smith", "job_title": "Talent Manager"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] == "Bob"
    assert data["job_title"] == "Talent Manager"


# ---- Organization -----------------------------------------------------------


async def test_create_organization(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/organizations",
        headers=recruiter_headers,
        json={"name": "Acme Corp"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Acme Corp"
    assert data["slug"] == "acme-corp"
    assert "id" in data


async def test_create_organization_slug_is_unique(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    await client.post("/organizations", headers=recruiter_headers, json={"name": "Dupont SA"})
    r2 = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Dupont SA"}
    )
    assert r2.status_code == 201
    assert r2.json()["slug"] == "dupont-sa-1"


async def test_get_organization(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Test Inc"}
    )
    org_id = create.json()["id"]
    r = await client.get(f"/organizations/{org_id}", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Test Inc"


async def test_get_organization_not_found(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get(
        "/organizations/00000000-0000-0000-0000-000000000000",
        headers=recruiter_headers,
    )
    assert r.status_code == 404


async def test_recruiter_can_link_to_organization(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "My Firm"}
    )
    org_id = org.json()["id"]
    r = await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    assert r.status_code == 200
    assert r.json()["organization_id"] == org_id


async def test_candidate_cannot_create_organization(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/organizations",
        headers=candidate_headers,
        json={"name": "Should Fail"},
    )
    assert r.status_code == 403


# ---- Template upload --------------------------------------------------------


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    """Create a minimal .docx in memory and return its bytes."""
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def _setup_org_and_link(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> str:
    """Helper: create an org and link the recruiter to it. Returns org_id."""
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Template Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    return org_id


async def test_upload_template_detects_placeholders(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(
        ["Nom: {{NOM}}", "Prénom: {{PRENOM}}", "Titre: {{TITRE}}"]
    )
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "Mon Template"},
        files={"file": ("template.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Mon Template"
    assert "{{NOM}}" in data["detected_placeholders"]
    assert "{{PRENOM}}" in data["detected_placeholders"]
    assert "{{TITRE}}" in data["detected_placeholders"]
    assert data["is_valid"] is False
    assert data["mappings"] == {}


async def test_list_templates(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}}"])
    for name in ["T1", "T2"]:
        await client.post(
            f"/organizations/{org_id}/templates",
            headers=recruiter_headers,
            data={"name": name},
            files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
    r = await client.get(f"/organizations/{org_id}/templates", headers=recruiter_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_update_mappings_sets_is_valid(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}} {{PRENOM}}"])
    upload = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "T"},
        files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    template_id = upload.json()["id"]

    # Partial mapping — still invalid
    r1 = await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name"}},
    )
    assert r1.status_code == 200
    assert r1.json()["is_valid"] is False

    # Full mapping — now valid
    r2 = await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name", "{{PRENOM}}": "first_name"}},
    )
    assert r2.status_code == 200
    assert r2.json()["is_valid"] is True


async def test_delete_template(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}}"])
    upload = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "ToDelete"},
        files={"file": ("t.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    template_id = upload.json()["id"]

    r = await client.delete(
        f"/organizations/{org_id}/templates/{template_id}",
        headers=recruiter_headers,
    )
    assert r.status_code == 204

    list_r = await client.get(
        f"/organizations/{org_id}/templates", headers=recruiter_headers
    )
    assert len(list_r.json()) == 0


async def test_recruiter_cannot_access_other_org_templates(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    """A recruiter not linked to an org gets 403 on its templates."""
    # Create org but don't link recruiter to it
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Other Corp"}
    )
    org_id = org.json()["id"]
    # recruiter is not linked to this org
    r = await client.get(
        f"/organizations/{org_id}/templates", headers=recruiter_headers
    )
    assert r.status_code == 403
