# backend/services/documents/dossier_resolution.py
"""Resolve a Dossier (L3) into the arranged inputs the render model is built from.

A Dossier is a thin selection over L2 evidence: it keeps only the referenced
items, orders them by ``position`` and applies the per-dossier ``is_featured``.
It never rewrites the underlying facts (ADR-0002), so these helpers only filter,
order and flag presentation; they never touch the fact text.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class SelectionSpec:
    """A per-dossier reference to one L2 item: which one, where, highlighted?"""

    target_id: UUID
    position: int
    is_featured: bool


def arrange_by_selection[T](
    items: Sequence[T],
    selections: Sequence[SelectionSpec],
    *,
    id_of: Callable[[T], UUID],
) -> tuple[T, ...]:
    """Keep only selected items, ordered by ``position``.

    Selections referencing an absent item are skipped.
    """
    by_id = {id_of(item): item for item in items}
    ordered = sorted(selections, key=lambda sel: sel.position)
    return tuple(by_id[sel.target_id] for sel in ordered if sel.target_id in by_id)


class _FeaturedOverride:
    """Proxy a skill while overriding only its ``featured`` flag.

    The per-dossier highlight (L3) is a presentation choice; it must not be
    written back onto the L2 ``CandidateSkill`` fact. Every other attribute
    (``skill_ref``, ``kind`` ...) resolves through to the wrapped skill.
    """

    def __init__(self, wrapped: object, featured: bool) -> None:
        object.__setattr__(self, "_wrapped", wrapped)
        object.__setattr__(self, "featured", featured)

    def __getattr__(self, name: str) -> object:
        return getattr(self._wrapped, name)


def arrange_skills[T](
    skills: Sequence[T],
    selections: Sequence[SelectionSpec],
    *,
    id_of: Callable[[T], UUID],
) -> tuple[T, ...]:
    """Select and order skills, applying the per-dossier ``is_featured`` flag."""
    by_id = {id_of(skill): skill for skill in skills}
    ordered = sorted(selections, key=lambda sel: sel.position)
    return tuple(
        _FeaturedOverride(by_id[sel.target_id], sel.is_featured)  # type: ignore[misc]
        for sel in ordered
        if sel.target_id in by_id
    )
