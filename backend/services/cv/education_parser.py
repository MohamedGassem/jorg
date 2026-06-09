from __future__ import annotations

import re

from services.cv.date_parser import _parse_date_range, _parse_date_range_at
from services.cv.schemas import DateRange, DocumentLine, EducationProposal, _field
from services.text_utils import normalize_text as _normalise


class EducationBlockParser:
    def parse(self, lines: list[DocumentLine]) -> list[EducationProposal]:
        date_positions: list[tuple[int, DateRange]] = []
        for idx in range(len(lines)):
            date_range = _parse_date_range_at(lines, idx)
            if date_range is not None:
                date_positions.append((idx, date_range))
        education: list[EducationProposal] = []
        used: set[int] = set()
        for date_idx, date_range in date_positions:
            previous = [
                line for line in lines[max(0, date_idx - 2) : date_idx] if line.text.strip()
            ]
            following = [line for line in lines[date_idx + 1 : date_idx + 3] if line.text.strip()]
            degree_line = previous[-1] if previous else None
            school_line = (
                following[0] if following else (previous[-2] if len(previous) > 1 else None)
            )
            if school_line is not None and _looks_like_non_education_heading(school_line.text):
                school_line = None
            if degree_line is None and school_line is None:
                continue
            used.add(date_idx)
            parsed_school, degree, field = _parse_education_header(
                degree_line.text if degree_line else ""
            )
            school_value = school_line.text if school_line else parsed_school
            education.append(
                EducationProposal(
                    school=_field(
                        school_value,
                        school_value,
                        "education",
                        0.76,
                        True,
                    ),
                    degree=_field(
                        degree,
                        degree_line.text if degree_line else None,
                        "education",
                        0.76,
                        True,
                    ),
                    field_of_study=_field(
                        field,
                        degree_line.text if degree_line else None,
                        "education",
                        0.7,
                        True,
                    ),
                    start_date=_field(
                        date_range.start,
                        date_range.evidence,
                        "education",
                        0.8,
                        True,
                    ),
                    end_date=_field(date_range.end, date_range.evidence, "education", 0.8, True),
                )
            )

        if education:
            return education

        for idx, line in enumerate(lines[:8]):
            if idx in used or len(line.text) < 5:
                continue
            education.append(
                EducationProposal(school=_field(line.text, line.text, "education", 0.45, True))
            )
        return education[:5]


def _parse_degree_and_field(text: str) -> tuple[str | None, str | None]:
    stripped = text.strip()
    if not stripped or _parse_date_range(stripped):
        return None, None
    if ":" in stripped:
        degree, field = stripped.split(":", 1)
        return degree.strip() or None, field.strip() or None
    return stripped, None


def _parse_education_header(text: str) -> tuple[str | None, str | None, str | None]:
    stripped = text.strip()
    if not stripped:
        return None, None, None
    normalized = _normalise(stripped)
    degree_keywords = ("diplome", "ingenieur", "licence", "bts", "master")
    for keyword in degree_keywords:
        match = re.search(rf"\b{keyword}\b", normalized)
        if match is None:
            continue
        prefix_word_count = len(normalized[: match.start()].split())
        words = stripped.split()
        index = len(" ".join(words[:prefix_word_count]))
        if index > 0:
            index += 1
        if index > 0:
            school = stripped[:index].strip(" ,-")
            degree_text = stripped[index:].strip()
            degree, field = _parse_degree_and_field(degree_text)
            return school or None, degree, field
    degree, field = _parse_degree_and_field(stripped)
    return None, degree, field


def _looks_like_non_education_heading(text: str) -> bool:
    normalized = _normalise(text)
    return normalized in {
        "projets",
        "projects",
        "technologies",
        "competences",
        "skills",
        "centres d interet",
    }
