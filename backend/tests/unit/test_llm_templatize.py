# backend/tests/unit/test_llm_templatize.py
from typing import Any

from services.documents.templatize_ops import ReplaceTextOp, TemplatizePlan
from services.llm.templatize import build_prompt, request_plan


def test_build_prompt_contains_structure_and_placeholders() -> None:
    structure = {"paragraphs": [{"index": 0, "text": "Jean Dupont"}], "tables": []}
    prompt = build_prompt(structure, ["first_name", "experiences"], render_errors=None)
    assert "Jean Dupont" in prompt
    assert "first_name" in prompt
    assert "{%tr for" in prompt  # la doc de syntaxe des boucles est incluse


def test_build_prompt_injects_render_errors_on_retry() -> None:
    prompt = build_prompt({"paragraphs": [], "tables": []}, [], render_errors="unexpected 'endfor'")
    assert "unexpected 'endfor'" in prompt


async def test_request_plan_returns_parsed_output() -> None:
    expected = TemplatizePlan(
        operations=[
            ReplaceTextOp(
                op="replace_text",
                target={"kind": "paragraph", "paragraph": 0},
                find="Jean Dupont",
                placeholder="{{first_name}} {{last_name}}",
            )
        ]
    )

    class _FakeResponse:
        parsed_output = expected
        stop_reason = "end_turn"

    class _FakeMessages:
        async def parse(self, **kwargs: Any) -> _FakeResponse:
            return _FakeResponse()

    class _FakeClient:
        messages = _FakeMessages()

    plan = await request_plan(
        _FakeClient(),
        model="claude-opus-4-8",
        structure={"paragraphs": [], "tables": []},
        known_keys=["first_name"],
        render_errors=None,
    )
    assert plan == expected


def test_syntax_guide_collections_exist_in_render_context() -> None:
    from services.documents.builtin_template_service import mock_context_keys
    from services.llm.templatize import _SYNTAX_GUIDE

    context_keys = mock_context_keys()
    for collection in ("experiences", "skills", "educations", "certifications", "languages"):
        assert collection in _SYNTAX_GUIDE, f"{collection} absent du guide de syntaxe"
        assert collection in context_keys, f"{collection} absent du contexte de rendu"
