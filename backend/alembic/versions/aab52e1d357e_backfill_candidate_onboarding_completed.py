"""backfill_candidate_onboarding_completed

Revision ID: aab52e1d357e
Revises: 7081930abcde
Create Date: 2026-07-04 11:13:43.785213

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aab52e1d357e"
down_revision: str | Sequence[str] | None = "7081930abcde"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Mark existing candidates with substantial data as onboarded.

    Testers who already have a title or at least one experience should not be
    sent back through the tunnel (and risk re-importing duplicates) once the
    layout gate goes live. A skipper with no data is left at ``false`` on
    purpose: onboarding completion is an explicit fact, never derived.
    """
    op.execute(
        """
        UPDATE candidate_profiles
        SET onboarding_completed = true
        WHERE onboarding_completed = false
          AND (
            (title IS NOT NULL AND btrim(title) <> '')
            OR id IN (SELECT DISTINCT profile_id FROM experiences)
          )
        """
    )


def downgrade() -> None:
    """No-op: a data backfill cannot be reversed without losing information."""
    pass
