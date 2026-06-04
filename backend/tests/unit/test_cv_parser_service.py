# backend/tests/unit/test_cv_parser_service.py
"""Pure unit tests for CV text/contact extraction — no DB."""

import pytest

from services.cv_parser_service import (
    CVTextExtractionError,
    CVTooLargeError,
    UnsupportedCVFormatError,
    extract_contact,
    extract_text,
)


def test_extract_contact_email():
    contact = extract_contact("Contactez-moi : jean.dupont@example.com")
    assert contact["email"] == "jean.dupont@example.com"


def test_extract_contact_linkedin_adds_scheme():
    contact = extract_contact("Profil: linkedin.com/in/jean-dupont")
    assert contact["linkedin_url"] == "https://linkedin.com/in/jean-dupont"


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
