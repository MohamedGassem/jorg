"""Projection CandidateSkill : status dérivé des preuves (tranche #61).

`CandidateSkill` n'est pas une saisie : son status est un rollup des preuves L2
(`ExperienceSkillUsage` / `AchievementSkillTag`), calculé à la lecture.

Rollup (haut -> bas) :
- validated  : >=1 preuve acceptée avec validated_at (usage réel + confirmation candidat)
- evidenced  : >=1 preuve acceptée sans validated_at
- inferred   : seulement des preuves pending (proposées, non confirmées)
- declared_only : déclaré, aucune preuve exploitable
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.candidate_profile import Experience
from models.skill import (
    Achievement,
    AchievementSkillTag,
    CandidateSkill,
    ExperienceSkillUsage,
    ProvenanceMixin,
    ReviewStatus,
    SkillKind,
    SkillReference,
    SkillStatus,
)

_USABLE = {ReviewStatus.accepted, ReviewStatus.edited}


@dataclass(frozen=True)
class ProofSignal:
    review_status: ReviewStatus
    validated: bool


def rollup_status(signals: Sequence[ProofSignal], *, declared: bool) -> SkillStatus:
    usable = [s for s in signals if s.review_status in _USABLE]
    if any(s.validated for s in usable):
        return SkillStatus.validated
    if usable:
        return SkillStatus.evidenced
    if any(s.review_status == ReviewStatus.pending for s in signals):
        return SkillStatus.inferred
    return SkillStatus.declared_only


@dataclass(frozen=True)
class DeclaredSkill:
    skill_ref_id: UUID
    skill_name: str
    skill_kind: SkillKind
    is_profile_highlighted: bool


@dataclass(frozen=True)
class ProofRecord:
    skill_ref_id: UUID
    skill_name: str
    skill_kind: SkillKind
    review_status: ReviewStatus
    validated: bool
    start: date | None
    end: date | None


@dataclass(frozen=True)
class CandidateSkillProjection:
    skill_ref_id: UUID
    skill_name: str
    skill_kind: SkillKind
    status: SkillStatus
    evidence_count: int
    first_used: date | None
    last_used: date | None
    is_profile_highlighted: bool


@dataclass
class _Agg:
    skill_name: str
    skill_kind: SkillKind
    is_profile_highlighted: bool
    declared: bool
    signals: list[ProofSignal] = field(default_factory=list)
    starts: list[date] = field(default_factory=list)
    ends: list[date] = field(default_factory=list)
    usable: int = 0


def assemble_projections(
    declared: Sequence[DeclaredSkill],
    proofs: Sequence[ProofRecord],
) -> list[CandidateSkillProjection]:
    """Combine compétences déclarées et preuves en projections (pur, sans DB)."""
    by_skill: dict[UUID, _Agg] = {}
    for d in declared:
        by_skill[d.skill_ref_id] = _Agg(
            skill_name=d.skill_name,
            skill_kind=d.skill_kind,
            is_profile_highlighted=d.is_profile_highlighted,
            declared=True,
        )
    for p in proofs:
        agg = by_skill.get(p.skill_ref_id)
        if agg is None:
            agg = _Agg(
                skill_name=p.skill_name,
                skill_kind=p.skill_kind,
                is_profile_highlighted=False,
                declared=False,
            )
            by_skill[p.skill_ref_id] = agg
        agg.signals.append(ProofSignal(review_status=p.review_status, validated=p.validated))
        if p.review_status in _USABLE:
            agg.usable += 1
            if p.start is not None:
                agg.starts.append(p.start)
            if p.end is not None:
                agg.ends.append(p.end)
    return [
        CandidateSkillProjection(
            skill_ref_id=sid,
            skill_name=agg.skill_name,
            skill_kind=agg.skill_kind,
            status=rollup_status(agg.signals, declared=agg.declared),
            evidence_count=agg.usable,
            first_used=min(agg.starts) if agg.starts else None,
            last_used=max(agg.ends) if agg.ends else None,
            is_profile_highlighted=agg.is_profile_highlighted,
        )
        for sid, agg in by_skill.items()
    ]


def _proof_record(ref: SkillReference, proof: ProvenanceMixin, exp: Experience) -> ProofRecord:
    end = exp.end_date if (not exp.is_current and exp.end_date) else date.today()
    return ProofRecord(
        skill_ref_id=ref.id,
        skill_name=ref.name,
        skill_kind=ref.kind,
        review_status=proof.review_status,
        validated=proof.validated_at is not None,
        start=exp.start_date,
        end=end,
    )


async def compute_candidate_skill_projection(
    profile_id: UUID, db: AsyncSession
) -> list[CandidateSkillProjection]:
    """Projection complète : compétences déclarées + prouvées (ESU + AST), status dérivé."""
    declared_rows = (
        (
            await db.execute(
                select(CandidateSkill)
                .where(CandidateSkill.candidate_id == profile_id)
                .options(selectinload(CandidateSkill.skill_ref))
            )
        )
        .scalars()
        .all()
    )
    declared = [
        DeclaredSkill(
            skill_ref_id=row.skill_ref_id,
            skill_name=row.skill_ref.name,
            skill_kind=row.skill_ref.kind,
            is_profile_highlighted=row.is_profile_highlighted,
        )
        for row in declared_rows
    ]
    proofs: list[ProofRecord] = []
    usage_rows = (
        await db.execute(
            select(ExperienceSkillUsage, Experience, SkillReference)
            .join(Experience, Experience.id == ExperienceSkillUsage.experience_id)
            .join(SkillReference, SkillReference.id == ExperienceSkillUsage.skill_ref_id)
            .where(Experience.profile_id == profile_id)
        )
    ).all()
    proofs.extend(_proof_record(ref, usage, exp) for usage, exp, ref in usage_rows)
    tag_rows = (
        await db.execute(
            select(AchievementSkillTag, Experience, SkillReference)
            .join(Achievement, Achievement.id == AchievementSkillTag.achievement_id)
            .join(Experience, Experience.id == Achievement.experience_id)
            .join(SkillReference, SkillReference.id == AchievementSkillTag.skill_ref_id)
            .where(Experience.profile_id == profile_id)
        )
    ).all()
    proofs.extend(_proof_record(ref, tag, exp) for tag, exp, ref in tag_rows)
    return assemble_projections(declared, proofs)
