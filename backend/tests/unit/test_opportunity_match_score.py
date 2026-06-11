from uuid import uuid4

from services.opportunity_service import compute_match_score


def test_no_required_skills_returns_none():
    assert compute_match_score({uuid4()}, set()) is None


def test_full_match_returns_100():
    a, b = uuid4(), uuid4()
    assert compute_match_score({a, b}, {a, b}) == 100


def test_half_match_returns_50():
    a, b = uuid4(), uuid4()
    assert compute_match_score({a}, {a, b}) == 50


def test_no_overlap_returns_0():
    assert compute_match_score({uuid4()}, {uuid4()}) == 0


def test_rounding():
    # 1 of 3 required -> 33.33 -> 33
    a, b, c = uuid4(), uuid4(), uuid4()
    assert compute_match_score({a}, {a, b, c}) == 33
    # 2 of 3 required -> 66.66 -> 67
    assert compute_match_score({a, b}, {a, b, c}) == 67
