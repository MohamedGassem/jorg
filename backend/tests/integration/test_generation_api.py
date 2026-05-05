# backend/tests/integration/test_generation_api.py
import io

from docx import Document  # type: ignore[import-untyped,unused-ignore]
from httpx import AsyncClient

# ---- helpers ----------------------------------------------------------------


def _make_docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def _setup_org_with_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> tuple[str, str]:
    """Create org, link recruiter, invite+accept candidate. Returns (org_id, candidate_id)."""
    org = await client.post("/organizations", headers=recruiter_headers, json={"name": "GenCorp"})
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    # Get candidate id from profile
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    candidate_id: str = profile.json()["user_id"]

    inv = await client.post(
        f"/organizations/{org_id}/invitations",
        headers=recruiter_headers,
        json={"candidate_email": "candidate@test.com"},
    )
    token = inv.json()["token"]
    await client.post(f"/invitations/{token}/accept", headers=candidate_headers)
    return org_id, candidate_id


async def _upload_valid_template(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    org_id: str,
) -> str:
    """Upload a template with {{NOM}} and fully map it. Returns template_id."""
    docx_bytes = _make_docx_bytes(["Nom: {{NOM}}", "Titre: {{TITRE}}"])
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "CV Template"},
        files={
            "file": (
                "t.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    template_id: str = r.json()["id"]
    await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name", "{{TITRE}}": "title"}, "version": 0},
    )
    return template_id


# ---- generate ---------------------------------------------------------------


async def test_recruiter_generates_document(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)

    r = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["file_format"] == "docx"
    assert "id" in data
    assert data["template_id"] == template_id


async def test_cannot_generate_without_access_grant(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    # Setup org + template but NO invitation/grant
    org = await client.post(
        "/organizations", headers=recruiter_headers, json={"name": "NoGrant Corp"}
    )
    org_id: str = org.json()["id"]
    await client.put(
        "/recruiters/me/profile",
        headers=recruiter_headers,
        json={"organization_id": org_id},
    )
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    candidate_id = profile.json()["user_id"]

    r = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    assert r.status_code == 403


async def test_cannot_generate_with_invalid_template(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    # Upload template but do NOT map all placeholders → is_valid=False
    docx_bytes = _make_docx_bytes(["{{NOM}} {{UNMAPPED}}"])
    r = await client.post(
        f"/organizations/{org_id}/templates",
        headers=recruiter_headers,
        data={"name": "Bad Template"},
        files={
            "file": (
                "t.docx",
                docx_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    template_id = r.json()["id"]
    # Only map one of two placeholders
    await client.put(
        f"/organizations/{org_id}/templates/{template_id}/mappings",
        headers=recruiter_headers,
        json={"mappings": {"{{NOM}}": "last_name"}, "version": 0},
    )

    r2 = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    assert r2.status_code == 422


async def test_candidate_cannot_trigger_generation(
    client: AsyncClient,
    candidate_headers: dict[str, str],
) -> None:
    r = await client.post(
        "/organizations/00000000-0000-0000-0000-000000000000/generate",
        headers=candidate_headers,
        json={
            "candidate_id": "00000000-0000-0000-0000-000000000001",
            "template_id": "00000000-0000-0000-0000-000000000002",
            "format": "docx",
        },
    )
    assert r.status_code == 403


# ---- history ----------------------------------------------------------------


async def test_candidate_history_lists_generated_docs(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )

    r = await client.get("/candidates/me/documents", headers=candidate_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


async def test_recruiter_org_history(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )

    r = await client.get(f"/organizations/{org_id}/documents", headers=recruiter_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ---- download ---------------------------------------------------------------


async def test_download_generated_document(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
    candidate_headers: dict[str, str],
) -> None:
    org_id, candidate_id = await _setup_org_with_grant(client, recruiter_headers, candidate_headers)
    template_id = await _upload_valid_template(client, recruiter_headers, org_id)
    gen = await client.post(
        f"/organizations/{org_id}/generate",
        headers=recruiter_headers,
        json={"candidate_id": candidate_id, "template_id": template_id, "format": "docx"},
    )
    doc_id = gen.json()["id"]

    r = await client.get(f"/documents/{doc_id}/download", headers=recruiter_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument")
