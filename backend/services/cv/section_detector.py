from __future__ import annotations

from typing import ClassVar

from services.cv.constants import _SECTION_KEYWORDS
from services.cv.language_parser import _contains_human_language
from services.cv.schemas import DocumentLine, SectionBlock
from services.text_utils import normalize_text as _normalise


class SectionDetector:
    aliases: ClassVar[dict[str, frozenset[str]]] = {
        section: frozenset(_normalise(k) for k in keywords)
        for section, keywords in _SECTION_KEYWORDS.items()
    }

    def detect(self, lines: list[DocumentLine]) -> dict[str, SectionBlock]:
        sections: dict[str, SectionBlock] = {
            "identity": SectionBlock("identity", None, [], 0.8),
        }
        current = "identity"
        current_title: DocumentLine | None = None
        scores: dict[str, float] = {"identity": 0.8}

        for line in lines:
            detected, score = self._section_for_line(line)
            if detected is not None:
                current = detected
                current_title = line
                sections.setdefault(current, SectionBlock(current, current_title, [], score))
                scores[current] = max(scores.get(current, 0), score)
                continue
            block = sections.get(current)
            if block is None:
                block = SectionBlock(current, current_title, [], scores.get(current, 0.5))
                sections[current] = block
            block.lines.append(line)

        return {
            name: SectionBlock(name, block.title, block.lines, scores.get(name, block.confidence))
            for name, block in sections.items()
        }

    def _section_for_line(self, line: DocumentLine) -> tuple[str | None, float]:
        normalized = _normalise(line.text)
        if not normalized or len(normalized) > 45:
            return None, 0

        if ":" in line.text:
            prefix, suffix = line.text.split(":", 1)
            prefix_norm = _normalise(prefix)
            if prefix_norm in self.aliases["languages"] and _contains_human_language(suffix):
                return "languages", 0.85
            return None, 0

        for section, aliases in self.aliases.items():
            if normalized in aliases:
                style_bonus = 0.08 if line.is_bold else 0
                size_bonus = 0.05 if (line.font_size or 0) >= 12 else 0
                return section, min(0.98, 0.82 + style_bonus + size_bonus)
        return None, 0
