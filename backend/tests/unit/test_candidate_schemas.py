# backend/tests/unit/test_candidate_schemas.py
from datetime import date

import pytest
from pydantic import ValidationError

from core.exceptions import BusinessRuleError
from models.candidate_profile import LanguageLevel
from schemas.candidate import (
    CertificationCreate,
    CertificationUpdate,
    EducationCreate,
    EducationUpdate,
    ExperienceCreate,
    ExperienceUpdate,
    LanguageCreate,
    LanguageUpdate,
    validate_certification_dates,
    validate_education_dates,
    validate_experience_dates,
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


def test_experience_end_before_start_rejected():
    with pytest.raises(BusinessRuleError):
        validate_experience_dates(date(2020, 6, 1), date(2020, 1, 1), is_current=False)


def test_experience_current_with_end_date_rejected():
    with pytest.raises(BusinessRuleError):
        validate_experience_dates(date(2020, 1, 1), date(2021, 1, 1), is_current=True)


def test_experience_current_without_end_ok():
    validate_experience_dates(date(2020, 1, 1), None, is_current=True)


def test_experience_past_with_end_ok():
    validate_experience_dates(date(2020, 1, 1), date(2021, 1, 1), is_current=False)


def test_education_end_before_start_rejected():
    with pytest.raises(BusinessRuleError):
        validate_education_dates(date(2020, 6, 1), date(2020, 1, 1))


def test_education_open_dates_ok():
    validate_education_dates(None, None)


def test_certification_expiry_before_issue_rejected():
    with pytest.raises(BusinessRuleError):
        validate_certification_dates(date(2021, 1, 1), date(2020, 1, 1))


def test_certification_no_expiry_ok():
    validate_certification_dates(date(2021, 1, 1), None)


# ---- Update schemas reject explicit null on NOT NULL columns (review fix) ----


def test_experience_update_rejects_explicit_null_start_date():
    with pytest.raises(ValidationError):
        ExperienceUpdate(start_date=None)


def test_experience_update_rejects_explicit_null_is_current():
    with pytest.raises(ValidationError):
        ExperienceUpdate(is_current=None)


def test_experience_update_rejects_explicit_null_client_name():
    with pytest.raises(ValidationError):
        ExperienceUpdate(client_name=None)


def test_experience_update_allows_omitted_required_fields():
    upd = ExperienceUpdate(role="Dev")
    assert upd.role == "Dev"
    assert upd.start_date is None


def test_certification_update_rejects_explicit_null_issue_date():
    with pytest.raises(ValidationError):
        CertificationUpdate(issue_date=None)


def test_education_update_rejects_explicit_null_school():
    with pytest.raises(ValidationError):
        EducationUpdate(school=None)


def test_language_update_rejects_explicit_null_level():
    with pytest.raises(ValidationError):
        LanguageUpdate(level=None)
