# backend/tests/unit/test_skill_reference_service.py
"""Pure unit tests for slugify — no DB, no async."""

from services.skill_reference_service import slugify


def test_slugify_basic():
    assert slugify("Python") == "python"
    assert slugify("Node.js") == "node-js"
    assert slugify("  React  ") == "react"
    assert slugify("AWS Lambda") == "aws-lambda"


def test_slugify_cpp():
    assert slugify("C++") == "cpp"


def test_slugify_csharp():
    assert slugify("C#") == "c-sharp"


def test_slugify_fsharp():
    assert slugify("F#") == "f-sharp"


def test_slugify_cpp_differs_from_c():
    assert slugify("C++") != slugify("C")


def test_slugify_slash():
    assert slugify("ASP.NET/MVC") == "asp-net-mvc"


def test_slugify_removes_surrounding_dashes():
    result = slugify("---Python---")
    assert not result.startswith("-")
    assert not result.endswith("-")


def test_slugify_collapses_consecutive_separators():
    assert "--" not in slugify("C++ / Java")
