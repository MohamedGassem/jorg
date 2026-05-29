# backend/services/skill_metrics_service.py
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.candidate_profile import Experience
from models.skill import ExperienceSkillUsage, SkillReference, UsageIntensity
from schemas.skill import SkillMetricsRead

INTENSITY_WEIGHTS: dict[UsageIntensity, float] = {
    UsageIntensity.primary: 1.0,
    UsageIntensity.secondary: 0.5,
    UsageIntensity.incidental: 0.2,
}

VALIDATED_INTENSITIES = {UsageIntensity.primary, UsageIntensity.secondary}


def _compute_months(start: date, end: date) -> int:
    # A same-month experience (or same-day) counts as 1 month, not 0.
    return max(1, (end.year - start.year) * 12 + (end.month - start.month))


def compute_metrics_from_usages(
    rows: list[tuple[Any, Any, Any]],  # list of (usage, experience, skill_ref)
) -> list[SkillMetricsRead]:
    by_skill: dict[UUID, dict[str, Any]] = defaultdict(
        lambda: {
            "months_weighted": 0.0,
            "last_used": None,
            "contexts": set(),
            "validated": False,
            "ref": None,
        }
    )

    for usage, exp, ref in rows:
        sid = ref.id
        end_date = exp.end_date if (not exp.is_current and exp.end_date) else date.today()
        months = _compute_months(exp.start_date, end_date)
        weight = INTENSITY_WEIGHTS[usage.intensity]

        agg = by_skill[sid]
        agg["months_weighted"] += months * weight
        agg["contexts"].add(usage.experience_id)
        if agg["last_used"] is None or end_date > agg["last_used"]:
            agg["last_used"] = end_date
        if usage.intensity in VALIDATED_INTENSITIES:
            agg["validated"] = True
        if agg["ref"] is None:
            agg["ref"] = ref

    return [
        SkillMetricsRead(
            skill_ref_id=sid,
            skill_name=agg["ref"].name,
            skill_kind=agg["ref"].kind,
            months_weighted=agg["months_weighted"],
            last_used=agg["last_used"],
            distinct_contexts=len(agg["contexts"]),
            validated=agg["validated"],
        )
        for sid, agg in by_skill.items()
    ]


async def compute_skill_metrics(
    profile_id: UUID,
    db: AsyncSession,
) -> list[SkillMetricsRead]:
    stmt = (
        select(ExperienceSkillUsage, Experience, SkillReference)
        .join(Experience, Experience.id == ExperienceSkillUsage.experience_id)
        .join(SkillReference, SkillReference.id == ExperienceSkillUsage.skill_ref_id)
        .where(Experience.profile_id == profile_id)
    )
    result = await db.execute(stmt)
    rows = [(usage, exp, ref) for usage, exp, ref in result.all()]
    return compute_metrics_from_usages(rows)
