"""Pure unit tests for CV parsing helpers, no DB."""

import io
from unittest.mock import Mock
from uuid import uuid4

import pytest
from docx import Document
from sqlalchemy.exc import ProgrammingError

import services.cv.cv_parser_service as cv_parser_service
from models.skill import SkillKind
from services.cv.contact_parser import extract_contact
from services.cv.exceptions import (
    CVLLMExtractionError,
    CVPersistenceUnavailableError,
    CVTextExtractionError,
    CVTooLargeError,
    UnsupportedCVFormatError,
)
from services.cv.experience_parser import _split_description_and_achievements
from services.cv.language_parser import LanguageParser
from services.cv.llm_extraction import parse_llm_json_strict
from services.cv.proposal_builder import build_structured_proposal
from services.cv.quality import score_text_quality
from services.cv.schemas import (
    DocumentLine,
    TextExtractionResult,
)
from services.cv.skill_matching import SkillEntry, match_skills_in_index, normalize_skill_label
from services.cv.text_extraction import extract_text, extract_text_with_metadata


def _skill_index(names: list[str]) -> dict[str, SkillEntry]:
    return {
        normalize_skill_label(name): SkillEntry(id=uuid4(), name=name, kind=SkillKind.technical)
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


def test_extract_text_pdf_uses_pymupdf(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.cv.text_extraction._extract_pdf_layout",
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
        _skill_index(["Python", "SQL", "C++", "PyTorch", "Docker", "FastAPI", "scikit-learn"]),
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
    assert freelance.is_current is True

    jtekt = proposal.experiences[1]
    assert jtekt.client_name.value == "JTEKT Europe"
    assert jtekt.start_date.value == "2023-05"
    assert jtekt.end_date.value == "2026-02"
    assert jtekt.is_current is False

    assert proposal.education[0].school.value == "Polytech Lyon"
    assert proposal.education[0].degree.value is not None
    assert proposal.education[0].start_date.value == "2018-09"

    languages = {language.name.value: language.level.value for language in proposal.languages}
    assert languages == {"Français": "native", "Anglais": "C1"}

    skill_names = {skill.name for skill in proposal.skills if skill.name}
    assert {"Python", "SQL", "C++", "PyTorch", "Docker", "FastAPI", "scikit-learn"} <= skill_names
    assert "Python" not in {language.name.value for language in proposal.languages}


def test_symbolic_skill_labels_keep_distinct_meaning() -> None:
    cpp = SkillEntry(id=uuid4(), name="C++", kind=SkillKind.technical)
    csharp = SkillEntry(id=uuid4(), name="C#", kind=SkillKind.technical)
    dotnet = SkillEntry(id=uuid4(), name=".NET", kind=SkillKind.technical)
    index = {
        normalize_skill_label("C++"): cpp,
        normalize_skill_label("C#"): csharp,
        normalize_skill_label(".NET"): dotnet,
    }

    matched = match_skills_in_index("Langages : C/C++, C# et .NET", index)

    assert {skill.name for skill in matched} == {"C++", "C#", ".NET"}


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


def test_cv_content_not_logged(caplog: pytest.LogCaptureFixture) -> None:
    secret_text = "Jean Dupont secret CV content"
    score_text_quality(secret_text)
    assert secret_text not in caplog.text


async def test_missing_proposal_table_becomes_service_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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

    text = (
        "Jean Dupont\njean@example.com\nExpérience\nBackend 2020 2024\n"
        "Formation\nEcole 2018\nCompétences\nPython"
    )
    monkeypatch.setattr(
        "services.cv.cv_parser_service.extract_text_with_metadata",
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


def test_split_bullets_keeps_preamble_as_description():
    description, achievements = _split_description_and_achievements(
        [
            "Au sein de l'équipe data, en charge de la plateforme.",
            "• Migration vers FastAPI",
            "• Réduction du temps de traitement de 30%",
        ]
    )
    assert description == "Au sein de l'équipe data, en charge de la plateforme."
    assert achievements == ["Migration vers FastAPI", "Réduction du temps de traitement de 30%"]


def test_split_bullets_folds_wrapped_line_into_previous_achievement():
    description, achievements = _split_description_and_achievements(
        [
            "- Conception d'un pipeline de traitement",
            "temps réel pour 3 usines",
            "- Encadrement de 2 alternants",
        ]
    )
    assert description is None
    assert achievements == [
        "Conception d'un pipeline de traitement temps réel pour 3 usines",
        "Encadrement de 2 alternants",
    ]


def test_split_without_glyphs_makes_one_achievement_per_line():
    description, achievements = _split_description_and_achievements(
        [
            "Responsable du suivi budgétaire de 3 agences",
            "Animation de comités hebdomadaires",
            "Reporting mensuel à la direction",
        ]
    )
    assert description is None
    assert achievements == [
        "Responsable du suivi budgétaire de 3 agences",
        "Animation de comités hebdomadaires",
        "Reporting mensuel à la direction",
    ]


def test_split_empty_block_returns_nothing():
    assert _split_description_and_achievements(["   ", ""]) == (None, [])


def test_language_level_stays_attached_to_language_across_dash():
    lines = [DocumentLine(text="Anglais - C1, Espagnol - B2", line_index=0)]
    parsed = {
        language.name.value: language.level.value for language in LanguageParser().parse(lines)
    }
    assert parsed == {"Anglais": "C1", "Espagnol": "B2"}


def test_cv_orchestration_service_exports_public_api() -> None:
    for name in (
        "parse_cv",
        "parse_and_store_cv_proposal",
    ):
        assert callable(getattr(cv_parser_service, name))
