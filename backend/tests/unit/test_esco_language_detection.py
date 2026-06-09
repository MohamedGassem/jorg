"""Regression tests for ESCO language reference detection."""

from services.esco_language_detection import is_esco_language_reference


def test_language_knowledge_with_french_description_is_reference():
    assert is_esco_language_reference(
        "Francais",
        "La langue officielle de la France.",
        "knowledge",
    )


def test_programming_language_is_not_reference():
    assert not is_esco_language_reference(
        "Python",
        "Langage de programmation interprete.",
        "knowledge",
    )


def test_non_knowledge_type_is_not_reference():
    assert not is_esco_language_reference("Francais", "La langue francaise.", "skill")


def test_none_inputs_do_not_crash():
    assert not is_esco_language_reference(None, None, None)
