# backend/services/documents/snapshot_service.py
"""Freeze a dossier at generation time (#67).

A snapshot captures the resolved render model and the consent policy as they
were when the dossier went out, so the envoi stays justified even if the
candidate later changes the rules. Snapshots are immutable: regenerating creates
a new row (invariant #7).
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.dossier import Dossier
from models.dossier_snapshot import GeneratedDossierSnapshot
from models.invitation import AccessGrant, AccessGrantExclusion
from services.documents.docx_engine import build_context
from services.documents.generation_service import resolve_dossier


def _json_safe(value: Any) -> Any:
    """Round-trip through JSON so the stored blob holds only primitives."""
    return json.loads(json.dumps(value, default=str))


async def _consent_policy(db: AsyncSession, dossier: Dossier) -> dict[str, Any]:
    """The opposable policy in force for this dossier, frozen as a plain dict."""
    if dossier.access_grant_id is None:
        # Candidate-owned dossier (L3a): only the per-dossier anonymization applies.
        return {
            "share_contact": dossier.share_contact,
            "share_finances": dossier.share_finances,
        }
    grant = (
        await db.execute(select(AccessGrant).where(AccessGrant.id == dossier.access_grant_id))
    ).scalar_one()
    exclusions = (
        await db.execute(
            select(AccessGrantExclusion.target_type, AccessGrantExclusion.target_id).where(
                AccessGrantExclusion.grant_id == grant.id
            )
        )
    ).all()
    return {
        "share_contact": grant.share_contact,
        "share_finances_internal": grant.share_finances_internal,
        "identity_anonymized_to_client": grant.identity_anonymized_to_client,
        "mask_client_names": grant.mask_client_names,
        "reachable": grant.reachable,
        "temporal_precision": grant.temporal_precision.value,
        "purpose": grant.purpose,
        "retention_until": grant.retention_until,
        "exclusions": [{"target_type": t.value, "target_id": str(tid)} for t, tid in exclusions],
    }


async def create_dossier_snapshot(
    db: AsyncSession,
    dossier: Dossier,
    *,
    template_id: UUID | None = None,
    generated_by_user_id: UUID | None = None,
    generated_document_id: UUID | None = None,
    recipient_context: str | None = None,
) -> GeneratedDossierSnapshot:
    """Resolve the dossier and freeze its render model and consent policy."""
    render_model = await resolve_dossier(db, dossier)
    snapshot = GeneratedDossierSnapshot(
        dossier_id=dossier.id,
        render_model_snapshot_json=_json_safe(build_context(render_model)),
        consent_policy_snapshot_json=_json_safe(await _consent_policy(db, dossier)),
        template_id=template_id,
        generated_by_user_id=generated_by_user_id,
        generated_document_id=generated_document_id,
        recipient_context=recipient_context,
    )
    db.add(snapshot)
    await db.flush()
    await db.refresh(snapshot)
    return snapshot
