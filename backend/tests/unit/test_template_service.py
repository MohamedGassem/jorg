# backend/tests/unit/test_template_service.py
"""Unit tests for template_service pure functions (no DB required)."""

from services.template_service import _auto_mappings, _compute_is_valid

# ---------------------------------------------------------------------------
# _auto_mappings
# ---------------------------------------------------------------------------


def test_auto_mappings_maps_known_placeholders_to_field_names() -> None:
    result = _auto_mappings(["{{first_name}}", "{{last_name}}"])
    assert result == {"{{first_name}}": "first_name", "{{last_name}}": "last_name"}


def test_auto_mappings_skips_unknown_placeholders() -> None:
    result = _auto_mappings(["{{CUSTOM_FIELD}}", "{{NOM}}"])
    assert result == {}


def test_auto_mappings_mixed_keeps_only_known() -> None:
    result = _auto_mappings(["{{first_name}}", "{{CUSTOM}}"])
    assert result == {"{{first_name}}": "first_name"}


def test_auto_mappings_empty_list_returns_empty() -> None:
    assert _auto_mappings([]) == {}


def test_auto_mappings_covers_all_profile_fields() -> None:
    """Every field exposed by profile_flat() is auto-mappable."""
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
    result = _auto_mappings(all_profile)
    assert set(result.keys()) == set(all_profile)
    # Values are bare field names (no braces)
    assert result["{{first_name}}"] == "first_name"
    assert result["{{annual_salary}}"] == "annual_salary"


# ---------------------------------------------------------------------------
# _compute_is_valid (behaviour through auto_mappings)
# ---------------------------------------------------------------------------


def test_compute_is_valid_true_when_all_detected_are_mapped() -> None:
    mappings = {"{{first_name}}": "first_name", "{{last_name}}": "last_name"}
    assert _compute_is_valid(["{{first_name}}", "{{last_name}}"], mappings) is True


def test_compute_is_valid_false_when_some_unmapped() -> None:
    mappings = {"{{first_name}}": "first_name"}
    assert _compute_is_valid(["{{first_name}}", "{{CUSTOM}}"], mappings) is False


def test_compute_is_valid_false_when_empty_detected() -> None:
    assert _compute_is_valid([], {}) is False


def test_compute_is_valid_false_when_mappings_empty_but_detected_not() -> None:
    assert _compute_is_valid(["{{first_name}}"], {}) is False


# ---------------------------------------------------------------------------
# Integration: auto_mappings + compute_is_valid together
# ---------------------------------------------------------------------------


def test_all_known_fields_produces_valid_template() -> None:
    """A template using only standard profile fields is immediately valid."""
    detected = ["{{first_name}}", "{{last_name}}", "{{title}}", "{{daily_rate}}"]
    mappings = _auto_mappings(detected)
    assert _compute_is_valid(detected, mappings) is True


def test_unknown_field_produces_invalid_template() -> None:
    """A template with any unknown placeholder is not auto-valid."""
    detected = ["{{first_name}}", "{{CUSTOM_HEADER}}"]
    mappings = _auto_mappings(detected)
    assert _compute_is_valid(detected, mappings) is False
