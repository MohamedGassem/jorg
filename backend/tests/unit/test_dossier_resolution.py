# backend/tests/unit/test_dossier_resolution.py
"""Pure arrangement logic for resolving a Dossier (#65).

A Dossier is a thin selection over L2 evidence: it keeps only the referenced
items, orders them by `position`, and marks the per-dossier `is_featured`. It
never rewrites the underlying facts (ADR-0002).
"""

from types import SimpleNamespace
from uuid import uuid4

from services.documents.dossier_resolution import (
    SelectionSpec,
    arrange_by_selection,
    arrange_skills,
)


def test_arrange_keeps_only_selected_items_in_position_order() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    items = [
        SimpleNamespace(id=a, label="a"),
        SimpleNamespace(id=b, label="b"),
        SimpleNamespace(id=c, label="c"),
    ]
    selections = [
        SelectionSpec(target_id=c, position=0, is_featured=False),
        SelectionSpec(target_id=a, position=1, is_featured=False),
    ]

    arranged = arrange_by_selection(items, selections, id_of=lambda it: it.id)

    assert [it.label for it in arranged] == ["c", "a"]


def test_arrange_skills_applies_per_dossier_featured_without_mutating_l2() -> None:
    sid = uuid4()
    skill = SimpleNamespace(id=sid, featured=False, skill_ref=SimpleNamespace(kind="technical"))
    selections = [SelectionSpec(target_id=sid, position=0, is_featured=True)]

    arranged = arrange_skills([skill], selections, id_of=lambda sk: sk.id)

    assert arranged[0].featured is True
    # The per-dossier highlight (L3) must not bleed into the L2 fact.
    assert skill.featured is False
    # Other attributes still resolve through to the underlying skill.
    assert arranged[0].skill_ref.kind == "technical"
