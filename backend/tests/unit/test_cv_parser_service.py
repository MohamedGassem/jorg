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
from services.cv.date_parser import _parse_date_range, _parse_date_range_at
from services.cv.exceptions import (
    CVLLMExtractionError,
    CVPersistenceUnavailableError,
    CVTextExtractionError,
    CVTooLargeError,
    UnsupportedCVFormatError,
)
from services.cv.experience_parser import (
    ExperienceBlockParser,
    _merge_wrapped_lines,
    _parse_header_fields,
    _split_description_and_achievements,
)
from services.cv.language_parser import LanguageParser
from services.cv.llm_extraction import parse_llm_json_strict
from services.cv.proposal_builder import build_structured_proposal
from services.cv.quality import score_text_quality
from services.cv.schemas import (
    DocumentLine,
    TextExtractionResult,
)
from services.cv.skill_matching import SkillEntry, match_skills_in_index, normalize_skill_label
from services.cv.text_extraction import (
    _join_spans,
    _span_text_from_chars,
    extract_text,
    extract_text_with_metadata,
)


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


def test_span_joining_inserts_space_when_gap_exists():
    """Bug 2: adjacent spans with visual gap but no space character must be space-separated."""
    spans = [
        {"text": "Polytech", "bbox": (50.0, 100.0, 100.0, 112.0)},
        {"text": "Lyon", "bbox": (103.0, 100.0, 130.0, 112.0)},
    ]
    result = _join_spans(spans)
    assert result == "Polytech Lyon", f"expected space inserted, got: {result!r}"


def test_span_joining_no_extra_space_when_already_spaced():
    """_join_spans should not double-space when span text already ends with a space."""
    spans = [
        {"text": "Polytech ", "bbox": (50.0, 100.0, 103.0, 112.0)},
        {"text": "Lyon", "bbox": (103.0, 100.0, 130.0, 112.0)},
    ]
    result = _join_spans(spans)
    assert result == "Polytech Lyon", f"expected single space, got: {result!r}"


def test_span_joining_no_space_when_no_gap():
    """_join_spans must NOT insert a space when spans are visually adjacent (no gap)."""
    spans = [
        {"text": "fast", "bbox": (50.0, 100.0, 68.0, 112.0)},
        {"text": "API", "bbox": (68.0, 100.0, 85.0, 112.0)},
    ]
    result = _join_spans(spans)
    assert result == "fastAPI", f"expected no space, got: {result!r}"


def test_date_range_aujourdhui_means_current():
    from services.cv.date_parser import _parse_date_range

    date_range = _parse_date_range("Mai 2023 – Aujourd’hui")  # noqa: RUF001
    assert date_range is not None
    assert date_range.start == "2023-05"
    assert date_range.end is None
    assert date_range.is_current is True


def _char(c: str, x0: float, x1: float) -> dict:
    return {"c": c, "bbox": (x0, 100.0, x1, 112.0)}


def test_span_chars_glued_words_get_spaces_from_glyph_gaps():
    """Justified PDFs encode word gaps as glyph offsets without space chars (gap ~0.14 x size)."""
    span = {
        "size": 10.0,
        "chars": [
            _char("v", 50.0, 55.0),
            _char("i", 55.0, 58.0),
            _char("a", 58.0, 63.0),
            _char("N", 64.4, 70.0),  # 1.4 pt gap = word boundary
            _char("L", 70.0, 75.0),
            _char("P", 75.0, 80.0),
        ],
    }
    assert _span_text_from_chars(span) == "via NLP"


def test_span_chars_kerning_gap_does_not_insert_space():
    span = {
        "size": 10.0,
        "chars": [
            _char("f", 50.0, 55.0),
            _char(")", 55.5, 58.0),  # 0.5 pt kerning gap, below 0.1 x size threshold...
        ],
    }
    assert _span_text_from_chars(span) == "f)"


def test_span_chars_existing_space_not_doubled():
    span = {
        "size": 10.0,
        "chars": [
            _char("a", 50.0, 55.0),
            _char(" ", 55.0, 60.0),
            _char("b", 61.5, 66.0),
        ],
    }
    assert _span_text_from_chars(span) == "a b"


def _line(text: str, index: int, x0: float) -> DocumentLine:
    return DocumentLine(text=text, line_index=index, x0=x0, y0=float(index) * 12, x1=x0 + 100)


def test_two_column_layout_keeps_each_job_content_in_its_own_block():
    """Real-CV layout: dates in a right column interleave with the next job's header."""
    lines = [
        _line("Freelance, Data Scientist / ML Engineer", 0, 59.5),
        _line("Lyon, FR", 1, 517.4),
        _line("Mars 2026 - Actuel", 2, 477.6),
        _line("• Mission actuelle : développement d'une solution de", 3, 72.8),
        _line("computer vision pour la détection d'objets.", 4, 80.8),
        _line("JTEKT Europe, Data scientist", 5, 59.5),
        _line("Lyon, FR", 6, 517.4),
        _line("Mai 2023 – Fev 2026", 7, 470.9),  # noqa: RUF001
        _line("• Computer vision industrielle : automatisation.", 8, 72.8),
        _line("Ynov Campus, Intervenant Enseignant", 9, 59.5),
        _line("• Enseignement d'un module de 72h sur le RL.", 10, 72.8),
        _line("Lyon, FR", 11, 517.4),
        _line("Dec 2022 – Jan 2023", 12, 469.2),  # noqa: RUF001
    ]
    experiences = ExperienceBlockParser().parse(lines)

    assert [e.client_name.value for e in experiences] == [
        "Freelance",
        "JTEKT Europe",
        "Ynov Campus",
    ]
    freelance, jtekt, ynov = experiences
    assert freelance.achievements[0].value == (
        "Mission actuelle : développement d'une solution de "
        "computer vision pour la détection d'objets."
    )
    jtekt_achievements = " ".join(a.value for a in jtekt.achievements)
    assert "Ynov" not in jtekt_achievements
    assert "Enseignement" not in jtekt_achievements
    assert ynov.achievements[0].value == "Enseignement d'un module de 72h sur le RL."
    assert ynov.start_date.value == "2022-12"


def test_header_segmentation_falls_back_without_position_data():
    """Lines without x0 (DOCX, plain text) must keep using date-based segmentation."""
    lines = [
        DocumentLine(text="Freelance, Data Scientist", line_index=0),
        DocumentLine(text="Mars 2024 - Actuel", line_index=1),
        DocumentLine(text="• Mission de computer vision.", line_index=2),
    ]
    experiences = ExperienceBlockParser().parse(lines)
    assert len(experiences) == 1
    assert experiences[0].client_name.value == "Freelance"


def test_multiline_bullet_continuation_not_truncated_when_company_known():
    """Bug 1-B: continuation line dropped by _is_description_line (company detected from before)."""
    lines = [
        DocumentLine(text="Freelance, Data Scientist / ML Engineer", line_index=0),
        DocumentLine(text="Mars 2024 - Actuel", line_index=1),
        DocumentLine(
            text="• Mission actuelle pour un acteur industriel automobile : développement d'une solution de",
            line_index=2,
        ),
        DocumentLine(text="traitement d'images sur des données industrielles.", line_index=3),
    ]
    experiences = ExperienceBlockParser().parse(lines)
    assert len(experiences) == 1
    assert experiences[0].achievements, "achievements should not be empty"
    full_text = experiences[0].achievements[0].value
    assert "traitement d'images" in full_text, (
        f"continuation line was truncated; got: {full_text!r}"
    )


def test_multiline_bullet_continuation_not_stolen_as_company():
    """Bug 1-A: continuation line incorrectly consumed as company_after when no header before date."""
    lines = [
        DocumentLine(text="Mars 2024 - Actuel", line_index=0),
        DocumentLine(
            text="• Mission actuelle pour un acteur industriel automobile : développement d'une solution de",
            line_index=1,
        ),
        DocumentLine(text="traitement d'images sur des données industrielles.", line_index=2),
    ]
    experiences = ExperienceBlockParser().parse(lines)
    assert len(experiences) == 1
    exp = experiences[0]
    if exp.client_name and exp.client_name.value:
        assert "traitement" not in exp.client_name.value.lower(), (
            f"continuation line was mis-identified as company: {exp.client_name.value!r}"
        )
    assert exp.achievements, "achievements should not be empty"
    full_text = exp.achievements[0].value
    assert "traitement d'images" in full_text, (
        f"continuation line was lost; got achievement: {full_text!r}"
    )


# --- Sprint "experience extraction robustness" ---------------------------------


def test_header_fields_role_with_contract_and_parenthetical_comma():
    fields = _parse_header_fields(
        "Responsable Métallurgiste Fonderie en CDI (Qualité, Process en fonderie et filage)"
    )
    assert fields.contract_type == "CDI"
    assert (
        fields.role == "Responsable Métallurgiste Fonderie (Qualité, Process en fonderie et filage)"
    )
    assert fields.company is None


def test_header_fields_company_comma_role():
    fields = _parse_header_fields("JTEKT Europe, Data scientist")
    assert fields.company == "JTEKT Europe"
    assert fields.role == "Data scientist"


def test_header_fields_role_comma_company_when_role_keyword_left():
    fields = _parse_header_fields("Responsable Qualité, Constellium")
    assert fields.role == "Responsable Qualité"
    assert fields.company == "Constellium"


def test_header_fields_company_comma_location():
    fields = _parse_header_fields("EHPAD Albert Morlot, Décines 69")
    assert fields.company == "EHPAD Albert Morlot"
    assert fields.location == "Décines 69"
    assert fields.role is None


def test_header_fields_role_chez_company():
    fields = _parse_header_fields("Développeur Python chez Google")
    assert fields.role == "Développeur Python"
    assert fields.company == "Google"


def test_header_fields_dash_role_company_location():
    fields = _parse_header_fields("Data Engineer - Capgemini - Lyon")
    assert fields.role == "Data Engineer"
    assert fields.company == "Capgemini"
    assert fields.location == "Lyon"


def test_header_fields_contract_dash_role_dash_company():
    fields = _parse_header_fields("Stage - Data Scientist - Airbus")
    assert fields.contract_type == "Stage"
    assert fields.role == "Data Scientist"
    assert fields.company == "Airbus"


def test_header_fields_multi_contract():
    fields = _parse_header_fields("Ingénieur Projet en alternance et CDD (Logistique)")
    assert fields.contract_type == "Alternance et CDD"
    assert fields.role == "Ingénieur Projet (Logistique)"


def test_date_range_slash_full_months():
    date_range = _parse_date_range("OCTOBRE 2023/JUIN 2024")
    assert (date_range.start, date_range.end) == ("2023-10", "2024-06")


def test_date_range_slash_month_pair_shared_year():
    date_range = _parse_date_range("MARS/MAI 2023")
    assert (date_range.start, date_range.end) == ("2023-03", "2023-05")


def test_date_range_slash_years():
    date_range = _parse_date_range("2023/2024")
    assert (date_range.start, date_range.end) == ("2023", "2024")


def test_date_range_depuis_is_current():
    date_range = _parse_date_range("DEPUIS JANVIER 2025")
    assert date_range.start == "2025-01"
    assert date_range.end is None
    assert date_range.is_current is True


def test_date_range_wrapped_year_with_interleaved_line():
    lines = [
        DocumentLine(text="SEPTEMBRE/DÉCEMBRE", line_index=0),
        DocumentLine(text="Jailleu 38", line_index=1),
        DocumentLine(text="2022", line_index=2),
    ]
    date_range = _parse_date_range_at(lines, 0)
    assert date_range is not None
    assert (date_range.start, date_range.end) == ("2022-09", "2022-12")


def test_date_range_wrapped_dash_year():
    lines = [
        DocumentLine(text="sept. 2023 – mars", line_index=0),  # noqa: RUF001
        DocumentLine(text="2025", line_index=1),
    ]
    date_range = _parse_date_range_at(lines, 0)
    assert (date_range.start, date_range.end) == ("2023-09", "2025-03")


def test_date_range_single_month_line():
    lines = [DocumentLine(text="AOÛT 2025", line_index=0)]
    date_range = _parse_date_range_at(lines, 0)
    assert (date_range.start, date_range.end) == ("2025-08", "2025-08")


def _bline(text: str, is_bold: bool = False) -> DocumentLine:
    return DocumentLine(text=text, line_index=0, is_bold=is_bold)


def test_merge_wrapped_lines_rebuilds_hyphenated_word():
    items = _merge_wrapped_lines(
        [
            _bline("Coordination de la qualité : gestion des four-", is_bold=True),
            _bline("nisseurs et des audits."),
        ]
    )
    assert items == ["Coordination de la qualité : gestion des fournisseurs et des audits."]


def test_merge_wrapped_lines_keeps_hyphen_for_compound_names():
    items = _merge_wrapped_lines(
        [
            _bline("Qualifications clients (Airbus, Safran, Rolls-", is_bold=True),
            _bline("Royce)."),
        ]
    )
    assert items == ["Qualifications clients (Airbus, Safran, Rolls-Royce)."]


def test_merge_wrapped_lines_folds_lowercase_continuation():
    items = _merge_wrapped_lines(
        [
            _bline("Conduite de projet : rédaction de rapports (français et", is_bold=True),
            _bline("anglais), participation aux lancements"),
            _bline("Normes et standards : assurances qualité.", is_bold=True),
        ]
    )
    assert items == [
        "Conduite de projet : rédaction de rapports (français et anglais), "
        "participation aux lancements",
        "Normes et standards : assurances qualité.",
    ]


def test_merge_wrapped_lines_new_item_after_terminal_punctuation():
    items = _merge_wrapped_lines(
        [
            _bline("Optimisation des espaces de stockage."),
            _bline("Amélioration de la traçabilité et gain de 80% de temps."),
        ]
    )
    assert len(items) == 2


def _cline(
    text: str, index: int, x0: float, y0: float, *, bold: bool = False, size: float = 10.0
) -> DocumentLine:
    return DocumentLine(
        text=text, line_index=index, x0=x0, y0=y0, x1=x0 + 200, font_size=size, is_bold=bold
    )


def test_cedric_layout_headers_companies_and_wrapped_lines():
    """Layout without bullets: bold role header, company line below, indented content."""
    lines = [
        _cline(
            "Responsable Métallurgiste Fonderie en CDI (Qualité, Process)", 0, 42.5, 218, bold=True
        ),
        _cline("sept. 2023 – mars", 1, 476.2, 218),  # noqa: RUF001
        _cline("2025", 2, 42.5, 230),
        _cline("Constellium Montreuil-Juigné (Production), Angers", 3, 42.5, 242),
        _cline("Coordination de la qualité : gestion des four-", 4, 60.5, 254, bold=True),
        _cline("nisseurs.", 5, 60.5, 266),
        _cline("Ingénieur R&D en stage (Métallurgie)", 6, 42.5, 407, bold=True),
        _cline("mars 2022 – août 2022", 7, 454.2, 407),  # noqa: RUF001
        _cline("ArcelorMittal Industeel, Le Creusot", 8, 42.5, 419),
        _cline("Métallurgie : Caractérisation des aciers.", 9, 60.5, 431, bold=True),
    ]
    experiences = ExperienceBlockParser().parse(lines)

    assert len(experiences) == 2
    first, second = experiences
    assert first.role.value == "Responsable Métallurgiste Fonderie (Qualité, Process)"
    assert first.contract_type.value == "CDI"
    assert first.client_name.value == "Constellium Montreuil-Juigné (Production)"
    assert first.location.value == "Angers"
    assert first.start_date.value == "2023-09"
    assert first.end_date.value == "2025-03"
    assert first.achievements[0].value == "Coordination de la qualité : gestion des fournisseurs."
    assert second.client_name.value == "ArcelorMittal Industeel"
    assert second.location.value == "Le Creusot"
    assert second.contract_type.value == "Stage"
    all_achievements = [a.value for a in first.achievements + second.achievements]
    assert "Angers" not in all_achievements
    assert "Le Creusot" not in all_achievements


def test_ehpad_layout_date_above_header_and_next_job_truncation():
    """Date-based fallback: bold headers y-aligned with their date, next job excluded."""
    lines = [
        _cline("Cabinet Libéral, Lyon 69", 0, 175.7, 475.8, bold=True, size=12),
        _cline("MARS/MAI 2023", 1, 486.8, 475.8, bold=True, size=12),
        _cline("Participation aux séances individuelles", 2, 184.7, 492.5, size=12),
        _cline("IME Paul Cézanne, Tournus 71", 3, 175.7, 518.1, bold=True, size=12),
        _cline("JANVIER/MARS 2023", 4, 463.7, 518.1, bold=True, size=12),
        _cline("Participation aux séances en salle", 5, 184.7, 534.8, size=12),
    ]
    experiences = ExperienceBlockParser().parse(lines)

    assert len(experiences) == 2
    first, second = experiences
    assert first.client_name.value == "Cabinet Libéral"
    assert first.location.value == "Lyon 69"
    assert [a.value for a in first.achievements] == ["Participation aux séances individuelles"]
    assert second.client_name.value == "IME Paul Cézanne"
    assert second.location.value == "Tournus 71"
    achievements_text = " ".join(a.value for a in first.achievements)
    assert "IME" not in achievements_text


def test_two_column_sidebar_reads_main_column_first():
    from services.cv.text_extraction import _order_lines_in_columns

    def line(text: str, index: int, x0: float, x1: float, y0: float) -> DocumentLine:
        return DocumentLine(text=text, line_index=index, x0=x0, x1=x1, y0=y0)

    sidebar = [line(f"sidebar {i}", i, 14.0, 150.0, 100.0 + i * 20) for i in range(5)]
    main = [
        line(f"main content line {i} with much more text", 5 + i, 165.0, 560.0, 80.0 + i * 20)
        for i in range(6)
    ]
    interleaved = [item for pair in zip(main[:5], sidebar, strict=False) for item in pair] + [
        main[5]
    ]
    ordered = _order_lines_in_columns(interleaved)

    texts = [item.text for item in ordered]
    assert texts[:6] == [f"main content line {i} with much more text" for i in range(6)]
    assert texts[6:] == [f"sidebar {i}" for i in range(5)]


def test_single_column_with_right_aligned_dates_is_not_split():
    from services.cv.text_extraction import _order_lines_in_columns

    def line(text: str, index: int, x0: float, x1: float) -> DocumentLine:
        return DocumentLine(text=text, line_index=index, x0=x0, x1=x1, y0=float(index) * 12)

    lines = [
        line("Header company", 0, 59.5, 300.0),
        line("Mars 2026 - Actuel", 1, 477.6, 553.0),
        line("• Achievement text spanning most of the page width", 2, 72.8, 540.0),
    ] * 4
    ordered = _order_lines_in_columns(
        [li.model_copy(update={"line_index": i}) for i, li in enumerate(lines)]
    )
    assert [item.text for item in ordered] == [item.text for item in lines]


def test_cv_orchestration_service_exports_public_api() -> None:
    for name in (
        "parse_cv",
        "parse_and_store_cv_proposal",
    ):
        assert callable(getattr(cv_parser_service, name))
