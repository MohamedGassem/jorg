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

from sqlalchemy.ext.asyncio import AsyncSession

from models.dossier import Dossier
from models.dossier_snapshot import GeneratedDossierSnapshot
from services.documents.docx_engine import build_context
from services.documents.generation_service import resolve_dossier
from services.dossier_service import load_consent_policy


def _json_safe(value: Any) -> Any:
    """Round-trip through JSON so the stored blob holds only primitives."""
    return json.loads(json.dumps(value, default=str))


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
        consent_policy_snapshot_json=_json_safe(
            (await load_consent_policy(db, dossier)).to_frozen_dict()
        ),
        template_id=template_id,
        generated_by_user_id=generated_by_user_id,
        generated_document_id=generated_document_id,
        recipient_context=recipient_context,
    )
    db.add(snapshot)
    await db.flush()
    await db.refresh(snapshot)
    return snapshot
