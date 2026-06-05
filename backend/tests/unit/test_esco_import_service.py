# backend/tests/unit/test_esco_import_service.py
"""Pure unit tests for ESCO import mapping helpers — no DB, no async."""

from models.skill import SkillKind
from services.esco_import_service import (
    esco_row_to_fields,
    map_esco_kind,
    parse_alt_labels,
)
from services.esco_language_detection import is_esco_language_reference


def test_map_kind_knowledge_is_technical():
    assert map_esco_kind("knowledge", "sector-specific") == SkillKind.technical


def test_map_kind_transversal_is_soft():
    assert map_esco_kind("skill/competence", "transversal") == SkillKind.soft


def test_map_kind_default_is_functional():
    assert map_esco_kind("skill/competence", "occupation-specific") == SkillKind.functional
    assert map_esco_kind("", "") == SkillKind.functional


def test_map_kind_is_case_insensitive():
    assert map_esco_kind("KNOWLEDGE", "SECTOR-SPECIFIC") == SkillKind.technical
    assert map_esco_kind("skill/competence", "TRANSVERSAL") == SkillKind.soft


def test_parse_alt_labels_newline_separated():
    assert parse_alt_labels("Python\nPy\npython3") == ["Python", "Py", "python3"]


def test_parse_alt_labels_dedupes_case_insensitively():
    assert parse_alt_labels("Python\npython\nPYTHON") == ["Python"]


def test_parse_alt_labels_empty():
    assert parse_alt_labels("") == []


def test_parse_alt_labels_mixed_separators():
    assert parse_alt_labels("a; b | c") == ["a", "b", "c"]


def _row(**overrides: str) -> dict[str, str]:
    base = {
        "conceptUri": "http://data.europa.eu/esco/skill/abc12345-0000-0000-0000-000000000000",
        "skillType": "skill/competence",
        "reuseLevel": "sector-specific",
        "preferredLabel": "gérer une équipe",
        "altLabels": "manager une équipe\nencadrer",
        "status": "released",
        "description": "Coordonner le travail d'une équipe.",
    }
    base.update(overrides)
    return base


def test_row_to_fields_happy_path():
    fields = esco_row_to_fields(_row())
    assert fields is not None
    assert fields["name"] == "gérer une équipe"
    assert fields["slug"] == "g-rer-une-quipe"
    assert fields["kind"] == SkillKind.functional
    assert fields["aliases"] == ["manager une équipe", "encadrer"]
    assert fields["esco_skill_type"] == "skill/competence"
    assert fields["description"] == "Coordonner le travail d'une équipe."


def test_row_to_fields_rejects_missing_uri():
    assert esco_row_to_fields(_row(conceptUri="")) is None


def test_row_to_fields_rejects_missing_label():
    assert esco_row_to_fields(_row(preferredLabel="")) is None


def test_row_to_fields_rejects_non_released_status():
    assert esco_row_to_fields(_row(status="deprecated")) is None


def test_row_to_fields_truncates_long_name():
    fields = esco_row_to_fields(_row(preferredLabel="x" * 300))
    assert fields is not None
    assert len(fields["name"]) == 200


def test_row_to_fields_rejects_natural_language_knowledge():
    assert (
        esco_row_to_fields(
            _row(
                skillType="knowledge",
                preferredLabel="Fran\u00e7ais",
                description="La langue fran\u00e7aise. Le fran\u00e7ais est une langue officielle.",
            )
        )
        is None
    )


def test_row_to_fields_keeps_programming_language_knowledge():
    fields = esco_row_to_fields(
        _row(
            skillType="knowledge",
            preferredLabel="CSS",
            description="La langue informatique CSS est une langue de feuilles de style.",
        )
    )
    assert fields is not None
    assert fields["name"] == "CSS"
    assert fields["kind"] == SkillKind.technical


def test_language_detection_keeps_language_related_professional_skill():
    assert not is_esco_language_reference(
        "comprendre l'espagnol \u00e9crit",
        "Lire et comprendre des textes \u00e9crits en espagnol.",
        "skill/competence",
    )
