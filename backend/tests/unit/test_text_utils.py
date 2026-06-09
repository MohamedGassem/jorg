"""Tests for shared text normalisation utility."""

from services.text_utils import normalize_text


def test_normalize_text_strips_accents():
    assert normalize_text("Expérience") == "experience"


def test_normalize_text_casefold():
    assert normalize_text("PYTHON") == "python"


def test_normalize_text_replaces_special_chars_with_space():
    assert normalize_text("c++") == "c"


def test_normalize_text_collapses_spaces():
    assert normalize_text("  machine  learning  ") == "machine learning"


def test_normalize_text_handles_apostrophes():
    assert normalize_text("centres d'intérêt") == "centres d interet"
    assert normalize_text("centres d'intérêt") == "centres d interet"


def test_normalize_text_empty_string():
    assert normalize_text("") == ""


def test_normalize_text_whitespace_only():
    assert normalize_text("  ") == ""


def test_normalize_text_german_sharp_s():
    assert normalize_text("Stra\xdfe") == "strasse"
