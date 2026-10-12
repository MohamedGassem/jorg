# backend/services/documents/consent_policy.py
"""The consent envelope as a single value object.

`ConsentPolicy` is the only place that knows how a grant (L3b) or a candidate
dossier (L3a) maps to consent. Both consumers -- the render path and the snapshot
freeze -- read their projection from it instead of re-deriving the mapping by
hand, so a rendering-relevant axis is added in one edit and can never be recorded
in the render while being dropped from the frozen legal record (ADR-0002).

Pure by design (locked decision #2): the builders take loaded rows in and a value
object out. The call sites keep their queries; this module takes no session.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING, Any, TypedDict
from uuid import UUID

from models.invitation import ExclusionTargetType

if TYPE_CHECKING:
    from models.dossier import Dossier
    from models.invitation import AccessGrant, AccessGrantExclusion


class RenderParams(TypedDict):
    """The five-axis subset ``build_render_model`` consumes as keyword args."""

    share_contact: bool
    share_finances: bool
    identity_anonymized: bool
    mask_client_names: bool
    temporal_precision: str


@dataclass(frozen=True)
class ConsentPolicy:
    """The opposable consent envelope in force for one dossier.

    Grant-only legal fields (``reachable``, ``purpose``, ``retention_until``) are
    absent for the L3a case; ``grant_backed`` records which side built it so the
    frozen dict keeps each case's historical shape.
    """

    share_contact: bool
    share_finances: bool
    identity_anonymized: bool
    mask_client_names: bool
    temporal_precision: str
    reachable: bool | None
    purpose: str | None
    retention_until: date | None
    exclusions: tuple[tuple[str, UUID], ...]
    grant_backed: bool

    @classmethod
    def from_grant(
        cls, grant: AccessGrant, exclusions: Sequence[AccessGrantExclusion]
    ) -> ConsentPolicy:
        return cls(
            share_contact=grant.share_contact,
            share_finances=grant.share_finances_internal,
            identity_anonymized=grant.identity_anonymized_to_client,
            mask_client_names=grant.mask_client_names,
            temporal_precision=grant.temporal_precision.value,
            reachable=grant.reachable,
            purpose=grant.purpose,
            retention_until=grant.retention_until,
            exclusions=tuple((e.target_type.value, e.target_id) for e in exclusions),
            grant_backed=True,
        )

    @classmethod
    def from_candidate_dossier(cls, dossier: Dossier) -> ConsentPolicy:
        return cls(
            share_contact=dossier.share_contact,
            share_finances=dossier.share_finances,
            identity_anonymized=False,
            mask_client_names=False,
            temporal_precision="exact",
            reachable=None,
            purpose=None,
            retention_until=None,
            exclusions=(),
            grant_backed=False,
        )

    def render_params(self) -> RenderParams:
        return RenderParams(
            share_contact=self.share_contact,
            share_finances=self.share_finances,
            identity_anonymized=self.identity_anonymized,
            mask_client_names=self.mask_client_names,
            temporal_precision=self.temporal_precision,
        )

    @property
    def excluded_experience_ids(self) -> frozenset[UUID]:
        experience = ExclusionTargetType.EXPERIENCE.value
        return frozenset(tid for target_type, tid in self.exclusions if target_type == experience)

    def to_frozen_dict(self) -> dict[str, Any]:
        """The snapshot JSON. L3a freezes only the two share flags (decision #5)."""
        if not self.grant_backed:
            return {"share_contact": self.share_contact, "share_finances": self.share_finances}
        return {
            "share_contact": self.share_contact,
            "share_finances_internal": self.share_finances,
            "identity_anonymized_to_client": self.identity_anonymized,
            "mask_client_names": self.mask_client_names,
            "reachable": self.reachable,
            "temporal_precision": self.temporal_precision,
            "purpose": self.purpose,
            "retention_until": self.retention_until,
            "exclusions": [
                {"target_type": target_type, "target_id": str(tid)}
                for target_type, tid in self.exclusions
            ],
        }
