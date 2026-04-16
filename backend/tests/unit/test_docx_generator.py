# backend/tests/unit/test_docx_generator.py
import io
import tempfile
from datetime import date
from unittest.mock import MagicMock

from docx import Document  # type: ignore[import-untyped,unused-ignore]

from services.generation_service import generate_document


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
        "achievements": "Reduced latency by 30%",
        "technologies": ["Python", "FastAPI", "PostgreSQL"],
    }
    exp = MagicMock()
    for k, v in {**defaults, **kwargs}.items():
        setattr(exp, k, v)
    return exp


def test_simple_placeholder_replaced() -> None:
    path = _make_docx_path(["Nom: {{NOM}}", "Prénom: {{PRENOM}}"])
    result = generate_document(
        path,
        _mock_profile(),
        [],
        {"{{NOM}}": "last_name", "{{PRENOM}}": "first_name"},
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Martin" in texts
    assert "Alice" in texts
    assert "{{NOM}}" not in texts


def test_unknown_field_replaced_with_empty() -> None:
    path = _make_docx_path(["Data: {{GHOST}}"])
    result = generate_document(path, _mock_profile(), [], {"{{GHOST}}": "nonexistent_field"})
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "{{GHOST}}" not in texts
    assert "Data: " in texts or "Data:" in texts


def test_experience_block_repeated_per_item() -> None:
    path = _make_docx_path(
        [
            "{{#EXPERIENCES}}",
            "{{EXP_CLIENT}} — {{EXP_ROLE}}",
            "{{/EXPERIENCES}}",
        ]
    )
    exp1 = _mock_exp(client_name="Alpha", role="Dev")
    exp2 = _mock_exp(client_name="Beta", role="Lead")
    mappings = {
        "{{EXP_CLIENT}}": "experience.client_name",
        "{{EXP_ROLE}}": "experience.role",
    }
    result = generate_document(path, _mock_profile(), [exp1, exp2], mappings)
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Alpha" in texts
    assert "Beta" in texts
    assert "{{#EXPERIENCES}}" not in texts
    assert "{{/EXPERIENCES}}" not in texts


def test_no_experiences_removes_block_markers() -> None:
    path = _make_docx_path(
        [
            "Header",
            "{{#EXPERIENCES}}",
            "{{EXP_CLIENT}}",
            "{{/EXPERIENCES}}",
            "Footer",
        ]
    )
    result = generate_document(
        path, _mock_profile(), [], {"{{EXP_CLIENT}}": "experience.client_name"}
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "{{#EXPERIENCES}}" not in texts
    assert "{{/EXPERIENCES}}" not in texts
    assert "Header" in texts
    assert "Footer" in texts


def test_experience_current_end_date_shows_present() -> None:
    path = _make_docx_path(
        [
            "{{#EXPERIENCES}}",
            "{{EXP_START}} - {{EXP_END}}",
            "{{/EXPERIENCES}}",
        ]
    )
    exp = _mock_exp(start_date=date(2022, 6, 1), end_date=None, is_current=True)
    mappings = {
        "{{EXP_START}}": "experience.start_date",
        "{{EXP_END}}": "experience.end_date",
    }
    result = generate_document(path, _mock_profile(), [exp], mappings)
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "06/2022" in texts
    assert "présent" in texts


def test_date_formatted_mm_yyyy() -> None:
    path = _make_docx_path(
        [
            "{{#EXPERIENCES}}",
            "{{EXP_START}} to {{EXP_END}}",
            "{{/EXPERIENCES}}",
        ]
    )
    exp = _mock_exp(
        start_date=date(2021, 3, 15),
        end_date=date(2023, 11, 1),
        is_current=False,
    )
    mappings = {
        "{{EXP_START}}": "experience.start_date",
        "{{EXP_END}}": "experience.end_date",
    }
    result = generate_document(path, _mock_profile(), [exp], mappings)
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "03/2021" in texts
    assert "11/2023" in texts


def test_technologies_joined_as_string() -> None:
    path = _make_docx_path(
        [
            "{{#EXPERIENCES}}",
            "Stack: {{EXP_TECH}}",
            "{{/EXPERIENCES}}",
        ]
    )
    exp = _mock_exp(technologies=["Python", "FastAPI", "Redis"])
    result = generate_document(
        path, _mock_profile(), [exp], {"{{EXP_TECH}}": "experience.technologies"}
    )
    doc = Document(io.BytesIO(result))
    texts = " ".join(p.text for p in doc.paragraphs)
    assert "Python, FastAPI, Redis" in texts
