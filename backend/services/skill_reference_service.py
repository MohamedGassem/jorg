"""Backward-compatible imports for skill reference services."""

from services.references.skill_reference_service import (
    get_or_create_by_name as get_or_create_by_name,
)
from services.references.skill_reference_service import (
    search as search,
)
from services.references.skill_reference_service import (
    slugify as slugify,
)
