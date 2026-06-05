# backend/tests/unit/test_docx_generator.py
"""Integration tests for generate_document — new docxtpl syntax."""

import io
import tempfile
from datetime import date
from unittest.mock import MagicMock

from docx import Document

from services.docx_engine import generate_document


def _make_docx_path(paragraphs: list[str]) -> str:
    doc = Document()
    for text in paragraphs:
        doc.add_paragraph(text)
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        doc.save(tmp.name)
        return tmp.name


def _mock_profile(**kwargs: object) -> MagicMock:
    defaults: dict[str, object] = {
        "first_name": "Alice",
        "last_name": "Martin",
        "title": "Software Engineer",
        "summary": "Senior developer with 8 years of experience",
        "phone": "0601020304",
        "email_contact": "alice@test.com",
        "linkedin_url": "https://linkedin.com/in/alice",
        "location": "Paris",
        "years_of_experience": 8,
        "daily_rate": 600,
        "annual_salary": None,
        "availability_status": None,
        "work_mode": None,
        "location_preference": None,
        "mission_duration": None,
        "contract_type": None,
        "preferred_domains": None,
    }
    profile = MagicMock()
    for k, v in {**defaults, **kwargs}.items():
        setattr(profile, k, v)
    return profile


def _mock_exp(**kwargs: object) -> MagicMock:
    defaults: dict[str, object] = {
        "client_name": "TechCorp",
        "role": "Backend Developer",
        "start_date": date(2022, 1, 1),
        "end_date": None,
        "is_current": True,
        "description": "Developed REST APIs",
        "context": "Greenfield project",
        "achievements_summary": "Reduced latency by 30%",
    }
    exp = MagicMock()
    for k, v in {**defaults, **kwargs}.items():
        setattr(exp, k, v)
    return exp


# ---------------------------------------------------------------------------
# Simple field replacement — templates now use standard field names directly
# ---------------------------------------------------------------------------


def test_simple_placeholder_replaced() -> None:
    path = _make_docx_path(["Nom: {{last_name}}", "Prénom: {{first_name}}"])
    result = generate_document(path, _mock_profile(), [], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Martin" in texts
    assert "Alice" in texts
    assert "{{last_name}}" not in texts


def test_unknown_field_renders_as_empty() -> None:
    """Undefined Jinja2 variables render as empty string."""
    path = _make_docx_path(["Data: {{ghost_field}}"])
    result = generate_document(path, _mock_profile(), [], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "{{ghost_field}}" not in texts


# ---------------------------------------------------------------------------
# Experience block — paragraph syntax
# ---------------------------------------------------------------------------


def test_experience_block_repeated_per_item() -> None:
    path = _make_docx_path(
        [
            "{%p for exp in experiences %}",
            "{{exp.client_name}} — {{exp.role}}",
            "{%p endfor %}",
        ]
    )
    exp1 = _mock_exp(client_name="Alpha", role="Dev")
    exp2 = _mock_exp(client_name="Beta", role="Lead")
    result = generate_document(path, _mock_profile(), [exp1, exp2], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Alpha" in texts and "Beta" in texts
    assert "{%p" not in texts and "{{" not in texts


def test_no_experiences_removes_block_markers() -> None:
    path = _make_docx_path(
        [
            "Header",
            "{%p for exp in experiences %}",
            "{{exp.client_name}}",
            "{%p endfor %}",
            "Footer",
        ]
    )
    result = generate_document(path, _mock_profile(), [], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Header" in texts and "Footer" in texts
    assert "{%p" not in texts


def test_experience_current_end_date_shows_present() -> None:
    path = _make_docx_path(
        [
            "{%p for exp in experiences %}",
            "{{exp.start_date}} - {{exp.end_date}}",
            "{%p endfor %}",
        ]
    )
    exp = _mock_exp(start_date=date(2022, 6, 1), end_date=None, is_current=True)
    result = generate_document(path, _mock_profile(), [exp], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "06/2022" in texts and "présent" in texts


def test_date_formatted_mm_yyyy() -> None:
    path = _make_docx_path(
        [
            "{%p for exp in experiences %}",
            "{{exp.start_date}} to {{exp.end_date}}",
            "{%p endfor %}",
        ]
    )
    exp = _mock_exp(start_date=date(2021, 3, 15), end_date=date(2023, 11, 1), is_current=False)
    result = generate_document(path, _mock_profile(), [exp], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "03/2021" in texts and "11/2023" in texts


def test_achievements_summary_rendered() -> None:
    path = _make_docx_path(
        [
            "{%p for exp in experiences %}",
            "Summary: {{exp.achievements_summary}}",
            "{%p endfor %}",
        ]
    )
    exp = _mock_exp(achievements_summary="Reduced latency by 40%")
    result = generate_document(path, _mock_profile(), [exp], [])
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Reduced latency by 40%" in texts


def test_generate_replaces_annual_salary_placeholder() -> None:
    import tempfile

    doc = Document()
    doc.add_paragraph("Salaire annuel souhaité : {{annual_salary}} €")
    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        doc.save(tmp.name)
        template_path = tmp.name

    profile = _mock_profile(annual_salary=55000)
    result = generate_document(template_path, profile, [], [])
    out_doc = Document(io.BytesIO(result))
    text = "\n".join(p.text for p in out_doc.paragraphs)
    assert "55000" in text
    assert "{{annual_salary}}" not in text
