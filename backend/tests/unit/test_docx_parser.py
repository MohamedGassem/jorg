# backend/tests/unit/test_docx_parser.py
import tempfile

from docx import Document  # type: ignore[import-untyped,unused-ignore]

from services.docx_parser import extract_placeholders


def _make_docx(paragraphs: list[str]) -> str:
    """Create a temporary .docx file with the given paragraphs, return path."""
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        doc.save(tmp.name)
        return tmp.name


def test_extract_simple_placeholders() -> None:
    path = _make_docx(["Nom: {{NOM}}", "Prénom: {{PRENOM}}", "Titre: {{TITRE}}"])
    result = extract_placeholders(path)
    assert "{{NOM}}" in result
    assert "{{PRENOM}}" in result
    assert "{{TITRE}}" in result
    assert len(result) == 3


def test_extract_deduplicates_repeated_placeholders() -> None:
    path = _make_docx(["{{NOM}} et {{NOM}} encore {{NOM}}"])
    result = extract_placeholders(path)
    assert result.count("{{NOM}}") == 1


def test_extract_block_markers_are_excluded() -> None:
    """Block markers like {{#EXPERIENCES}} / {{/EXPERIENCES}} are mustache
    control syntax, not data placeholders — they must not be returned."""
    path = _make_docx(["{{#EXPERIENCES}}", "{{EXP_CLIENT}}", "{{/EXPERIENCES}}"])
    result = extract_placeholders(path)
    assert "{{#EXPERIENCES}}" not in result
    assert "{{/EXPERIENCES}}" not in result
    assert "{{EXP_CLIENT}}" in result
    assert result == ["{{EXP_CLIENT}}"]


def test_extract_block_markers_excluded_for_any_block_name() -> None:
    """The filter must apply to any {{#NAME}} / {{/NAME}} pair, not just EXPERIENCES."""
    path = _make_docx(["{{#SKILLS}}", "{{SKILL_NAME}}", "{{/SKILLS}}"])
    result = extract_placeholders(path)
    assert result == ["{{SKILL_NAME}}"]


def test_extract_empty_document_returns_empty_list() -> None:
    path = _make_docx(["No placeholders here."])
    result = extract_placeholders(path)
    assert result == []


def test_extract_preserves_first_occurrence_order() -> None:
    path = _make_docx(["{{A}} {{B}} {{C}} {{A}}"])
    result = extract_placeholders(path)
    assert result == ["{{A}}", "{{B}}", "{{C}}"]


# ---- docxtpl / Jinja2 syntax (new templates) ---------------------------------


def test_jinja2_block_tags_not_matched() -> None:
    """Jinja2 block tags {%p for ... %} use {%, not {{, so they are never
    matched by the placeholder regex and never appear in detected placeholders."""
    path = _make_docx(
        [
            "{%p for exp in experiences %}",
            "{{exp.role}}",
            "{%p endfor %}",
        ]
    )
    result = extract_placeholders(path)
    assert not any("{%p" in r for r in result)
    assert not any("{%tr" in r for r in result)


def test_jinja2_loop_variables_are_excluded() -> None:
    """Loop variables {{exp.*}} and {{sk.*}} are not standalone mappable fields
    — they are resolved inside {%p for ... %} blocks."""
    path = _make_docx(
        [
            "{%p for exp in experiences %}",
            "{{exp.client_name}} — {{exp.role}}",
            "{{exp.start_date}} / {{exp.technologies}}",
            "{%p endfor %}",
            "{%p for sk in skills %}",
            "{{sk.name}} ({{sk.category}})",
            "{%p endfor %}",
        ]
    )
    result = extract_placeholders(path)
    assert not any(r.startswith("{{exp.") for r in result)
    assert not any(r.startswith("{{sk.") for r in result)


def test_profile_fields_detected_alongside_jinja2_blocks() -> None:
    """Top-level profile fields are still detected even when the template also
    uses Jinja2 blocks for experiences or skills."""
    path = _make_docx(
        [
            "{{last_name}} {{first_name}}",
            "{{title}}",
            "{%p for exp in experiences %}",
            "{{exp.role}} chez {{exp.client_name}}",
            "{%p endfor %}",
        ]
    )
    result = extract_placeholders(path)
    assert "{{last_name}}" in result
    assert "{{first_name}}" in result
    assert "{{title}}" in result
    assert not any(r.startswith("{{exp.") for r in result)


def test_standard_field_names_detected() -> None:
    """All standard profile field names used directly in a docxtpl template
    are surfaced as detected placeholders."""
    path = _make_docx(
        [
            "{{first_name}} {{last_name}}",
            "{{title}} — {{location}}",
            "TJM : {{daily_rate}} € | Salaire : {{annual_salary}} €",
            "{{availability_status}} / {{work_mode}}",
        ]
    )
    result = extract_placeholders(path)
    for field in [
        "{{first_name}}",
        "{{last_name}}",
        "{{title}}",
        "{{location}}",
        "{{daily_rate}}",
        "{{annual_salary}}",
        "{{availability_status}}",
        "{{work_mode}}",
    ]:
        assert field in result, f"{field} not detected"
