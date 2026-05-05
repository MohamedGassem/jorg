# backend/tests/unit/test_docx_engine.py
"""Unit tests for the pure docx generation engine."""

import io
from datetime import date
from unittest.mock import MagicMock

# These imports will fail until docx_engine is created — that's expected.
from services.docx_engine import (
    exp_flat,
    fmt_date,
    generate_document,
    is_text_settable,
    profile_flat,
    skill_flat,
)


def _mock_profile(**kwargs: object) -> MagicMock:
    profile = MagicMock()
    profile.first_name = kwargs.get("first_name", "Alice")
    profile.last_name = kwargs.get("last_name", "Martin")
    profile.title = kwargs.get("title", "Dev")
    profile.summary = kwargs.get("summary", "")
    profile.phone = kwargs.get("phone", "")
    profile.email_contact = kwargs.get("email_contact", "")
    profile.linkedin_url = kwargs.get("linkedin_url", "")
    profile.location = kwargs.get("location", "")
    profile.years_of_experience = kwargs.get("years_of_experience")
    profile.daily_rate = kwargs.get("daily_rate")
    profile.annual_salary = kwargs.get("annual_salary")
    profile.availability_status = kwargs.get("availability_status")
    profile.work_mode = kwargs.get("work_mode")
    profile.location_preference = kwargs.get("location_preference")
    profile.mission_duration = kwargs.get("mission_duration")
    profile.contract_type = kwargs.get("contract_type")
    profile.preferred_domains = kwargs.get("preferred_domains")
    return profile


def _mock_experience(**kwargs: object) -> MagicMock:
    exp = MagicMock()
    exp.client_name = kwargs.get("client_name", "Acme")
    exp.role = kwargs.get("role", "Engineer")
    exp.start_date = kwargs.get("start_date", date(2022, 1, 1))
    exp.end_date = kwargs.get("end_date", date(2023, 6, 1))
    exp.is_current = kwargs.get("is_current", False)
    exp.description = kwargs.get("description", "desc")
    exp.context = kwargs.get("context", "ctx")
    exp.achievements = kwargs.get("achievements", "ach")
    exp.technologies = kwargs.get("technologies", ["Python"])
    return exp


class TestIsTextSettable:
    def test_returns_false_for_node_without_text(self):
        class NoTextNode:
            pass

        assert is_text_settable(NoTextNode()) is False

    def test_returns_true_for_node_with_settable_text(self):
        class TextNode:
            text = "hello"

        assert is_text_settable(TextNode()) is True


class TestFmtDate:
    def test_returns_empty_string_for_none(self):
        assert fmt_date(None) == ""

    def test_formats_date_as_mm_yyyy(self):
        assert fmt_date(date(2023, 6, 15)) == "06/2023"


class TestProfileFlat:
    def test_returns_first_name(self):
        p = _mock_profile(first_name="Bob")
        flat = profile_flat(p)
        assert flat["first_name"] == "Bob"

    def test_returns_empty_string_for_none_fields(self):
        p = _mock_profile(phone=None)
        flat = profile_flat(p)
        assert flat["phone"] == ""

    def test_contains_all_expected_keys(self):
        p = _mock_profile()
        flat = profile_flat(p)
        expected_keys = {
            "first_name",
            "last_name",
            "title",
            "summary",
            "phone",
            "email_contact",
            "linkedin_url",
            "location",
            "years_of_experience",
            "daily_rate",
            "annual_salary",
            "availability_status",
            "work_mode",
            "location_preference",
            "mission_duration",
            "contract_type",
            "preferred_domains",
        }
        assert set(flat.keys()) == expected_keys


class TestExpFlat:
    def test_formats_end_date(self):
        exp = _mock_experience(end_date=date(2023, 6, 1), is_current=False)
        flat = exp_flat(exp)
        assert flat["experience.end_date"] == "06/2023"

    def test_current_experience_shows_present(self):
        exp = _mock_experience(is_current=True)
        flat = exp_flat(exp)
        assert flat["experience.end_date"] == "présent"

    def test_technologies_joined(self):
        exp = _mock_experience(technologies=["Python", "FastAPI"])
        flat = exp_flat(exp)
        assert flat["experience.technologies"] == "Python, FastAPI"


class TestGenerateDocument:
    def test_returns_bytes(self, tmp_path):
        """generate_document returns non-empty bytes for a minimal template."""
        from docx import Document

        tmpl_path = tmp_path / "template.docx"
        doc = Document()
        doc.add_paragraph("Bonjour {{first_name}} {{last_name}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile(first_name="Alice", last_name="Martin")
        mappings = {"{{first_name}}": "first_name", "{{last_name}}": "last_name"}

        result = generate_document(str(tmpl_path), profile, [], [], mappings)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_replaces_simple_placeholder(self, tmp_path):
        """Placeholder {{first_name}} is replaced with the profile value."""
        from docx import Document

        tmpl_path = tmp_path / "template.docx"
        doc = Document()
        doc.add_paragraph("{{first_name}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile(first_name="Alice")
        mappings = {"{{first_name}}": "first_name"}

        docx_bytes = generate_document(str(tmpl_path), profile, [], [], mappings)
        result_doc = Document(io.BytesIO(docx_bytes))
        texts = [p.text for p in result_doc.paragraphs]
        assert "Alice" in texts

    def test_expands_experience_block(self, tmp_path):
        """{{#EXPERIENCES}}...{{/EXPERIENCES}} block is expanded once per experience."""
        from docx import Document

        tmpl_path = tmp_path / "template.docx"
        doc = Document()
        doc.add_paragraph("{{#EXPERIENCES}}")
        doc.add_paragraph("{{experience.role}}")
        doc.add_paragraph("{{/EXPERIENCES}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile()
        exp1 = _mock_experience(role="Engineer")
        exp2 = _mock_experience(role="Architect")
        mappings = {"{{experience.role}}": "experience.role"}

        docx_bytes = generate_document(str(tmpl_path), profile, [exp1, exp2], [], mappings)
        result_doc = Document(io.BytesIO(docx_bytes))
        texts = [p.text for p in result_doc.paragraphs if p.text]
        assert "Engineer" in texts
        assert "Architect" in texts
        # Block markers must be removed
        assert "{{#EXPERIENCES}}" not in texts
        assert "{{/EXPERIENCES}}" not in texts


class _FakeEnum:
    def __init__(self, value: str) -> None:
        self.value = value


class TestProfileFlatNewFields:
    def test_includes_contract_type(self):
        p = _mock_profile(contract_type=_FakeEnum("freelance"))
        flat = profile_flat(p)
        assert "contract_type" in flat
        assert flat["contract_type"] == "freelance"

    def test_includes_preferred_domains(self):
        p = _mock_profile(preferred_domains=["finance", "tech"])
        flat = profile_flat(p)
        assert "preferred_domains" in flat
        assert flat["preferred_domains"] == "finance, tech"

    def test_preferred_domains_none_returns_empty(self):
        p = _mock_profile(preferred_domains=None)
        flat = profile_flat(p)
        assert flat["preferred_domains"] == ""

    def test_includes_annual_salary(self):
        p = _mock_profile(annual_salary=60000)
        flat = profile_flat(p)
        assert "annual_salary" in flat
        assert flat["annual_salary"] == "60000"


class TestSkillFlat:
    def test_returns_skill_name(self):
        sk = MagicMock()
        sk.name = "Python"
        sk.category = _FakeEnum("language")
        sk.level = "Expert"
        sk.level_rating = 5
        sk.years_of_experience = 3
        flat = skill_flat(sk)
        assert flat["skill.name"] == "Python"
        assert flat["skill.category"] == "language"
        assert flat["skill.level"] == "Expert"
        assert flat["skill.level_rating"] == "5"
        assert flat["skill.years_of_experience"] == "3"


class TestSkillsBlock:
    def test_skills_block_clones_per_skill(self, tmp_path):
        from docx import Document

        tmpl_path = tmp_path / "skills_tmpl.docx"
        doc = Document()
        doc.add_paragraph("{{#SKILLS}}")
        doc.add_paragraph("{{SKILL_NAME}} ({{SKILL_CATEGORY}})")
        doc.add_paragraph("{{/SKILLS}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile()
        sk1 = MagicMock()
        sk1.name = "Python"
        sk1.category = _FakeEnum("language")
        sk1.level = "Expert"
        sk1.level_rating = None
        sk1.years_of_experience = None
        sk2 = MagicMock()
        sk2.name = "Django"
        sk2.category = _FakeEnum("framework")
        sk2.level = "Avancé"
        sk2.level_rating = None
        sk2.years_of_experience = None

        mappings = {
            "{{SKILL_NAME}}": "skill.name",
            "{{SKILL_CATEGORY}}": "skill.category",
        }

        result_bytes = generate_document(str(tmpl_path), profile, [], [sk1, sk2], mappings)
        result_doc = Document(io.BytesIO(result_bytes))
        full_text = "\n".join(p.text for p in result_doc.paragraphs)

        assert "Python" in full_text
        assert "Django" in full_text
        assert "{{#SKILLS}}" not in full_text
        assert "{{/SKILLS}}" not in full_text

    def test_skills_block_empty_removes_markers(self, tmp_path):
        from docx import Document

        tmpl_path = tmp_path / "skills_empty.docx"
        doc = Document()
        doc.add_paragraph("{{#SKILLS}}")
        doc.add_paragraph("{{SKILL_NAME}}")
        doc.add_paragraph("{{/SKILLS}}")
        doc.save(str(tmpl_path))

        profile = _mock_profile()
        result_bytes = generate_document(str(tmpl_path), profile, [], [], {})
        result_doc = Document(io.BytesIO(result_bytes))
        full_text = "\n".join(p.text for p in result_doc.paragraphs)
        assert "{{#SKILLS}}" not in full_text
        assert "{{/SKILLS}}" not in full_text
