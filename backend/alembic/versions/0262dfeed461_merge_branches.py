"""merge branches

Revision ID: 0262dfeed461
Revises: 95a63251072c, b2c3d4e5f6a7
Create Date: 2026-04-22 08:28:37.945118

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0262dfeed461'
down_revision: Union[str, Sequence[str], None] = ('95a63251072c', 'b2c3d4e5f6a7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
