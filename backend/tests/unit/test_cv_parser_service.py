"""Pure unit tests for CV parsing helpers, no DB."""

import io
from unittest.mock import Mock
from uuid import uuid4

import pytest
from docx import Document
from sqlalchemy.exc import ProgrammingError

from models.skill import SkillKind
from services.cv_parser_service import (
    CVLLMExtractionError,
    CVPersistenceUnavailableError,
    CVTextExtractionError,
    CVTooLargeError,
    SkillEntry,
    TextExtractionResult,
    UnsupportedCVFormatError,
    build_structured_proposal,
    extract_contact,
    extract_text,
    extract_text_with_metadata,
    match_skills_in_index,
    parse_llm_json_strict,
    score_text_quality,
)


def _skill_index(names: list[str]) -> dict[str, SkillEntry]:
    return {
        name.lower().replace("-", " "): SkillEntry(id=uuid4(), name=name, kind=SkillKind.technical)
        for name in names
    }


def _docx_bytes(text: str) -> bytes:
    document = Document()
    for line in text.splitlines():
        document.add_paragraph(line)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_extract_contact_email():
    contact = extract_contact("Contactez-moi : jean.dupont@example.com")
    assert contact["email"] == "jean.dupont@example.com"


def test_extract_contact_linkedin_adds_scheme():
    contact = extract_contact("Profil: linkedin.com/in/jean-dupont")
    assert contact["linkedin_url"] == "https://linkedin.com/in/jean-dupont"


def test_extract_contact_linkedin_case_insensitive():
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


def test_extract_text_docx():
    assert "Jean Dupont" in extract_text("cv.docx", _docx_bytes("Jean Dupont\nPython"))


def test_extract_text_pdf_uses_pymupdf(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "services.cv_parser_service._extract_pdf_layout",
        lambda data: "PDF text Python",
    )
    result = extract_text_with_metadata("cv.pdf", b"%PDF fake")
    assert result.method == "pdf_pymupdf"
    assert result.text == "PDF text Python"


def test_extract_text_unsupported_format():
    with pytest.raises(UnsupportedCVFormatError):
        extract_text("cv.rtf", b"data")


def test_extract_text_too_large():
    with pytest.raises(CVTooLargeError):
        extract_text("cv.pdf", b"x" * (5 * 1024 * 1024 + 1))


def test_extract_text_empty_raises():
    with pytest.raises(CVTextExtractionError):
        extract_text("cv.docx", _docx_bytes("   "))


def test_score_text_quality_flags_short_text():
    quality = score_text_quality("Python")
    assert quality.score < 20
    assert quality.warnings


def test_docling_fallback_triggered_when_fast_text_is_weak():
    class WeakParser:
        method = "pdf_pymupdf"

        def supports(self, filename: str) -> bool:
            return True

        def extract(self, data: bytes) -> str:
            return "x"

    class BetterFallback:
        method = "docling_fallback"

        def supports(self, filename: str) -> bool:
            return True

        def extract(self, data: bytes) -> str:
            return """
            Jean Dupont
            jean@example.com
            Expérience
            Développeur backend 2021 2024
            Formation
            Ecole Ingénieur 2018
            Compétences
            Python, Java
            Langues
            Français, Anglais
            """

    result = extract_text_with_metadata(
        "cv.pdf",
        b"%PDF",
        parsers=[WeakParser()],
        fallback_parser=BetterFallback(),
    )
    assert result.method == "docling_fallback"


def test_parse_llm_json_invalid_raises():
    with pytest.raises(CVLLMExtractionError):
        parse_llm_json_strict("{not-json")


def test_ambiguous_identity_needs_review():
    text = "Jean Dupont\nDéveloppeur\njean@example.com\nExpérience\nBackend 2020 2022"
    proposal = build_structured_proposal(
        text,
        "cv.pdf",
        "hash",
        TextExtractionResult(text=text, method="pdf_pymupdf"),
        score_text_quality(text),
        {},
    )
    assert proposal.identity.first_name.needs_review is True


def test_structured_parser_builds_cv_blocks_for_mohamed_sample():
    text = (
        "Mohamed Gassem\n"
        "Data Scientist Freelance: Computer Vision, Gen AI/RAG, ML Engineering\n"
        "+ Lyon, France\n"
        "# mohamed.gassem@gmail.com\n"
        "06 51 97 58 45\n"
        "Fran\u00e7ais (natif), Anglais (courant - C1)\n"
        "Experiences\n"
        "Freelance, Data Scientist / ML Engineer\n"
        "Lyon, FR\n"
        "Mars 2026 - Actuel\n"
        "\u2022 Mission actuelle pour un acteur industriel automobile.\n"
        "JTEKT Europe, Data scientist\n"
        "Lyon, FR\n"
        "Mai 2023 \u2013 Fev 2026\n"
        "\u2022 Computer vision industrielle.\n"
        "Formation\n"
        "Polytech Lyon Dipl\u00f4me d'ing\u00e9nieur en Math\u00e9matiques appliqu\u00e9es\n"
        "Sept 2018 \u2013 Sept 2021\n"
        "Technologies\n"
        "\u2022 Langages : Python, SQL, C/C++\n"
        "\u2022 Machine Learning & Deep Learning : scikit-learn, PyTorch, TensorFlow\n"
        "\u2022 Applications & d\u00e9ploiement : FastAPI, Streamlit, Docker, Git, Azure, AWS\n"
    )
    proposal = build_structured_proposal(
        text,
        "cv.pdf",
        "hash",
        TextExtractionResult(text=text, method="pdf_pymupdf"),
        score_text_quality(text),
        _skill_index(["Python", "SQL", "PyTorch", "Docker", "FastAPI", "scikit-learn"]),
    )

    assert proposal.identity.first_name.value == "Mohamed"
    assert proposal.identity.last_name.value == "Gassem"
    assert proposal.identity.email.value == "mohamed.gassem@gmail.com"
    assert proposal.identity.phone.value == "06 51 97 58 45"
    assert proposal.identity.title.value is not None

    assert len(proposal.experiences) == 2
    freelance = proposal.experiences[0]
    assert freelance.client_name.value == "Freelance"
    assert freelance.role.value == "Data Scientist / ML Engineer"
    assert freelance.start_date.value == "2026-03"
    assert freelance.end_date.value is None
    assert freelance.end_date.needs_review is True

    jtekt = proposal.experiences[1]
    assert jtekt.client_name.value == "JTEKT Europe"
    assert jtekt.start_date.value == "2023-05"
    assert jtekt.end_date.value == "2026-02"

    assert proposal.education[0].school.value == "Polytech Lyon"
    assert proposal.education[0].degree.value is not None
    assert proposal.education[0].start_date.value == "2018-09"

    languages = {language.name.value: language.level.value for language in proposal.languages}
    assert languages == {"FranÃ§ais": "native", "Anglais": "C1"} or languages == {
        "Français": "native",
        "Anglais": "C1",
    }

    skill_names = {skill.name for skill in proposal.skills if skill.name}
    assert {"Python", "SQL", "PyTorch", "Docker", "FastAPI", "scikit-learn"} <= skill_names
    assert "Python" not in {language.name.value for language in proposal.languages}


def test_skill_category_lines_are_split_without_generic_prefixes():
    python = SkillEntry(id=uuid4(), name="Python", kind=SkillKind.technical)
    machine_learning = SkillEntry(id=uuid4(), name="Machine Learning", kind=SkillKind.technical)
    deep_learning = SkillEntry(id=uuid4(), name="Deep Learning", kind=SkillKind.technical)
    scikit = SkillEntry(id=uuid4(), name="scikit-learn", kind=SkillKind.technical)
    fastapi = SkillEntry(id=uuid4(), name="FastAPI", kind=SkillKind.technical)
    index = {
        "python": python,
        "machine learning": machine_learning,
        "deep learning": deep_learning,
        "scikit learn": scikit,
        "fastapi": fastapi,
    }
    text = """
    Jean Dupont
    jean@example.com
    Compétences
    Langages : Python
    Machine Learning & Deep Learning : scikit-learn
    Applications & déploiement : FastAPI
    """
    proposal = build_structured_proposal(
        text,
        "cv.pdf",
        "hash",
        TextExtractionResult(text=text, method="pdf_pymupdf"),
        score_text_quality(text),
        index,
    )

    labels = {skill.name or skill.original_label for skill in proposal.skills}
    original_labels = {skill.original_label for skill in proposal.skills}
    assert "Langages : Python" not in original_labels
    assert "Applications & déploiement" not in original_labels
    assert {"Python", "Machine Learning", "Deep Learning", "scikit-learn", "FastAPI"} <= labels


def test_cv_content_not_logged(caplog: pytest.LogCaptureFixture):
    secret_text = "Jean Dupont secret CV content"
    score_text_quality(secret_text)
    assert secret_text not in caplog.text


async def test_missing_proposal_table_becomes_service_error(monkeypatch: pytest.MonkeyPatch):
    class FakeDb:
        def __init__(self) -> None:
            self.add = Mock()
            self.rolled_back = False

        async def commit(self) -> None:
            raise ProgrammingError(
                "INSERT INTO cv_extraction_proposals",
                {},
                Exception("UndefinedTableError: relation cv_extraction_proposals does not exist"),
            )

        async def rollback(self) -> None:
            self.rolled_back = True

    from services import cv_parser_service

    text = (
        "Jean Dupont\njean@example.com\nExpérience\nBackend 2020 2024\n"
        "Formation\nEcole 2018\nCompétences\nPython"
    )
    monkeypatch.setattr(
        cv_parser_service,
        "extract_text_with_metadata",
        lambda *args, **kwargs: TextExtractionResult(text=text, method="pdf_pymupdf"),
    )
    db = FakeDb()

    with pytest.raises(CVPersistenceUnavailableError):
        await cv_parser_service.parse_and_store_cv_proposal(
            uuid4(),
            "cv.pdf",
            b"%PDF",
            db,  # type: ignore[arg-type]
            index={},
        )
    assert db.rolled_back is True


def test_match_skills_in_index_matches_and_dedupes():
    python = SkillEntry(id=uuid4(), name="Python", kind=SkillKind.technical)
    teamwork = SkillEntry(id=uuid4(), name="travail en équipe", kind=SkillKind.soft)
    index = {
        "python": python,
        "py": python,
        "travail en equipe": teamwork,
    }
    matched = match_skills_in_index("J'ai fait du Python. Travail en équipe.", index)
    assert {e.name for e in matched} == {"Python", "travail en équipe"}


def test_match_skills_in_index_no_match():
    index = {"python": SkillEntry(id=uuid4(), name="Python", kind=SkillKind.technical)}
    assert match_skills_in_index("Rien de pertinent ici", index) == []
