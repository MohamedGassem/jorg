from __future__ import annotations

import re
import unicodedata

from services.cv.constants import _DATE_RANGE_RE, _MONTHS
from services.cv.schemas import DateRange, DocumentLine
from services.text_utils import normalize_text as _normalise


def _ascii_lower(text: str) -> str:
    """Lowercase + strip accents while preserving punctuation (slashes, dashes)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return decomposed.encode("ascii", "ignore").decode("ascii").lower()


_MONTH_ALT = "|".join(sorted(_MONTHS, key=len, reverse=True))
_YEAR = r"(?:19|20)\d{2}"
# "octobre 2023/juin 2024" — slash-separated full ranges (normalized text).
_SLASH_FULL_RE = re.compile(
    rf"\b(?P<start>(?:{_MONTH_ALT})\s+{_YEAR})\s*/\s*(?P<end>(?:{_MONTH_ALT})\s+{_YEAR})\b"
)
# "mars/mai 2023" — two months sharing one year.
_SLASH_MONTH_PAIR_RE = re.compile(
    rf"\b(?P<m1>{_MONTH_ALT})\s*/\s*(?P<m2>{_MONTH_ALT})\s+(?P<year>{_YEAR})\b"
)
# "2023/2024" — academic-style year range.
_SLASH_YEARS_RE = re.compile(rf"\b(?P<y1>{_YEAR})\s*/\s*(?P<y2>{_YEAR})\b")
# "depuis janvier 2025" / "since 2024" — open-ended current range.
_SINCE_RE = re.compile(rf"\b(?:depuis|since)\s+(?P<start>(?:(?:{_MONTH_ALT})\s+)?{_YEAR})\b")
_CURRENT_WORDS = {"actuel", "present", "aujourd hui"}
# Line made only of date tokens (wrapped dates, e.g. "sept. 2023 - mars" / "2025").
_DATE_TOKEN_RE = re.compile(
    rf"^(?:(?:{_MONTH_ALT})|{_YEAR}|actuel|present|aujourd|hui|depuis|since|a|au|et)$"
)


def _parse_date_range(text: str) -> DateRange | None:
    match = _DATE_RANGE_RE.search(text)
    if match is not None:
        end_raw = match.group("end")
        is_current = _normalise(end_raw) in _CURRENT_WORDS
        return DateRange(
            start=_normalise_date_value(match.group("start")),
            end=None if is_current else _normalise_date_value(end_raw),
            is_current=is_current,
            evidence=text,
            confidence=0.86 if not is_current else 0.8,
        )
    normalized = _ascii_lower(text)
    slash_full = _SLASH_FULL_RE.search(normalized)
    if slash_full is not None:
        return DateRange(
            start=_normalise_date_value(slash_full.group("start")),
            end=_normalise_date_value(slash_full.group("end")),
            is_current=False,
            evidence=text,
            confidence=0.82,
        )
    month_pair = _SLASH_MONTH_PAIR_RE.search(normalized)
    if month_pair is not None:
        year = month_pair.group("year")
        return DateRange(
            start=f"{year}-{_MONTHS[month_pair.group('m1')]}",
            end=f"{year}-{_MONTHS[month_pair.group('m2')]}",
            is_current=False,
            evidence=text,
            confidence=0.78,
        )
    since = _SINCE_RE.search(normalized)
    if since is not None:
        return DateRange(
            start=_normalise_date_value(since.group("start")),
            end=None,
            is_current=True,
            evidence=text,
            confidence=0.8,
        )
    year_match = re.search(rf"\b({_YEAR})\s*[-–—/]\s*({_YEAR})\b", text) or _SLASH_YEARS_RE.search(  # noqa: RUF001
        normalized
    )
    if year_match is not None:
        return DateRange(
            start=year_match.group(1),
            end=year_match.group(2),
            is_current=False,
            evidence=text,
            confidence=0.75,
        )
    return None


def _parse_date_range_at(lines: list[DocumentLine], index: int) -> DateRange | None:
    """Parse a date range at a line, joining a wrapped year from the next lines.

    Two-column layouts can interleave an unrelated line between a date and its
    wrapped year ("SEPTEMBRE/DÉCEMBRE" / "Jailleu 38" / "2022"), so the year is
    searched on the next two lines.
    """
    direct = _parse_date_range(lines[index].text)
    if direct is not None:
        return direct
    if not _is_date_fragment(lines[index].text):
        return None
    for offset in (1, 2):
        if index + offset >= len(lines):
            break
        if _is_year_only(lines[index + offset].text):
            joined = _parse_date_range(f"{lines[index].text} {lines[index + offset].text}")
            if joined is not None:
                return joined
    # Bare "Month Year" line: a single-month engagement ("AOÛT 2025").
    single = _normalise_date_value(lines[index].text)
    if single is not None and "-" in single:
        return DateRange(
            start=single,
            end=single,
            is_current=False,
            evidence=lines[index].text,
            confidence=0.6,
        )
    return None


def _normalise_date_value(value: str) -> str | None:
    cleaned = _normalise(value.replace(".", " "))
    year_match = re.search(rf"\b({_YEAR})\b", cleaned)
    if not year_match:
        return None
    year = year_match.group(1)
    month = next(
        (number for name, number in _MONTHS.items() if re.search(rf"\b{name}\b", cleaned)),
        None,
    )
    return f"{year}-{month}" if month else year


def _is_year_only(text: str) -> bool:
    return bool(re.fullmatch(rf"{_YEAR}", text.strip()))


def _is_date_fragment(text: str) -> bool:
    """True when the line consists only of date tokens (months, years, separators).

    Catches wrapped date pieces like "sept. 2023 - mars" or "SEPTEMBRE/DECEMBRE"
    so they are not mistaken for experience content.
    """
    normalized = _normalise(text.replace("/", " ").replace(".", " "))
    tokens = normalized.split()
    if not tokens:
        return False
    if not any(token in _MONTHS or re.fullmatch(_YEAR, token) for token in tokens):
        return False
    return all(_DATE_TOKEN_RE.fullmatch(token) for token in tokens)
