from __future__ import annotations

from services.cv.constants import (
    _DATE_RE,
    _EMAIL_RE,
    _SECTION_KEYWORDS_NORMALIZED,
    MIN_USABLE_TEXT_CHARS,
)
from services.cv.schemas import QualityScore
from services.text_utils import normalize_text as _normalise


def score_text_quality(text: str) -> QualityScore:
    punctuation = ".,;:/@+-_()[]'"
    readable = sum(
        1 for c in text if c.isprintable() and (c.isalnum() or c.isspace() or c in punctuation)
    )
    total = max(len(text), 1)
    readable_ratio = readable / total
    line_count = len([line for line in text.splitlines() if line.strip()])
    normalized = _normalise(text)
    section_hits = sum(
        1
        for norm_keywords in _SECTION_KEYWORDS_NORMALIZED.values()
        if any(k in normalized for k in norm_keywords)
    )
    has_email = bool(_EMAIL_RE.search(text))
    has_dates = bool(_DATE_RE.search(text))
    length = len(text.strip())

    score = 0
    score += min(25, int(length / 40))
    score += 15 if has_email else 0
    score += 15 if has_dates else 0
    score += min(25, section_hits * 6)
    score += min(10, line_count)
    score += 10 if readable_ratio >= 0.85 else int(readable_ratio * 10)
    score = min(score, 100)

    warnings: list[str] = []
    if length < MIN_USABLE_TEXT_CHARS:
        warnings.append("Le texte extrait est très court; une relecture attentive est nécessaire.")
    if section_hits < 2:
        warnings.append("Peu de sections de CV ont été reconnues automatiquement.")
    if readable_ratio < 0.75:
        warnings.append("Le texte extrait contient beaucoup de caractères peu lisibles.")

    return QualityScore(
        score=score,
        details={
            "length": length,
            "has_email": has_email,
            "has_dates": has_dates,
            "section_hits": section_hits,
            "readable_ratio": round(readable_ratio, 3),
            "line_count": line_count,
        },
        warnings=warnings,
    )
