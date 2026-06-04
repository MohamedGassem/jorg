# backend/tests/unit/test_cv_parser_service.py
"""Pure unit tests for CV text/contact extraction — no DB."""

from uuid import uuid4

import pytest

from models.skill import SkillKind
from services.cv_parser_service import (
    CVTextExtractionError,
    CVTooLargeError,
    SkillEntry,
    UnsupportedCVFormatError,
    extract_contact,
    extract_text,
    match_skills_in_index,
)


def test_extract_contact_email():
    contact = extract_contact("Contactez-moi : jean.dupont@example.com")
    assert contact["email"] == "jean.dupont@example.com"


def test_extract_contact_linkedin_adds_scheme():
    contact = extract_contact("Profil: linkedin.com/in/jean-dupont")
    assert contact["linkedin_url"] == "https://linkedin.com/in/jean-dupont"


def test_extract_contact_linkedin_case_insensitive():
    # Brand is commonly capitalised in CVs; matching must ignore case.
    contact = extract_contact("Mon profil LinkedIn.com/in/Jean-Dupont")
    assert contact["linkedin_url"] == "https://LinkedIn.com/in/Jean-Dupont"


def test_extract_contact_phone_french():
    contact = extract_contact("Tel: +33 6 12 34 56 78")
    assert contact["phone"] is not None
    assert "12 34 56 78" in contact["phone"]


def test_extract_contact_none_when_absent():
    contact = extract_contact("Aucune coordonnée ici.")
    assert contact["email"] is None
    assert contact["phone"] is None
    assert contact["linkedin_url"] is None


def test_extract_text_txt():
    assert extract_text("cv.txt", b"Hello world") == "Hello world"


def test_extract_text_unsupported_format():
    with pytest.raises(UnsupportedCVFormatError):
        extract_text("cv.rtf", b"data")


def test_extract_text_too_large():
    with pytest.raises(CVTooLargeError):
        extract_text("cv.txt", b"x" * (5 * 1024 * 1024 + 1))


def test_extract_text_empty_raises():
    with pytest.raises(CVTextExtractionError):
        extract_text("cv.txt", b"   ")


def test_match_skills_in_index_matches_and_dedupes():
    python = SkillEntry(id=uuid4(), name="Python", kind=SkillKind.technical)
    teamwork = SkillEntry(id=uuid4(), name="travail en équipe", kind=SkillKind.soft)
    index = {
        "python": python,
        "py": python,  # alias pointing at the same entry
        "travail en equipe": teamwork,
    }
    # Accents and punctuation are normalised away on both sides of the match.
    matched = match_skills_in_index("J'ai fait du Python. Travail en équipe.", index)
    assert {e.name for e in matched} == {"Python", "travail en équipe"}


def test_match_skills_in_index_no_match():
    index = {"python": SkillEntry(id=uuid4(), name="Python", kind=SkillKind.technical)}
    assert match_skills_in_index("Rien de pertinent ici", index) == []
