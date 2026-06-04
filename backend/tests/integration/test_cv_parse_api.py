# backend/tests/integration/test_cv_parse_api.py
"""Integration tests for POST /candidates/me/parse-cv."""

from httpx import AsyncClient

_CV_TEXT = """\
Jean Dupont
Développeur logiciel
jean.dupont@example.com
+33 6 12 34 56 78
linkedin.com/in/jean-dupont

Compétences : Python, Java, JavaScript
Expérience en développement backend.
"""


async def test_parse_cv_extracts_contact_and_skills(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={"file": ("cv.txt", _CV_TEXT.encode("utf-8"), "text/plain")},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "jean.dupont@example.com"
    assert data["linkedin_url"] == "https://linkedin.com/in/jean-dupont"
    assert data["phone"] is not None

    names = {s["name"] for s in data["skills"]}
    assert "Python" in names
    assert "Java" in names
    for skill in data["skills"]:
        assert "skill_ref_id" in skill
        assert "kind" in skill


async def test_parse_cv_matches_aliases(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    # "ECMAScript" is a seeded alias of JavaScript.
    r = await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={"file": ("cv.txt", b"Stack: ECMAScript and Python", "text/plain")},
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
        files={"file": ("cv.rtf", b"data", "application/rtf")},
    )
    assert r.status_code == 415


async def test_parse_cv_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/candidates/me/parse-cv",
        files={"file": ("cv.txt", b"Python", "text/plain")},
    )
    assert r.status_code == 401


async def test_parse_cv_does_not_mutate_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.post(
        "/candidates/me/parse-cv",
        headers=candidate_headers,
        files={"file": ("cv.txt", _CV_TEXT.encode("utf-8"), "text/plain")},
    )
    profile = await client.get("/candidates/me/profile", headers=candidate_headers)
    # parse-cv is read-only: it must not have written the extracted email/phone.
    assert profile.json()["phone"] is None
