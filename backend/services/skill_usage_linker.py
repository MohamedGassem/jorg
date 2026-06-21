"""Linker déterministe (régime B) : propose des liaisons compétence<->expérience.

Scanne le texte d'une expérience contre l'index de compétences et propose des
`ExperienceSkillUsage` que le candidat confirmera (review_status pending -> accepted).
Pas de saisie : le candidat est confirmateur, pas auteur.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from uuid import UUID

from services.cv.skill_matching import SkillIndex, match_skills_in_index

# Confiance heuristique d'une liaison proposée par le linker déterministe.
LINKER_CONFIDENCE = 0.7


@dataclass(frozen=True)
class ProposedSkillUsage:
    skill_ref_id: UUID
    confidence: float


def propose_skill_usages(
    text: str,
    index: SkillIndex,
    existing_skill_ref_ids: Iterable[UUID] = (),
) -> list[ProposedSkillUsage]:
    existing = set(existing_skill_ref_ids)
    return [
        ProposedSkillUsage(skill_ref_id=entry.id, confidence=LINKER_CONFIDENCE)
        for entry in match_skills_in_index(text, index)
        if entry.id not in existing
    ]
