# backend/tests/integration/test_recruiter_api.py
import io

from docx import Document  # type: ignore[import-untyped,unused-ignore]
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


async def test_create_organization(client: AsyncClient, recruiter_headers: dict[str, str]) -> None:
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
    r2 = await client.post("/organizations", headers=recruiter_headers, json={"name": "Dupont SA"})
    assert r2.status_code == 201
    assert r2.json()["slug"] == "dupont-sa-1"


async def test_get_organization(client: AsyncClient, recruiter_headers: dict[str, str]) -> None:
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
    org = await client.post("/organizations", headers=recruiter_headers, json={"name": "My Firm"})
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


async def _setup_org_and_link(client: AsyncClient, recruiter_headers: dict[str, str]) -> str:
    """Helper: create an org and link the recruiter to it. Returns org_id."""
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Template Corp"}
    )
    org_id: str = org.json()["id"]
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
    docx_bytes = _make_docx_bytes(["Nom: {{NOM}}", "Prénom: {{PRENOM}}", "Titre: {{TITRE}}"])
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "Mon Template"},
        files={
            "file": (
                "template.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Mon Template"
    assert "{{NOM}}" in data["detected_placeholders"]
    assert "{{PRENOM}}" in data["detected_placeholders"]
    assert "{{TITRE}}" in data["detected_placeholders"]
    assert data["is_valid"] is False
    assert data["mappings"] == {}


async def test_list_templates(client: AsyncClient, recruiter_headers: dict[str, str]) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}}"])
    for name in ["T1", "T2"]:
        await client.post(
            f"/organizations/{org_id}/templates",
            headers=recruiter_headers,
            data={"name": name},
            files={
                "file": (
                    "t.docx",
                    docx_bytes,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
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
        files={
            "file": (
                "t.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
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


async def test_delete_template(client: AsyncClient, recruiter_headers: dict[str, str]) -> None:
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(["{{NOM}}"])
    upload = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "ToDelete"},
        files={
            "file": (
                "t.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    template_id = upload.json()["id"]

    r = await client.delete(
        f"/organizations/{org_id}/templates/{template_id}",
        headers=recruiter_headers,
    )
    assert r.status_code == 204

    list_r = await client.get(f"/organizations/{org_id}/templates", headers=recruiter_headers)
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
    r = await client.get(f"/organizations/{org_id}/templates", headers=recruiter_headers)
    assert r.status_code == 403


async def test_upload_template_excludes_block_markers_from_detected(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
) -> None:
    """Uploading a template with mustache block markers must not list them
    as mappable placeholders — they are control syntax, not fields."""
    org_id = await _setup_org_and_link(client, recruiter_headers)
    docx_bytes = _make_docx_bytes(
        [
            "Candidat : {{NOM}}",
            "{{#EXPERIENCES}}",
            "{{EXP_CLIENT}} — {{EXP_ROLE}}",
            "{{/EXPERIENCES}}",
        ]
    )

    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "With block"},
        files={
            "file": (
                "with_block.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert r.status_code == 201, r.text
    body = r.json()
    assert "{{NOM}}" in body["detected_placeholders"]
    assert "{{EXP_CLIENT}}" in body["detected_placeholders"]
    assert "{{EXP_ROLE}}" in body["detected_placeholders"]
    assert "{{#EXPERIENCES}}" not in body["detected_placeholders"]
    assert "{{/EXPERIENCES}}" not in body["detected_placeholders"]
    assert body["is_valid"] is False  # no mappings yet


# ---- Accessible candidates --------------------------------------------------


async def test_list_accessible_candidates_empty(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Access Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    r = await client.get(f"/organizations/{org_id}/candidates", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_list_accessible_candidates_returns_granted(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Access Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"first_name": "Alice", "last_name": "Dupont"},
    )
    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    token = inv.json()["token"]
    r = await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    assert r.status_code == 201

    r = await client.get(f"/organizations/{org_id}/candidates", headers=recruiter_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["email"] == "candidate@test.com"
    assert data[0]["first_name"] == "Alice"
    assert data[0]["last_name"] == "Dupont"
    assert "user_id" in data[0]


async def test_list_accessible_candidates_excludes_revoked(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "Access Corp"}
    )
    org_id = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    accepted = await client.post(
        f"/invitations/{inv.json()['token']}/accept", headers=candidate_headers
    )
    grant_id = accepted.json()["id"]
    await client.delete(f"/access/me/{grant_id}", headers=candidate_headers)

    r = await client.get(f"/organizations/{org_id}/candidates", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_list_accessible_candidates_requires_membership(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    org = await client.post("/organizations", headers=recruiter_headers, json={"name": "Other Org"})
    org_id = org.json()["id"]
    r = await client.get(f"/organizations/{org_id}/candidates", headers=recruiter_headers)
    assert r.status_code == 403


async def test_list_accessible_candidates_forbids_candidate_role(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get(
        "/organizations/00000000-0000-0000-0000-000000000000/candidates",
        headers=candidate_headers,
    )
    assert r.status_code == 403


# ---- Template file download -------------------------------------------------


async def test_download_template_file_ok(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    """Recruiter can download the .docx file of a template they own."""
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
    org_a = await client.post("/organizations", json={"name": "Org A"}, headers=recruiter_headers)
    org_a_id = org_a.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_a_id}, headers=recruiter_headers)

    await client.post("/auth/register", json={"email": "rec2@test.com", "password": "pass1234", "role": "recruiter"})
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


# ---- Candidate filters (C3) -------------------------------------------------


async def test_filter_candidates_by_availability(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    org_r = await client.post("/organizations", json={"name": "Filter Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"availability_status": "available_now"},
    )

    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates?availability_status=available_now",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get(
        f"/organizations/{org_id}/candidates?availability_status=not_available",
        headers=recruiter_headers,
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 0


async def test_filter_candidates_by_skill(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    org_r = await client.post("/organizations", json={"name": "Skill Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language"},
    )

    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates?skill=python",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get(
        f"/organizations/{org_id}/candidates?skill=java",
        headers=recruiter_headers,
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 0


async def test_filter_candidates_by_max_daily_rate(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    org_r = await client.post("/organizations", json={"name": "Rate Org"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    await client.put("/candidates/me/profile", headers=candidate_headers, json={"daily_rate": 700})

    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": "candidate@test.com"},
        headers=recruiter_headers,
    )
    token = inv.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)

    r = await client.get(
        f"/organizations/{org_id}/candidates?max_daily_rate=800",
        headers=recruiter_headers,
    )
    assert r.status_code == 200
    assert len(r.json()) == 1

    r2 = await client.get(
        f"/organizations/{org_id}/candidates?max_daily_rate=600",
        headers=recruiter_headers,
    )
    assert r2.status_code == 200
    assert len(r2.json()) == 0
