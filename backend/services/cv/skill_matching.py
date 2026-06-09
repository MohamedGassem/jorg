from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference
from services.cv.constants import _MAX_NGRAM_WORDS, _MAX_SKILL_SUGGESTIONS, _MIN_SKILL_LEN
from services.cv.schemas import SkillProposal
from services.text_utils import normalize_text as _normalise


@dataclass(frozen=True)
class SkillEntry:
    id: UUID
    name: str
    kind: SkillKind


SkillIndex = dict[str, SkillEntry]

_SYMBOLIC_SKILL_REPLACEMENTS = (
    ("c++", "cpp"),
    ("c#", "c sharp"),
    ("f#", "f sharp"),
    (".net", "dotnet"),
)


def normalize_skill_label(value: str) -> str:
    """Normalise skill labels while preserving meaning carried by symbols."""
    prepared = value.casefold()
    for source, target in _SYMBOLIC_SKILL_REPLACEMENTS:
        prepared = prepared.replace(source, target)
    return _normalise(prepared)


def _ngrams(tokens: list[str], max_words: int) -> set[str]:
    grams: set[str] = set()
    n = len(tokens)
    for size in range(1, max_words + 1):
        for i in range(n - size + 1):
            grams.add(" ".join(tokens[i : i + size]))
    return grams


async def build_skill_index(db: AsyncSession) -> SkillIndex:
    result = await db.execute(
        select(SkillReference).where(SkillReference.creator_candidate_id.is_(None))
    )
    return _index_skill_references(result.scalars().all())


async def build_candidate_skill_index(db: AsyncSession, candidate_id: UUID) -> SkillIndex:
    result = await db.execute(
        select(SkillReference).where(SkillReference.creator_candidate_id == candidate_id)
    )
    return _index_skill_references(result.scalars().all())


def merge_skill_indexes(*indexes: SkillIndex) -> SkillIndex:
    merged: SkillIndex = {}
    for index in indexes:
        merged.update(index)
    return merged


def _index_skill_references(refs: list[SkillReference]) -> SkillIndex:
    index: SkillIndex = {}
    for ref in refs:
        entry = SkillEntry(id=ref.id, name=ref.name, kind=ref.kind)
        for phrase in (ref.name, *ref.aliases):
            norm = normalize_skill_label(phrase)
            if len(norm) >= _MIN_SKILL_LEN and norm not in index:
                index[norm] = entry
    return index


def match_skills_in_index(text: str, index: SkillIndex) -> list[SkillEntry]:
    tokens = [token for token in normalize_skill_label(text).split(" ") if token]
    candidates = _ngrams(tokens, _MAX_NGRAM_WORDS)
    matched: dict[UUID, SkillEntry] = {}
    for gram in candidates:
        hit = index.get(gram)
        if hit is not None:
            matched[hit.id] = hit
    ordered = sorted(matched.values(), key=lambda e: (-len(e.name), e.name.lower()))
    return ordered[:_MAX_SKILL_SUGGESTIONS]


def match_structured_skills(
    text: str,
    proposed_skills: list[SkillProposal],
    index: SkillIndex,
) -> list[SkillProposal]:
    results: dict[UUID | str, SkillProposal] = {}
    for skill in proposed_skills:
        norm = normalize_skill_label(skill.original_label)
        hit = index.get(norm)
        if hit is None:
            results[f"unmatched:{norm}:{skill.original_label}"] = skill.model_copy(
                update={"normalized_label": norm, "match_type": "unmatched", "needs_review": True}
            )
            continue
        results[hit.id] = skill.model_copy(
            update={
                "normalized_label": norm,
                "match_type": "explicit",
                "skill_ref_id": hit.id,
                "name": hit.name,
                "kind": hit.kind,
                "confidence": 0.9,
                "needs_review": True,
            }
        )

    for hit in match_skills_in_index(text, index):
        if hit.id not in results:
            results[hit.id] = SkillProposal(
                original_label=hit.name,
                normalized_label=normalize_skill_label(hit.name),
                match_type="normalized",
                skill_ref_id=hit.id,
                name=hit.name,
                kind=hit.kind,
                confidence=0.75,
                needs_review=True,
            )
    return list(results.values())[:_MAX_SKILL_SUGGESTIONS]
