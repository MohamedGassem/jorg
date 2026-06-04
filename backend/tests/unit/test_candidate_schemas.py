# backend/tests/unit/test_candidate_schemas.py
from datetime import date

import pytest
from pydantic import ValidationError

from models.candidate_profile import LanguageLevel
from schemas.candidate import (
    CertificationCreate,
    EducationCreate,
    ExperienceCreate,
    ExperienceUpdate,
    LanguageCreate,
)


def test_experience_blank_client_name_rejected():
    with pytest.raises(ValidationError):
        ExperienceCreate(client_name="   ", role="Dev", start_date=date(2020, 1, 1))


def test_experience_trims_client_name():
    exp = ExperienceCreate(client_name="  ACME  ", role="Dev", start_date=date(2020, 1, 1))
    assert exp.client_name == "ACME"


def test_education_blank_school_rejected():
    with pytest.raises(ValidationError):
        EducationCreate(school="")


def test_certification_blank_issuer_rejected():
    with pytest.raises(ValidationError):
        CertificationCreate(name="AWS SAA", issuer="  ", issue_date=date(2021, 1, 1))


def test_language_blank_name_rejected():
    with pytest.raises(ValidationError):
        LanguageCreate(name="  ", level=LanguageLevel.NATIVE)


def test_experience_update_trims_client_name():
    upd = ExperienceUpdate(client_name="  ACME  ")
    assert upd.client_name == "ACME"


def test_experience_update_allows_none_client_name():
    upd = ExperienceUpdate()
    assert upd.client_name is None
