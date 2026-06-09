from __future__ import annotations

from services.cv.constants import _BULLET_PREFIX_RE, _EMAIL_RE, _KNOWN_LOCATION_TOKENS
from services.cv.date_parser import _is_year_only, _parse_date_range, _parse_date_range_at
from services.cv.schemas import DateRange, DocumentLine, ExperienceProposal, _field
from services.text_utils import normalize_text as _normalise


class ExperienceBlockParser:
    def parse(self, lines: list[DocumentLine]) -> list[ExperienceProposal]:
        date_positions: list[tuple[int, DateRange]] = []
        for idx in range(len(lines)):
            date_range = _parse_date_range_at(lines, idx)
            if date_range is not None:
                date_positions.append((idx, date_range))
        experiences: list[ExperienceProposal] = []
        if not date_positions:
            description, achievement_texts = _split_description_and_achievements(
                [line.text for line in lines if len(line.text) > 8]
            )
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
            after = lines[date_idx + 1 : next_date_idx]
            if not before and not after:
                continue

            header = before[-1] if before else None
            company_after = next(
                (line for line in after[:3] if _is_block_header_candidate(line.text)),
                None,
            )
            company, role = _parse_experience_header(header.text if header else "")
            description_start = 0
            if company_after is not None and not company:
                company = company_after.text
                description_start = after.index(company_after) + 1

            description, achievement_texts = _split_description_and_achievements(
                [line.text for line in after[description_start:] if _is_description_line(line.text)]
            )
            confidence = 0.78 if (role or company) else 0.55
            role_evidence = header.text if header else None
            company_evidence = company_after.text if company_after is not None else role_evidence
            experiences.append(
                ExperienceProposal(
                    role=_field(role, role_evidence, "experience", confidence, True),
                    client_name=_field(
                        company,
                        company_evidence,
                        "experience",
                        confidence,
                        True,
                    ),
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
                    achievements=[
                        _field(text, text, "experience", 0.68, True) for text in achievement_texts
                    ],
                )
            )
        return experiences


def _is_block_header_candidate(text: str) -> bool:
    stripped = text.strip()
    if not stripped or _parse_date_range(stripped) is not None or _is_year_only(stripped):
        return False
    if stripped.startswith(("•", "-")):
        return False
    if _EMAIL_RE.search(stripped):
        return False
    if _normalise(stripped) in _KNOWN_LOCATION_TOKENS:
        return False
    return len(stripped) <= 120


def _parse_experience_header(text: str) -> tuple[str | None, str | None]:
    stripped = text.strip()
    if not stripped:
        return None, None
    if "," in stripped:
        company, role = stripped.split(",", 1)
        return company.strip() or None, role.strip() or None
    return None, stripped


def _is_description_line(text: str) -> bool:
    stripped = text.strip()
    if not stripped or _parse_date_range(stripped) is not None or _is_year_only(stripped):
        return False
    if _normalise(stripped) in _KNOWN_LOCATION_TOKENS:
        return False
    return not _is_block_header_candidate(stripped) or stripped.startswith(("•", "-"))


def _is_bullet_line(text: str) -> bool:
    return bool(_BULLET_PREFIX_RE.match(text)) and bool(_strip_bullet(text))


def _strip_bullet(text: str) -> str:
    return _BULLET_PREFIX_RE.sub("", text, count=1).strip()


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
                achievements[-1] = f"{achievements[-1]} {line.strip()}".strip()
        return description, [text for text in achievements if text]
    return None, [text for line in lines if (text := _strip_bullet(line))]
