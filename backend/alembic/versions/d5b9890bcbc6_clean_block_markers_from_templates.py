"""clean_block_markers_from_templates

Revision ID: d5b9890bcbc6
Revises: 36e251d219a0
Create Date: 2026-04-19

Removes mustache block markers ({{#NAME}}, {{/NAME}}) from the
`detected_placeholders` column of existing templates and recomputes
`is_valid` accordingly. See backend/services/docx_parser.py for the
definition of "block marker".
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5b9890bcbc6"
down_revision: str | Sequence[str] | None = "36e251d219a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_BLOCK_MARKER_RE = re.compile(r"^\{\{[#/]")


def _is_block_marker(ph: str) -> bool:
    return bool(_BLOCK_MARKER_RE.match(ph))


def _compute_is_valid(detected: list[str], mappings: dict) -> bool:
    return bool(detected) and all(ph in mappings for ph in detected)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, detected_placeholders, mappings FROM templates")
    ).fetchall()

    for row in rows:
        detected_raw = row.detected_placeholders
        mappings_raw = row.mappings

        # JSON columns may come back as str or already-parsed list/dict
        # depending on driver; normalize here.
        detected = json.loads(detected_raw) if isinstance(detected_raw, str) else detected_raw
        mappings = json.loads(mappings_raw) if isinstance(mappings_raw, str) else mappings_raw
        detected = list(detected or [])
        mappings = dict(mappings or {})

        cleaned = [ph for ph in detected if not _is_block_marker(ph)]
        # Drop any stale mapping entries pointing at block markers
        cleaned_mappings = {k: v for k, v in mappings.items() if not _is_block_marker(k)}

        if cleaned == detected and cleaned_mappings == mappings:
            continue  # nothing to do

        new_is_valid = _compute_is_valid(cleaned, cleaned_mappings)
        conn.execute(
            sa.text(
                "UPDATE templates SET detected_placeholders = :d, "
                "mappings = :m, is_valid = :v WHERE id = :id"
            ),
            {
                "d": json.dumps(cleaned),
                "m": json.dumps(cleaned_mappings),
                "v": new_is_valid,
                "id": row.id,
            },
        )


def downgrade() -> None:
    # Data-only migration: no reliable inverse (we've dropped the markers).
    # Intentional no-op — upgrade is idempotent so re-running is safe.
    pass
