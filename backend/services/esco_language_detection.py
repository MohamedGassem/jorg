from __future__ import annotations

from services.text_utils import normalize_text


def _normalize(value: str | None) -> str:
    return normalize_text(value or "")


def is_esco_language_reference(
    name: str | None,
    description: str | None,
    esco_skill_type: str | None,
) -> bool:
    """Return True for ESCO rows that are natural-language references.

    ESCO models natural languages such as French or Galician as ``knowledge``.
    In Jorg those belong to the dedicated ``languages`` profile section, not
    to the skill reference catalog. Programming languages and language-related
    professional skills must remain normal skills.
    """
    if _normalize(esco_skill_type) != "knowledge":
        return False

    normalized_name = _normalize(name)
    normalized_description = _normalize(description)
    combined = f"{normalized_name} {normalized_description}"

    if any(
        marker in combined
        for marker in (
            "langue informatique",
            "langage informatique",
            "langage de programmation",
            "programming language",
            "logiciel",
            "developpement de logiciels",
        )
    ):
        return False

    return (
        normalized_description.startswith("la langue ")
        or normalized_description.startswith("toutes les langues mortes")
        or (
            normalized_name == "langue des signes"
            and "systeme de communication" in normalized_description
        )
    )
