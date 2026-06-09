from __future__ import annotations

import re

from services.cv.constants import _HUMAN_LANGUAGES, _PROGRAMMING_LANGUAGE_NAMES
from services.cv.schemas import DocumentLine, LanguageProposal, _field
from services.references.language_reference_service import LanguageIndex
from services.text_utils import normalize_text as _normalise


class LanguageParser:
    def __init__(self, language_index: LanguageIndex | None = None) -> None:
        self._index: LanguageIndex = language_index if language_index else _HUMAN_LANGUAGES

    def parse(self, lines: list[DocumentLine]) -> list[LanguageProposal]:
        languages: dict[str, LanguageProposal] = {}
        for line in lines:
            # Split only on list separators, NOT on " - ": the dash usually joins
            # a language to its level ("Anglais - C1"), which must stay together
            # so _extract_language_level can read the level from the same part.
            for raw_part in re.split(r"[,;]", line.text):
                normalized_part = _normalise(raw_part)
                for normalized_language, display in self._index.items():
                    if re.search(rf"\b{re.escape(normalized_language)}\b", normalized_part):
                        level = _extract_language_level(raw_part)
                        languages[display] = LanguageProposal(
                            name=_field(display, raw_part.strip(), "languages", 0.9, False),
                            level=_field(
                                level,
                                raw_part.strip(),
                                "languages",
                                0.82 if level else 0,
                                level is None,
                            ),
                        )
        return list(languages.values())


def _contains_human_language(text: str) -> bool:
    normalized = _normalise(text)
    return any(
        re.search(rf"\b{re.escape(language)}\b", normalized) for language in _HUMAN_LANGUAGES
    )


def _is_human_language_label(label: str) -> bool:
    normalized = _normalise(label)
    return normalized in _HUMAN_LANGUAGES and normalized not in _PROGRAMMING_LANGUAGE_NAMES


def _extract_language_level(text: str) -> str | None:
    normalized = _normalise(text)
    if "natif" in normalized or "native" in normalized:
        return "native"
    cefr = re.search(r"\b(A1|A2|B1|B2|C1|C2)\b", text.upper())
    return cefr.group(1) if cefr else None
