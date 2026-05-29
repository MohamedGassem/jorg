# backend/tests/unit/test_skill_schemas.py
"""Smoke-test that all skill schemas can be instantiated and serialised."""

from uuid import uuid4

from models.skill import SkillKind, UsageIntensity, UsageRole
from schemas.skill import (
    AchievementCreate,
    CandidateSkillCreate,
    ExperienceSkillUsageCreate,
    SkillMetricsRead,
    SkillReferenceCreate,
)


def test_skill_reference_create_round_trip():
    obj = SkillReferenceCreate(name="Python", kind=SkillKind.technical)
    assert obj.name == "Python"
    assert obj.kind == SkillKind.technical


def test_candidate_skill_create_round_trip():
    ref_id = uuid4()
    obj = CandidateSkillCreate(skill_ref_id=ref_id)
    assert obj.skill_ref_id == ref_id
    assert obj.featured is False


def test_experience_skill_usage_create_round_trip():
    ref_id = uuid4()
    obj = ExperienceSkillUsageCreate(
        skill_ref_id=ref_id,
        usage_role=UsageRole.implementer,
        intensity=UsageIntensity.primary,
    )
    assert obj.usage_role == UsageRole.implementer


def test_achievement_create_round_trip():
    obj = AchievementCreate(description="Reduced latency by 40%", impact="-40% p99")
    assert obj.description == "Reduced latency by 40%"


def test_skill_metrics_read_round_trip():
    obj = SkillMetricsRead(
        skill_ref_id=uuid4(),
        skill_name="Python",
        skill_kind=SkillKind.technical,
        months_weighted=24.0,
        last_used=None,
        distinct_contexts=3,
        validated=True,
    )
    assert obj.validated is True
