from __future__ import annotations

import re

from services.cv.constants import _GENERIC_SKILL_PREFIXES
from services.cv.language_parser import _contains_human_language, _is_human_language_label
from services.cv.schemas import DocumentLine, SkillProposal
from services.text_utils import normalize_text as _normalise


class SkillParser:
    def parse(self, lines: list[DocumentLine]) -> list[SkillProposal]:
        labels: list[str] = []
        for line in lines:
            if _contains_human_language(line.text) and _normalise(line.text).startswith("langues"):
                continue
            labels.extend(_skill_labels_from_line(line.text))
        return [
            SkillProposal(
                original_label=label,
                normalized_label=_normalise(label),
                evidence_text=label,
                source_section="skills",
                needs_review=True,
            )
            for label in labels[:80]
            if not _is_human_language_label(label)
        ]


def _skill_labels_from_line(line: str) -> list[str]:
    candidates: list[str] = []
    if ":" in line:
        prefix, suffix = line.split(":", 1)
        if _normalise(prefix) in _GENERIC_SKILL_PREFIXES:
            candidates.extend(_split_skill_tokens(suffix))
        else:
            candidates.extend(_split_skill_tokens(prefix))
            candidates.extend(_split_skill_tokens(suffix))
    else:
        candidates.extend(_split_skill_tokens(line))

    seen: set[str] = set()
    labels: list[str] = []
    for candidate in candidates:
        label = _clean_skill_label(candidate)
        norm = _normalise(label)
        if not (2 < len(label) <= 80) or norm in seen or norm in _GENERIC_SKILL_PREFIXES:
            continue
        seen.add(norm)
        labels.append(label)
    return labels


def _split_skill_tokens(value: str) -> list[str]:
    parts = re.split(r"[,;•·|/]|\s+(?:&|\+)\s+", value)
    return [part for part in parts if part.strip()]


def _clean_skill_label(value: str) -> str:
    label = value.strip(" -\t()")
    label = re.sub(r"\s+", " ", label)
    return label
