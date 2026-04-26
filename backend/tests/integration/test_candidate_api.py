# backend/tests/integration/test_candidate_api.py
from httpx import AsyncClient

# ---- Auth & role guards -----------------------------------------------------


async def test_get_profile_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/candidates/me/profile")
    assert r.status_code == 401


async def test_recruiter_cannot_get_candidate_profile(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=recruiter_headers)
    assert r.status_code == 403


# ---- CandidateProfile -------------------------------------------------------


async def test_get_profile_auto_creates_empty_profile(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] is None
    assert data["last_name"] is None
    assert "id" in data
    assert "user_id" in data


async def test_get_profile_returns_same_profile_on_subsequent_calls(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r1 = await client.get("/candidates/me/profile", headers=candidate_headers)
    r2 = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r1.json()["id"] == r2.json()["id"]


async def test_update_profile(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={
            "first_name": "Alice",
            "last_name": "Dupont",
            "title": "Full Stack Developer",
            "years_of_experience": 5,
            "daily_rate": 600,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] == "Alice"
    assert data["last_name"] == "Dupont"
    assert data["title"] == "Full Stack Developer"
    assert data["years_of_experience"] == 5
    assert data["daily_rate"] == 600


async def test_update_profile_partial_does_not_overwrite_other_fields(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"first_name": "Alice", "last_name": "Dupont"},
    )
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"title": "Tech Lead"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["first_name"] == "Alice"  # non écrasé
    assert data["last_name"] == "Dupont"  # non écrasé
    assert data["title"] == "Tech Lead"  # mis à jour


async def test_update_profile_extra_fields(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"extra_fields": {"github": "alice", "portfolio": "https://alice.dev"}},
    )
    assert r.status_code == 200
    assert r.json()["extra_fields"]["github"] == "alice"


async def test_profile_defaults_contract_type_to_freelance(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/profile", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json()["contract_type"] == "freelance"
    assert r.json()["annual_salary"] is None


async def test_update_profile_contract_type_cdi(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"contract_type": "cdi", "annual_salary": 55000, "daily_rate": None},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["contract_type"] == "cdi"
    assert data["annual_salary"] == 55000


async def test_update_profile_contract_type_both(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"contract_type": "both", "annual_salary": 60000, "daily_rate": 700},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["contract_type"] == "both"
    assert data["annual_salary"] == 60000
    assert data["daily_rate"] == 700


async def test_update_profile_rejects_invalid_contract_type(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/profile",
        headers=candidate_headers,
        json={"contract_type": "gig"},
    )
    assert r.status_code == 422


# ---- Experience -------------------------------------------------------------


async def test_create_experience(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    r = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={
            "client_name": "Acme Corp",
            "role": "Backend Developer",
            "start_date": "2023-01-01",
            "is_current": True,
            "technologies": ["Python", "FastAPI", "PostgreSQL"],
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["client_name"] == "Acme Corp"
    assert data["role"] == "Backend Developer"
    assert data["is_current"] is True
    assert data["technologies"] == ["Python", "FastAPI", "PostgreSQL"]
    assert "id" in data


async def test_list_experiences(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Corp A", "role": "Dev", "start_date": "2022-01-01"},
    )
    await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Corp B", "role": "Lead", "start_date": "2023-06-01"},
    )
    r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


async def test_update_experience(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    create = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Old Corp", "role": "Junior Dev", "start_date": "2021-01-01"},
    )
    exp_id = create.json()["id"]

    r = await client.put(
        f"/candidates/me/experiences/{exp_id}",
        headers=candidate_headers,
        json={"client_name": "New Corp", "technologies": ["Go"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["client_name"] == "New Corp"
    assert data["role"] == "Junior Dev"  # non écrasé
    assert data["technologies"] == ["Go"]


async def test_delete_experience(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    create = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={"client_name": "Corp", "role": "Dev", "start_date": "2022-01-01"},
    )
    exp_id = create.json()["id"]

    r = await client.delete(f"/candidates/me/experiences/{exp_id}", headers=candidate_headers)
    assert r.status_code == 204

    list_r = await client.get("/candidates/me/experiences", headers=candidate_headers)
    assert len(list_r.json()) == 0


async def test_update_experience_not_found_returns_404(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.put(
        "/candidates/me/experiences/00000000-0000-0000-0000-000000000000",
        headers=candidate_headers,
        json={"client_name": "Corp"},
    )
    assert r.status_code == 404


# ---- Skill ------------------------------------------------------------------


async def test_create_and_list_skills(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level": "expert"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Python"
    assert r.json()["category"] == "language"

    list_r = await client.get("/candidates/me/skills", headers=candidate_headers)
    assert len(list_r.json()) == 1


async def test_update_and_delete_skill(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    create = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Docker", "category": "tool"},
    )
    skill_id = create.json()["id"]

    upd = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"level": "intermediate"},
    )
    assert upd.status_code == 200
    assert upd.json()["level"] == "intermediate"
    assert upd.json()["name"] == "Docker"  # non écrasé

    del_r = await client.delete(f"/candidates/me/skills/{skill_id}", headers=candidate_headers)
    assert del_r.status_code == 204


# ---- Education --------------------------------------------------------------


async def test_create_and_list_education(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/education",
        headers=candidate_headers,
        json={
            "school": "Université Paris VI",
            "degree": "Master",
            "field_of_study": "Informatique",
            "start_date": "2015-09-01",
            "end_date": "2017-06-30",
        },
    )
    assert r.status_code == 201
    assert r.json()["school"] == "Université Paris VI"

    list_r = await client.get("/candidates/me/education", headers=candidate_headers)
    assert len(list_r.json()) == 1


async def test_delete_education(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    create = await client.post(
        "/candidates/me/education",
        headers=candidate_headers,
        json={"school": "École Polytechnique"},
    )
    edu_id = create.json()["id"]

    r = await client.delete(f"/candidates/me/education/{edu_id}", headers=candidate_headers)
    assert r.status_code == 204


# ---- Certification ----------------------------------------------------------


async def test_create_and_list_certifications(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/certifications",
        headers=candidate_headers,
        json={
            "name": "AWS Solutions Architect",
            "issuer": "Amazon",
            "issue_date": "2024-03-15",
            "credential_url": "https://aws.amazon.com/verify/ABC123",
        },
    )
    assert r.status_code == 201
    assert r.json()["name"] == "AWS Solutions Architect"

    list_r = await client.get("/candidates/me/certifications", headers=candidate_headers)
    assert len(list_r.json()) == 1


async def test_delete_certification(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    create = await client.post(
        "/candidates/me/certifications",
        headers=candidate_headers,
        json={"name": "GCP Associate", "issuer": "Google", "issue_date": "2023-10-01"},
    )
    cert_id = create.json()["id"]

    r = await client.delete(f"/candidates/me/certifications/{cert_id}", headers=candidate_headers)
    assert r.status_code == 204


# ---- Language ---------------------------------------------------------------


async def test_create_and_list_languages(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/languages",
        headers=candidate_headers,
        json={"name": "Français", "level": "native"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Français"
    assert r.json()["level"] == "native"

    r2 = await client.post(
        "/candidates/me/languages",
        headers=candidate_headers,
        json={"name": "English", "level": "C1"},
    )
    assert r2.status_code == 201

    list_r = await client.get("/candidates/me/languages", headers=candidate_headers)
    assert len(list_r.json()) == 2


async def test_delete_language(client: AsyncClient, candidate_headers: dict[str, str]) -> None:
    create = await client.post(
        "/candidates/me/languages",
        headers=candidate_headers,
        json={"name": "Espagnol", "level": "B2"},
    )
    lang_id = create.json()["id"]

    r = await client.delete(f"/candidates/me/languages/{lang_id}", headers=candidate_headers)
    assert r.status_code == 204


# ---- Skill level_rating -----------------------------------------------------


async def test_create_skill_with_level_rating(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 4},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["level_rating"] == 4
    assert data["level"] is None


async def test_create_skill_level_rating_is_optional(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language"},
    )
    assert r.status_code == 201
    assert r.json()["level_rating"] is None


async def test_create_skill_rejects_rating_outside_range(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r_low = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 0},
    )
    assert r_low.status_code == 422

    r_high = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 6},
    )
    assert r_high.status_code == 422


async def test_update_skill_level_rating(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={"name": "Python", "category": "language", "level_rating": 2},
    )
    skill_id = created.json()["id"]

    r = await client.put(
        f"/candidates/me/skills/{skill_id}",
        headers=candidate_headers,
        json={"level_rating": 5},
    )
    assert r.status_code == 200
    assert r.json()["level_rating"] == 5


async def test_create_skill_with_level_text_and_rating_coexist(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.post(
        "/candidates/me/skills",
        headers=candidate_headers,
        json={
            "name": "Python",
            "category": "language",
            "level": "autonome",
            "level_rating": 3,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["level"] == "autonome"
    assert data["level_rating"] == 3


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


# ---- Interaction timeline ---------------------------------------------------


async def test_organizations_empty_for_new_candidate(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/organizations", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_organizations_shows_org_after_invitation(
    client: AsyncClient,
    candidate_headers: dict[str, str],
    recruiter_headers: dict[str, str],
) -> None:
    org_r = await client.post("/organizations", json={"name": "Acme"}, headers=recruiter_headers)
    org_id = org_r.json()["id"]
    await client.put("/recruiters/me/profile", json={"organization_id": org_id}, headers=recruiter_headers)

    cand_email = "candidate@test.com"
    await client.post(
        f"/organizations/{org_id}/invitations",
        json={"candidate_email": cand_email},
        headers=recruiter_headers,
    )

    r = await client.get("/candidates/me/organizations", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    card = data[0]
    assert card["organization_name"] == "Acme"
    assert card["current_status"] == "invited"
    assert any(e["type"] == "invitation_sent" for e in card["events"])


async def test_organizations_requires_candidate_role(
    client: AsyncClient, recruiter_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/organizations", headers=recruiter_headers)
    assert r.status_code == 403
