from __future__ import annotations

import re

from services.cv.constants import _DATE_RANGE_RE, _MONTHS
from services.cv.schemas import DateRange, DocumentLine
from services.text_utils import normalize_text as _normalise


def _parse_date_range(text: str) -> DateRange | None:
    match = _DATE_RANGE_RE.search(text)
    if match is None:
        year_match = re.search(
            r"\b((?:19|20)\d{2})\s*[-\u2013\u2014]\s*((?:19|20)\d{2})\b",
            text,
        )
        if not year_match:
            return None
        return DateRange(
            start=year_match.group(1),
            end=year_match.group(2),
            is_current=False,
            evidence=text,
            confidence=0.75,
        )
    end_raw = match.group("end")
    is_current = _normalise(end_raw) in {"actuel", "present"}
    return DateRange(
        start=_normalise_date_value(match.group("start")),
        end=None if is_current else _normalise_date_value(end_raw),
        is_current=is_current,
        evidence=text,
        confidence=0.86 if not is_current else 0.8,
    )


def _parse_date_range_at(lines: list[DocumentLine], index: int) -> DateRange | None:
    direct = _parse_date_range(lines[index].text)
    if direct is not None:
        return direct
    if index + 1 >= len(lines):
        return None
    if not re.search(r"[-\u2013\u2014]", lines[index].text) or not _is_year_only(
        lines[index + 1].text
    ):
        return None
    continuation = f"{lines[index].text} {lines[index + 1].text}"
    return _parse_date_range(continuation)


def _normalise_date_value(value: str) -> str | None:
    cleaned = _normalise(value.replace(".", " "))
    year_match = re.search(r"\b((?:19|20)\d{2})\b", cleaned)
    if not year_match:
        return None
    year = year_match.group(1)
    month = next(
        (number for name, number in _MONTHS.items() if re.search(rf"\b{name}\b", cleaned)),
        None,
    )
    return f"{year}-{month}" if month else year


def _is_year_only(text: str) -> bool:
    return bool(re.fullmatch(r"(?:19|20)\d{2}", text.strip()))
