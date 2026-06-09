# backend/tests/unit/test_template_service.py
"""Unit tests for template_service pure functions."""

from services.documents.template_service import _compute_is_valid


def test_compute_is_valid_true_when_all_detected_are_known_fields() -> None:
    assert _compute_is_valid(["{{first_name}}", "{{last_name}}", "{{annual_salary}}"]) is True


def test_compute_is_valid_false_when_any_placeholder_is_unknown() -> None:
    assert _compute_is_valid(["{{first_name}}", "{{CUSTOM_HEADER}}"]) is False


def test_compute_is_valid_false_for_old_mustache_placeholders() -> None:
    assert _compute_is_valid(["{{NOM}}", "{{PRENOM}}"]) is False


def test_compute_is_valid_false_when_empty_detected() -> None:
    assert _compute_is_valid([]) is False


def test_compute_is_valid_covers_all_profile_fields() -> None:
    all_profile = [
        "{{first_name}}",
        "{{last_name}}",
        "{{title}}",
        "{{summary}}",
        "{{phone}}",
        "{{email_contact}}",
        "{{linkedin_url}}",
        "{{location}}",
        "{{years_of_experience}}",
        "{{daily_rate}}",
        "{{annual_salary}}",
        "{{availability_status}}",
        "{{work_mode}}",
        "{{location_preference}}",
        "{{mission_duration}}",
        "{{contract_type}}",
        "{{preferred_domains}}",
    ]
    assert _compute_is_valid(all_profile) is True
