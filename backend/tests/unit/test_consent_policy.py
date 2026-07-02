# backend/tests/unit/test_consent_policy.py
"""The consent envelope as a single value object (ConsentPolicy).

One pure object maps a grant (L3b) or a candidate dossier (L3a) to consent, and
exposes the three projections its consumers read: the render params, the excluded
experience ids, and the frozen snapshot dict. These tests are pure (no DB): they
feed plain rows in and check each projection out, and they pin ``to_frozen_dict``
to the exact legacy format so the immutable snapshot never silently drifts.
"""

from types import SimpleNamespace
from uuid import uuid4

from models.invitation import ExclusionTargetType, TemporalPrecision
from services.documents.consent_policy import ConsentPolicy


def _grant(**overrides: object) -> SimpleNamespace:
    base = dict(
        share_contact=True,
        share_finances_internal=False,
        identity_anonymized_to_client=True,
        mask_client_names=True,
        reachable=False,
        temporal_precision=TemporalPrecision.MONTH,
        purpose="mission staffing",
        retention_until=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _exclusion(target_type: ExclusionTargetType, target_id: object) -> SimpleNamespace:
    return SimpleNamespace(target_type=target_type, target_id=target_id)


def test_from_grant_maps_every_axis_into_render_params() -> None:
    policy = ConsentPolicy.from_grant(_grant(), [])  # type: ignore[arg-type]

    assert policy.render_params() == {
        "share_contact": True,
        "share_finances": False,
        "identity_anonymized": True,
        "mask_client_names": True,
        "temporal_precision": "month",
    }


def test_from_candidate_dossier_yields_l3a_defaults() -> None:
    dossier = SimpleNamespace(share_contact=False, share_finances=True)

    policy = ConsentPolicy.from_candidate_dossier(dossier)  # type: ignore[arg-type]

    assert policy.render_params() == {
        "share_contact": False,
        "share_finances": True,
        "identity_anonymized": False,
        "mask_client_names": False,
        "temporal_precision": "exact",
    }
    assert policy.excluded_experience_ids == frozenset()


def test_excluded_experience_ids_keeps_only_experience_targets() -> None:
    exp_a, exp_b = uuid4(), uuid4()
    exclusions = [
        _exclusion(ExclusionTargetType.EXPERIENCE, exp_a),
        _exclusion(ExclusionTargetType.EXPERIENCE, exp_b),
    ]

    policy = ConsentPolicy.from_grant(_grant(), exclusions)  # type: ignore[arg-type]

    assert policy.excluded_experience_ids == frozenset({exp_a, exp_b})


def test_to_frozen_dict_for_grant_matches_legacy_format() -> None:
    exp_id = uuid4()
    grant = _grant(retention_until=None)
    policy = ConsentPolicy.from_grant(
        grant,  # type: ignore[arg-type]
        [_exclusion(ExclusionTargetType.EXPERIENCE, exp_id)],  # type: ignore[list-item]
    )

    # Byte-for-byte the dict the retired snapshot_service._consent_policy produced,
    # so the immutable legal record keeps its historical shape (ADR-0002).
    assert policy.to_frozen_dict() == {
        "share_contact": True,
        "share_finances_internal": False,
        "identity_anonymized_to_client": True,
        "mask_client_names": True,
        "reachable": False,
        "temporal_precision": "month",
        "purpose": "mission staffing",
        "retention_until": None,
        "exclusions": [{"target_type": "experience", "target_id": str(exp_id)}],
    }


def test_to_frozen_dict_for_candidate_dossier_is_the_two_share_flags() -> None:
    dossier = SimpleNamespace(share_contact=True, share_finances=False)

    policy = ConsentPolicy.from_candidate_dossier(dossier)  # type: ignore[arg-type]

    assert policy.to_frozen_dict() == {"share_contact": True, "share_finances": False}
