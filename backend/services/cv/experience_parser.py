from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import pairwise

from services.cv.constants import (
    _BULLET_PREFIX_RE,
    _CONTRACT_PHRASE_RE,
    _EMAIL_RE,
    _KNOWN_LOCATION_TOKENS,
    _LOCATION_WITH_DEPT_RE,
    _ROLE_HINT_WORDS,
)
from services.cv.date_parser import (
    _is_date_fragment,
    _is_year_only,
    _parse_date_range,
    _parse_date_range_at,
)
from services.cv.schemas import DateRange, DocumentLine, ExperienceProposal, _field
from services.text_utils import normalize_text as _normalise


@dataclass(frozen=True)
class _HeaderFields:
    role: str | None = None
    company: str | None = None
    location: str | None = None
    contract_type: str | None = None


class ExperienceBlockParser:
    def parse(self, lines: list[DocumentLine]) -> list[ExperienceProposal]:
        lines = _merge_wrapped_headers(lines)
        header_blocks = _segment_by_header_indent(lines)
        if header_blocks is not None:
            return [_parse_header_block(block) for block in header_blocks]
        return _parse_by_dates(lines)


# --- Segmentation -------------------------------------------------------------

# Headers sit at the section's left margin while bullets and wrapped lines are
# indented; 2 pt of tolerance absorbs PDF rounding without catching indented text.
_HEADER_INDENT_TOLERANCE = 2.0
# A date belongs to the experience header printed on the same visual row; the
# two-line tolerance absorbs right-column dates rendered slightly below.
_HEADER_DATE_Y_TOLERANCE = 15.0
# A backwards y jump on the same page means the reading order left the column
# (e.g. sidebar content appended after the main flow).
_COLUMN_BREAK_Y_JUMP = 40.0


def _segment_by_header_indent(lines: list[DocumentLine]) -> list[list[DocumentLine]] | None:
    """Split an experience section into per-job blocks using left-margin indentation.

    In two-column CV layouts the date of a job can appear after the next job's
    header in reading order, so date-based segmentation misassigns content.
    Header lines are reliably the least-indented (and bold, when the document
    carries font info) lines of the section. Returns None (caller falls back to
    date-based segmentation) when position data is missing or when the resulting
    blocks don't each contain exactly one date, which guards against flat
    layouts where indentation is meaningless.
    """
    if not lines or any(line.x0 is None for line in lines):
        return None
    min_x = min(line.x0 for line in lines)
    has_bold_info = any(line.is_bold for line in lines)
    header_indices = [
        index
        for index, line in enumerate(lines)
        if line.x0 - min_x <= _HEADER_INDENT_TOLERANCE
        and (line.is_bold or not has_bold_info)
        and _is_block_header_candidate(line.text)
    ]
    if len(header_indices) < 2 or header_indices[0] != 0:
        return None
    bounds = [*header_indices, len(lines)]
    blocks = [lines[start:end] for start, end in pairwise(bounds)]
    for block in blocks:
        dates = [idx for idx in range(len(block)) if _parse_date_range_at(block, idx) is not None]
        if len(dates) != 1:
            return None
    return blocks


def _merge_wrapped_headers(lines: list[DocumentLine]) -> list[DocumentLine]:
    """Glue header lines wrapped on a hyphen ("Centre de Soin ..., Bourgoin-" / "Jailleu 38").

    The continuation may not be the immediately following line because dates in a
    right column can interleave, so the next two lines are searched. Continuations
    are required to be short fragments at the same indentation; long sentences are
    wrapped body text, not header remainders.
    """
    merged: list[DocumentLine] = []
    consumed: set[int] = set()
    for index, line in enumerate(lines):
        if index in consumed:
            continue
        if (
            line.is_bold
            and line.x0 is not None
            and line.text.endswith("-")
            and _is_block_header_candidate(line.text)
        ):
            for offset in (1, 2):
                candidate = lines[index + offset] if index + offset < len(lines) else None
                if (
                    candidate is not None
                    and candidate.is_bold
                    and candidate.x0 is not None
                    and abs(candidate.x0 - line.x0) <= _HEADER_INDENT_TOLERANCE
                    and len(candidate.text.strip()) <= 40
                    and not _is_date_fragment(candidate.text)
                ):
                    line = line.model_copy(
                        update={"text": _join_hyphenated(line.text, candidate.text)}
                    )
                    consumed.add(index + offset)
                    break
        merged.append(line)
    return merged


def _parse_header_block(block: list[DocumentLine]) -> ExperienceProposal:
    header = block[0]
    fields = _parse_header_fields(header.text)
    date_range = next(
        date
        for idx in range(1, len(block))
        if (date := _parse_date_range_at(block, idx)) is not None
    )
    company = fields.company
    company_evidence = header.text if company else None
    company_line: DocumentLine | None = None
    if company is None and header.x0 is not None:
        company_line = next(
            (
                line
                for line in block[1:]
                if line.x0 is not None
                and abs(line.x0 - header.x0) <= _HEADER_INDENT_TOLERANCE
                and _is_content_line(line.text)
                and _is_block_header_candidate(line.text)
            ),
            None,
        )
        if company_line is not None:
            company, line_location = _parse_company_line(company_line.text)
            company_evidence = company_line.text
            if fields.location is None and line_location:
                fields = _HeaderFields(
                    fields.role, fields.company, line_location, fields.contract_type
                )
    location, location_evidence = fields.location, header.text
    if location is None:
        location_line = next((line for line in block[1:] if _looks_like_location(line.text)), None)
        if location_line is not None:
            location = location_line.text.strip()
            location_evidence = location_line.text
    body = [line for line in block[1:] if line is not company_line and _is_content_line(line.text)]
    description, achievement_texts = _split_body(body)
    return _build_experience(
        fields.role,
        header.text,
        company,
        company_evidence,
        location,
        location_evidence,
        fields.contract_type,
        header.text,
        date_range,
        description,
        achievement_texts,
    )


def _parse_by_dates(lines: list[DocumentLine]) -> list[ExperienceProposal]:
    date_positions: list[tuple[int, DateRange]] = []
    for idx in range(len(lines)):
        date_range = _parse_date_range_at(lines, idx)
        if date_range is not None:
            date_positions.append((idx, date_range))
    if not date_positions:
        description, achievement_texts = _split_body([line for line in lines if len(line.text) > 8])
        if not description and not achievement_texts:
            return []
        return [
            ExperienceProposal(
                description=_field(description, description, "experience", 0.42, True),
                achievements=[
                    _field(text, text, "experience", 0.56, True) for text in achievement_texts
                ],
            )
        ]
    body_sizes = sorted(line.font_size for line in lines if line.font_size)
    median_size = body_sizes[len(body_sizes) // 2] if body_sizes else None
    has_bold_info = any(line.is_bold for line in lines)
    experiences: list[ExperienceProposal] = []
    for order, (date_idx, date_range) in enumerate(date_positions):
        prev_date_idx = date_positions[order - 1][0] if order > 0 else -1
        next_date_idx = (
            date_positions[order + 1][0] if order + 1 < len(date_positions) else len(lines)
        )
        before = [
            line
            for line in lines[prev_date_idx + 1 : date_idx]
            if _is_block_header_candidate(line.text)
        ]
        after = _cut_at_column_break(lines[date_idx + 1 : next_date_idx])
        after = _truncate_at_next_job_header(
            after, lines[next_date_idx] if next_date_idx < len(lines) else None
        )
        if not before and not after:
            continue

        header = _select_header(before, lines[date_idx])
        first_bullet_in_after = next(
            (i for i, line in enumerate(after) if _is_bullet_line(line.text)),
            len(after),
        )
        company_after = next(
            (
                line
                for line in after[: min(3, first_bullet_in_after)]
                if _is_block_header_candidate(line.text)
                and _is_content_line(line.text)
                and (line.is_bold or not has_bold_info)
            ),
            None,
        )
        fields = _parse_header_fields(header.text) if header else _HeaderFields()
        company = fields.company
        company_evidence = header.text if (header and company) else None
        description_start = 0
        if company_after is not None and not company:
            company, after_location = _parse_company_line(company_after.text)
            company_evidence = company_after.text
            if fields.location is None and after_location:
                fields = _HeaderFields(
                    fields.role, fields.company, after_location, fields.contract_type
                )
            description_start = after.index(company_after) + 1

        location, location_evidence = fields.location, header.text if header else None
        if location is None:
            location_line = next((line for line in after if _looks_like_location(line.text)), None)
            if location_line is not None:
                location = location_line.text.strip()
                location_evidence = location_line.text

        body = [
            line
            for line in after[description_start:]
            if _is_content_line(line.text) and not _is_oversized(line, median_size)
        ]
        description, achievement_texts = _split_body(body)
        experiences.append(
            _build_experience(
                fields.role,
                header.text if header else None,
                company,
                company_evidence,
                location,
                location_evidence,
                fields.contract_type,
                header.text if header else None,
                date_range,
                description,
                achievement_texts,
            )
        )
    return experiences


def _select_header(before: list[DocumentLine], date_line: DocumentLine) -> DocumentLine | None:
    """Pick the header line for a date: the bold candidate on the same visual row.

    Wrapped body lines also land in `before`, so when position data exists the
    header must sit on the date's row; otherwise the last candidate wins.
    """
    if not before:
        return None
    if date_line.y0 is None or all(line.y0 is None for line in before):
        return before[-1]
    has_bold_info = any(line.is_bold for line in before)
    aligned = [
        line
        for line in before
        if line.y0 is not None
        and abs(line.y0 - date_line.y0) <= _HEADER_DATE_Y_TOLERANCE
        and (line.is_bold or not has_bold_info)
    ]
    return aligned[-1] if aligned else None


def _truncate_at_next_job_header(
    after: list[DocumentLine], next_date_line: DocumentLine | None
) -> list[DocumentLine]:
    """Drop trailing lines that belong to the next job.

    In layouts where a job's date is printed before its content, the next job's
    header (the bold line on the next date's row) appears inside `after`.
    """
    if next_date_line is None or next_date_line.y0 is None:
        return after
    for index, line in enumerate(after):
        if (
            line.y0 is not None
            and abs(line.y0 - next_date_line.y0) <= _HEADER_DATE_Y_TOLERANCE
            and line.is_bold
            and _is_block_header_candidate(line.text)
        ):
            return after[:index]
    return after


def _is_oversized(line: DocumentLine, median_size: float | None) -> bool:
    """Section pseudo-titles render noticeably larger than body text."""
    if line.font_size is None or median_size is None:
        return False
    return line.font_size > median_size * 1.15


def _cut_at_column_break(after: list[DocumentLine]) -> list[DocumentLine]:
    for index in range(1, len(after)):
        prev, curr = after[index - 1], after[index]
        if (
            prev.y0 is not None
            and curr.y0 is not None
            and curr.page == prev.page
            and prev.y0 - curr.y0 > _COLUMN_BREAK_Y_JUMP
        ):
            return after[:index]
    return after


def _build_experience(
    role: str | None,
    role_evidence: str | None,
    company: str | None,
    company_evidence: str | None,
    location: str | None,
    location_evidence: str | None,
    contract_type: str | None,
    contract_evidence: str | None,
    date_range: DateRange,
    description: str | None,
    achievement_texts: list[str],
) -> ExperienceProposal:
    confidence = 0.78 if (role or company) else 0.55
    return ExperienceProposal(
        role=_field(role, role_evidence, "experience", confidence, True),
        client_name=_field(company, company_evidence, "experience", confidence, True),
        location=_field(location, location_evidence, "experience", 0.7, True),
        contract_type=_field(contract_type, contract_evidence, "experience", 0.7, True),
        start_date=_field(
            date_range.start,
            date_range.evidence,
            "experience",
            date_range.confidence,
            True,
        ),
        end_date=_field(
            date_range.end,
            date_range.evidence,
            "experience",
            date_range.confidence,
            date_range.is_current,
        ),
        is_current=date_range.is_current,
        description=_field(
            description,
            description,
            "experience",
            0.72 if description else 0,
            True,
        ),
        achievements=[_field(text, text, "experience", 0.68, True) for text in achievement_texts],
    )


# --- Header field parsing ------------------------------------------------------

_PAREN_RE = re.compile(r"\([^)]*\)")
_CONTRACT_REMOVE_RE = re.compile(
    r"\s*\ben\s+(?:CDI|CDD|stage|alternance|apprentissage|freelance|free-lance|intérim|interim)"
    r"(?:\s+et\s+(?:CDI|CDD|stage|alternance|apprentissage|freelance|free-lance|intérim|interim))*\b",
    re.IGNORECASE,
)


def _parse_header_fields(text: str) -> _HeaderFields:
    stripped = " ".join(text.split())
    if not stripped:
        return _HeaderFields()
    contract = _extract_contract_label(stripped)
    cleaned = _CONTRACT_REMOVE_RE.sub("", stripped).strip(" ,;")
    masked, parens = _mask_parens(cleaned)

    if " chez " in masked:
        role_part, company_part = masked.split(" chez ", 1)
        return _HeaderFields(
            role=_unmask(role_part, parens) or None,
            company=_unmask(company_part, parens) or None,
            contract_type=contract,
        )

    dash_segments = [seg.strip() for seg in re.split(r"\s+[-–—]\s+", masked) if seg.strip()]  # noqa: RUF001
    if len(dash_segments) == 3 and _looks_like_location(_unmask(dash_segments[2], parens)):
        return _HeaderFields(
            role=_unmask(dash_segments[0], parens),
            company=_unmask(dash_segments[1], parens),
            location=_unmask(dash_segments[2], parens),
            contract_type=contract,
        )
    if len(dash_segments) in (2, 3) and _is_contract_word(dash_segments[0]):
        return _HeaderFields(
            role=_unmask(dash_segments[1], parens),
            company=_unmask(dash_segments[2], parens) if len(dash_segments) == 3 else None,
            contract_type=contract or _format_contract(_normalise(dash_segments[0])),
        )

    if "," in masked:
        left, right = (part.strip() for part in masked.split(",", 1))
        left_text, right_text = _unmask(left, parens), _unmask(right, parens)
        if _looks_like_location(right_text):
            return _HeaderFields(
                role=left_text if _has_role_hint(left_text) else None,
                company=None if _has_role_hint(left_text) else left_text,
                location=right_text,
                contract_type=contract,
            )
        if _has_role_hint(left_text) and not _has_role_hint(right_text):
            return _HeaderFields(role=left_text, company=right_text, contract_type=contract)
        return _HeaderFields(role=right_text, company=left_text, contract_type=contract)

    return _HeaderFields(role=_unmask(masked, parens) or None, contract_type=contract)


def _parse_company_line(text: str) -> tuple[str | None, str | None]:
    """Parse a standalone company line, e.g. "EUROFINS HYDROLOGIE EST, Nancy"."""
    stripped = " ".join(text.split())
    masked, parens = _mask_parens(stripped)
    if "," in masked:
        left, right = (part.strip() for part in masked.rsplit(",", 1))
        right_text = _unmask(right, parens)
        if _looks_like_location(right_text):
            return _unmask(left, parens) or None, right_text
    return _unmask(masked, parens) or None, None


def _extract_contract_label(text: str) -> str | None:
    match = _CONTRACT_PHRASE_RE.search(_normalise(text))
    return _format_contract(match.group("contract")) if match else None


def _format_contract(normalized: str) -> str:
    return " ".join(
        token.upper()
        if token in {"cdi", "cdd"}
        else (token if token == "et" else token.capitalize())
        for token in normalized.split()
    )


def _is_contract_word(text: str) -> bool:
    return bool(_CONTRACT_PHRASE_RE.fullmatch(_normalise(text).strip()))


def _has_role_hint(text: str) -> bool:
    return any(token in _ROLE_HINT_WORDS for token in _normalise(text).split())


def _looks_like_location(text: str) -> bool:
    stripped = " ".join(text.split()).strip(" .")
    if not stripped or len(stripped) > 40:
        return False
    if _normalise(stripped) in _KNOWN_LOCATION_TOKENS:
        return True
    if re.fullmatch(r"\d{2,3}", stripped):
        return True
    return bool(_LOCATION_WITH_DEPT_RE.fullmatch(stripped) and len(stripped.split()) <= 4)


def _mask_parens(text: str) -> tuple[str, list[str]]:
    parens: list[str] = []

    def _stash(match: re.Match[str]) -> str:
        parens.append(match.group(0))
        return f"\x00{len(parens) - 1}\x00"

    return _PAREN_RE.sub(_stash, text), parens


def _unmask(text: str, parens: list[str]) -> str:
    for index, content in enumerate(parens):
        text = text.replace(f"\x00{index}\x00", content)
    return text.strip(" ,;")


# --- Body parsing ---------------------------------------------------------------


def _is_block_header_candidate(text: str) -> bool:
    stripped = text.strip()
    if not stripped or _parse_date_range(stripped) is not None or _is_year_only(stripped):
        return False
    if _is_date_fragment(stripped):
        return False
    if stripped.startswith(("•", "-")):
        return False
    if _EMAIL_RE.search(stripped):
        return False
    if _normalise(stripped) in _KNOWN_LOCATION_TOKENS:
        return False
    return len(stripped) <= 120


def _is_content_line(text: str) -> bool:
    """Minimal pre-filter: drop dates, date fragments, and pure location lines.

    Deliberately does NOT reject short lines so that continuation lines of
    multi-line bullets reach the body splitter, which folds them correctly.
    """
    stripped = text.strip()
    if not stripped or _parse_date_range(stripped) is not None or _is_year_only(stripped):
        return False
    if _is_date_fragment(stripped):
        return False
    return not _looks_like_location(stripped)


def _is_bullet_line(text: str) -> bool:
    return bool(_BULLET_PREFIX_RE.match(text)) and bool(_strip_bullet(text))


def _strip_bullet(text: str) -> str:
    return _BULLET_PREFIX_RE.sub("", text, count=1).strip()


def _join_hyphenated(prev: str, continuation: str) -> str:
    """Join a line wrapped on a hyphen with its continuation.

    A lowercase continuation means the hyphen is a typographic break inside a
    word ("four-" / "nisseurs"); an uppercase one means a real compound
    ("Rolls-" / "Royce") whose hyphen must survive.
    """
    continuation = continuation.strip()
    if continuation[:1].islower():
        return prev[:-1] + continuation
    return prev + continuation


def _split_body(lines: list[DocumentLine]) -> tuple[str | None, list[str]]:
    """Split an experience body into a description and achievements.

    With bullet glyphs, delegates to the historical string-based splitter. Without
    them (some PDF layouts lose the glyphs or never had any), wrapped lines are
    folded into logical items using hyphenation, capitalisation, boldness and
    terminal punctuation.
    """
    texts = [line.text for line in lines if line.text.strip()]
    if not texts:
        return None, []
    if any(_is_bullet_line(text) for text in texts):
        return _split_description_and_achievements(texts)
    return None, _merge_wrapped_lines([line for line in lines if line.text.strip()])


def _merge_wrapped_lines(lines: list[DocumentLine]) -> list[str]:
    items: list[str] = []
    for line in lines:
        text = " ".join(line.text.split())
        if not items:
            items.append(text)
            continue
        prev = items[-1]
        if prev.endswith("-"):
            items[-1] = _join_hyphenated(prev, text)
        elif _starts_new_item(prev, line):
            items.append(text)
        else:
            items[-1] = f"{prev} {text}"
    return [item for item in items if item]


def _starts_new_item(prev: str, line: DocumentLine) -> bool:
    first = next((char for char in line.text if char.isalnum()), "")
    if not (first.isupper() or first.isdigit()):
        return False
    if line.is_bold:
        return True
    return prev.rstrip().endswith((".", "!", "?", ";", ":"))


def _split_description_and_achievements(
    raw_lines: list[str],
) -> tuple[str | None, list[str]]:
    """Split an experience body into a preamble and one achievement per bullet.

    When the block contains typographic bullets, the lines before the first
    bullet become the description and each bulleted line becomes an achievement
    (a non-bulleted line after a bullet is folded into the previous achievement,
    handling wrapped lines). When no bullet glyph survives extraction (e.g. Word
    auto-numbered lists), every line becomes its own achievement and the
    description stays empty, since a preamble cannot be told apart reliably.
    """
    lines = [line for line in raw_lines if line.strip()]
    if not lines:
        return None, []
    bullet_flags = [_is_bullet_line(line) for line in lines]
    if any(bullet_flags):
        first_bullet = bullet_flags.index(True)
        description = " ".join(line.strip() for line in lines[:first_bullet]).strip() or None
        achievements: list[str] = []
        for line, is_bullet in zip(lines[first_bullet:], bullet_flags[first_bullet:], strict=True):
            if is_bullet:
                achievements.append(_strip_bullet(line))
            elif achievements:
                prev = achievements[-1]
                if prev.endswith("-"):
                    achievements[-1] = _join_hyphenated(prev, line.strip())
                else:
                    achievements[-1] = f"{prev} {line.strip()}".strip()
        return description, [text for text in achievements if text]
    return None, [text for line in lines if (text := _strip_bullet(line))]
