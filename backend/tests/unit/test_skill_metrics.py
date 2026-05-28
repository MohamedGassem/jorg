# backend/tests/unit/test_skill_metrics.py
"""Unit tests for compute_skill_metrics — pure logic, no DB."""

from datetime import date
from uuid import uuid4

import pytest

from models.skill import SkillKind, UsageIntensity, UsageRole
from services.skill_metrics_service import (
    INTENSITY_WEIGHTS,
    _compute_months,
    compute_metrics_from_usages,
)


def make_exp(start: date, end: date | None, is_current: bool = False):
    class FakeExp:
        pass

    e = FakeExp()
    e.start_date = start
    e.end_date = end
    e.is_current = is_current
    e.id = uuid4()
    return e


def make_usage(
    exp, skill_ref_id, usage_role=UsageRole.implementer, intensity=UsageIntensity.primary
):
    class FakeUsage:
        pass

    u = FakeUsage()
    u.experience_id = exp.id
    u.skill_ref_id = skill_ref_id
    u.usage_role = usage_role
    u.intensity = intensity
    return u


def make_ref(skill_id, name="Python", kind=SkillKind.technical):
    class FakeRef:
        pass

    r = FakeRef()
    r.id = skill_id
    r.name = name
    r.kind = kind
    return r


def test_intensity_weights_exist():
    assert INTENSITY_WEIGHTS[UsageIntensity.primary] == 1.0
    assert INTENSITY_WEIGHTS[UsageIntensity.secondary] == 0.5
    assert INTENSITY_WEIGHTS[UsageIntensity.incidental] == 0.2


def test_compute_months_basic():
    assert _compute_months(date(2022, 1, 1), date(2023, 1, 1)) == 12


def test_compute_months_partial():
    assert _compute_months(date(2022, 1, 1), date(2022, 7, 1)) == 6


def test_compute_months_zero():
    assert _compute_months(date(2022, 1, 1), date(2022, 1, 1)) == 0


def test_compute_metrics_single_primary_usage():
    skill_id = uuid4()
    exp = make_exp(date(2022, 1, 1), date(2023, 1, 1))
    usage = make_usage(exp, skill_id, intensity=UsageIntensity.primary)
    ref = make_ref(skill_id)

    metrics = compute_metrics_from_usages([(usage, exp, ref)])
    assert len(metrics) == 1
    m = metrics[0]
    assert m.skill_name == "Python"
    assert m.months_weighted == 12.0
    assert m.distinct_contexts == 1
    assert m.validated is True
    assert m.last_used == date(2023, 1, 1)


def test_compute_metrics_secondary_half_weight():
    skill_id = uuid4()
    exp = make_exp(date(2022, 1, 1), date(2023, 1, 1))
    usage = make_usage(exp, skill_id, intensity=UsageIntensity.secondary)
    ref = make_ref(skill_id)

    metrics = compute_metrics_from_usages([(usage, exp, ref)])
    assert metrics[0].months_weighted == 6.0
    assert metrics[0].validated is True


def test_compute_metrics_incidental_not_validated():
    skill_id = uuid4()
    exp = make_exp(date(2022, 1, 1), date(2023, 1, 1))
    usage = make_usage(exp, skill_id, intensity=UsageIntensity.incidental)
    ref = make_ref(skill_id)

    metrics = compute_metrics_from_usages([(usage, exp, ref)])
    assert metrics[0].months_weighted == pytest.approx(12 * 0.2)
    assert metrics[0].validated is False


def test_compute_metrics_current_experience_uses_today():
    skill_id = uuid4()
    exp = make_exp(date(2024, 1, 1), None, is_current=True)
    usage = make_usage(exp, skill_id, intensity=UsageIntensity.primary)
    ref = make_ref(skill_id)

    metrics = compute_metrics_from_usages([(usage, exp, ref)])
    assert metrics[0].last_used == date.today()
    assert metrics[0].months_weighted > 0


def test_compute_metrics_empty_returns_empty():
    assert compute_metrics_from_usages([]) == []


def test_compute_metrics_aggregates_multiple_experiences():
    skill_id = uuid4()
    exp1 = make_exp(date(2020, 1, 1), date(2021, 1, 1))
    exp2 = make_exp(date(2022, 1, 1), date(2023, 1, 1))
    usage1 = make_usage(exp1, skill_id, intensity=UsageIntensity.primary)
    usage1.experience_id = exp1.id
    usage2 = make_usage(exp2, skill_id, intensity=UsageIntensity.primary)
    usage2.experience_id = exp2.id
    ref = make_ref(skill_id)

    metrics = compute_metrics_from_usages([(usage1, exp1, ref), (usage2, exp2, ref)])
    assert len(metrics) == 1
    assert metrics[0].months_weighted == 24.0
    assert metrics[0].distinct_contexts == 2
    assert metrics[0].last_used == date(2023, 1, 1)
