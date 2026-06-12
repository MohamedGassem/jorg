import uuid
from types import SimpleNamespace
from typing import cast

from models.candidate_profile import Experience
from services.recruiter_service import assemble_accessible_candidates


def _row(profile_id: uuid.UUID | None = None, **overrides: object) -> SimpleNamespace:
    base: dict[str, object] = {
        "user_id": uuid.uuid4(),
        "email": "c@test.com",
        "first_name": "Jean",
        "last_name": "Test",
        "title": "Dev",
        "daily_rate": 500,
        "contract_type": "freelance",
        "availability_status": "available_now",
        "work_mode": "remote",
        "location_preference": "Paris",
        "preferred_domains": ["tech"],
        "profile_id": profile_id,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_assembles_fields_and_attaches_experiences() -> None:
    pid = uuid.uuid4()
    row = _row(profile_id=pid)
    exp = cast("Experience", object())
    views = assemble_accessible_candidates([row], {pid: [exp]})
    assert len(views) == 1
    assert views[0]["user_id"] == row.user_id
    assert views[0]["email"] == "c@test.com"
    assert views[0]["title"] == "Dev"
    assert views[0]["daily_rate"] == 500
    assert views[0]["experiences"] == [exp]


def test_missing_profile_yields_empty_experiences() -> None:
    views = assemble_accessible_candidates([_row(profile_id=None)], {})
    assert views[0]["experiences"] == []
