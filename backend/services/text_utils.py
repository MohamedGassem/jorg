from __future__ import annotations

import re
import unicodedata


def normalize_text(value: str) -> str:
    """Canonical Unicode normalisation for fuzzy text matching.

    Applies casefold, strips combining diacritics (NFKD), and collapses
    all non-alphanumeric runs to a single space. Shared by cv_parser_service
    and esco_language_detection so both modules produce identical tokens
    for the same input.
    """
    if not value:
        return ""
    nfkd = unicodedata.normalize("NFKD", value.casefold())
    no_acc = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", no_acc).strip()
