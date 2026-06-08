"""Integration tests for POST /candidates/me/parse-cv."""

import io

from docx import Document
from httpx import AsyncClient

_CV_TEXT = """\
Jean Dupont
Développeur logiciel
jean.dupont@example.com
+33 6 12 34 56 78
linkedin.com/in/jean-dupont

Compétences
Python, Java, JavaScript

Expérience
Développement backend 2020 2024

Formation
Ecole Ingénieur 2016 2019
"""


def _docx_bytes(text: str) -> bytes:
    document = Document()
    for line in text.splitlines():
        document.add_paragraph(line)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


async def test_parse_cv_extracts_structured_proposal_and_skills(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={
            "file": (
                "cv.docx",
                _docx_bytes(_CV_TEXT),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["proposal_id"]
    assert data["status"] == "pending_review"
    assert data["extraction_method"] == "docx_fast"
    assert data["quality_score"] > 20
    assert data["email"] == "jean.dupont@example.com"
    assert data["linkedin_url"] == "https://linkedin.com/in/jean-dupont"
    assert data["phone"] is not None
    assert data["proposed_profile"]["identity"]["email"]["needs_review"] is False
    assert data["proposed_profile"]["experiences"]

    names = {s["name"] for s in data["skills"]}
    assert "Python" in names
    assert "Java" in names
    for skill in data["skills"]:
        assert "match_type" in skill
        assert "original_label" in skill


async def test_parse_cv_matches_aliases(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={
            "file": (
                "cv.docx",
                _docx_bytes("Jean Dupont\njean@example.com\nCompétences\nECMAScript and Python"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert r.status_code == 200, r.text
    names = {s["name"] for s in r.json()["skills"]}
    assert "JavaScript" in names


async def test_parse_cv_unsupported_format(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={"file": ("cv.txt", b"data", "text/plain")},
    )
    assert r.status_code == 415


async def test_parse_cv_too_short_text(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={
            "file": (
                "cv.docx",
                _docx_bytes("Python"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert r.status_code == 422


async def test_parse_cv_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        files={
            "file": (
                "cv.docx",
                _docx_bytes(_CV_TEXT),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert r.status_code == 401


async def test_parse_cv_does_not_mutate_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={
            "file": (
                "cv.docx",
                _docx_bytes(_CV_TEXT),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert profile.json()["phone"] is None
