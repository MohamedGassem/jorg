"""recompute_template_validity_for_docxtpl

Revision ID: f1a2b3c4d5e6
Revises: d1e2f3a4b5c6
Create Date: 2026-05-06

After migrating the document engine to docxtpl (Jinja2), the template
validation model changed:

- Old engine: recruiters mapped arbitrary placeholder names (e.g. {{NOM}})
  to field paths via a wizard. is_valid required all placeholders to have
  a manual mapping.

- New engine: templates use standard field names directly ({{first_name}},
  {{last_name}}, etc.). These map to themselves; no wizard step is needed.
  Jinja2 loop variables ({{exp.*}}, {{sk.*}}) are filtered out by the parser
  and never stored in detected_placeholders.

This migration re-applies the new auto-mapping logic to all existing rows:

1. Templates whose detected_placeholders are entirely composed of known
   standard field names -> mappings auto-populated, is_valid set to True.

2. Templates with any unknown placeholder (old Mustache templates) ->
   mappings reset to {}, is_valid set to False. These templates use the
   old {{#BLOCK}} syntax and cannot be rendered by the new engine; they
   must be recreated.

Downgrade: no-op (data-only, non-reversible by design).
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Keep in sync with _KNOWN_PLACEHOLDERS in services/template_service.py.
_KNOWN_PLACEHOLDERS: frozenset[str] = frozenset(
    f"{{{{{k}}}}}"
    for k in (
        "first_name",
        "last_name",
        "title",
        "summary",
        "phone",
        "email_contact",
        "linkedin_url",
        "location",
        "years_of_experience",
        "daily_rate",
        "annual_salary",
        "availability_status",
        "work_mode",
        "location_preference",
        "mission_duration",
        "contract_type",
        "preferred_domains",
    )
)


def _auto_mappings(detected: list[str]) -> dict[str, str]:
    return {ph: ph[2:-2] for ph in detected if ph in _KNOWN_PLACEHOLDERS}


def _compute_is_valid(detected: list[str], mappings: dict[str, str]) -> bool:
    return bool(detected) and all(ph in mappings for ph in detected)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, detected_placeholders, mappings, is_valid FROM templates")
    ).fetchall()

    for row in rows:
        raw_detected = row.detected_placeholders
        detected: list[str] = (
            json.loads(raw_detected) if isinstance(raw_detected, str) else list(raw_detected or [])
        )

        new_mappings = _auto_mappings(detected)
        new_is_valid = _compute_is_valid(detected, new_mappings)

        # Skip rows that are already correct to minimise write amplification.
        raw_mappings = row.mappings
        existing_mappings: dict[str, str] = (
            json.loads(raw_mappings) if isinstance(raw_mappings, str) else dict(raw_mappings or {})
        )
        if existing_mappings == new_mappings and bool(row.is_valid) == new_is_valid:
            continue

        conn.execute(
            sa.text("UPDATE templates SET mappings = :m, is_valid = :v WHERE id = :id"),
            {"m": json.dumps(new_mappings), "v": new_is_valid, "id": row.id},
        )


def downgrade() -> None:
    raise NotImplementedError(
        "This migration is data-only and cannot be safely reversed. "
        "To roll back, restore the templates table from a pre-migration backup."
    )
