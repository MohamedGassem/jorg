# backend/tests/unit/test_skill_reference_service.py
"""Pure unit tests for slugify -- no DB, no async."""

from models.skill import SkillReference
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


def test_skill_reference_has_is_displayable_field():
    ref = SkillReference(
        name="Test",
        slug="test",
        kind="technical",
        aliases=[],
        source="jorg",
        is_custom=False,
        is_displayable=True,
        categories=["Software Engineering"],
    )
    assert ref.is_displayable is True
    assert ref.categories == ["Software Engineering"]
