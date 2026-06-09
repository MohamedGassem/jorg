"""Backward-compatible imports for language reference services."""

from services.references.language_reference_service import (
    LanguageIndex as LanguageIndex,
)
from services.references.language_reference_service import (
    build_language_index as build_language_index,
)
from services.references.language_reference_service import (
    list_all as list_all,
)
from services.references.language_reference_service import (
    search as search,
)
from services.references.language_reference_service import (
    slugify_language as slugify_language,
)
