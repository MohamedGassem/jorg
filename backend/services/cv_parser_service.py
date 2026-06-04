# backend/services/cv_parser_service.py
"""Extract contact details and ESCO skills from an uploaded CV.

Deterministic, dependency-light parsing (no LLM): text is extracted from
PDF/DOCX/TXT, contact fields are pulled with regexes, and skills are matched
against the ``skill_references`` table by normalised name/alias. The result is
a *suggestion* payload — it never mutates the profile; the candidate reviews
and confirms in the UI.
"""

from __future__ import annotations

import io
import re
import unicodedata
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillReference

MAX_CV_BYTES = 5 * 1024 * 1024  # 5 MB
_MIN_SKILL_LEN = 3  # ignore 1-2 char terms ("R", "C") to avoid false positives
_MAX_NGRAM_WORDS = 5
_MAX_SKILL_SUGGESTIONS = 60


class UnsupportedCVFormatError(Exception):
    """Raised when the uploaded file type is not supported."""


class CVTooLargeError(Exception):
    """Raised when the uploaded file exceeds MAX_CV_BYTES."""


class CVTextExtractionError(Exception):
    """Raised when no readable text could be extracted from the file."""


_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
# French / international phone numbers: +33, 0X, with spaces/dots/dashes.
_PHONE_RE = re.compile(r"(?:(?:\+|00)\d{1,3}[\s.\-]?)?(?:\(?\d{1,4}\)?[\s.\-]?){2,5}\d{2,4}")
_LINKEDIN_RE = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%\-]+/?")


def extract_text(filename: str, data: bytes) -> str:
    """Extract raw text from a CV file. Dispatches on extension."""
    if len(data) > MAX_CV_BYTES:
        raise CVTooLargeError(f"file exceeds {MAX_CV_BYTES} bytes")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        text = _extract_pdf(data)
    elif ext == "docx":
        text = _extract_docx(data)
    elif ext in ("txt", "text"):
        text = data.decode("utf-8", errors="replace")
    else:
        raise UnsupportedCVFormatError("Format non supporté. Utilisez un fichier PDF, DOCX ou TXT.")

    if not text or not text.strip():
        raise CVTextExtractionError("Aucun texte exploitable n'a pu être extrait du fichier.")
    return text


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _extract_docx(data: bytes) -> str:
    from docx import Document

    document = Document(io.BytesIO(data))
    parts = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


class CVContact(TypedDict):
    email: str | None
    phone: str | None
    linkedin_url: str | None


class CVParseData(CVContact):
    skills: list[SkillReference]


def extract_contact(text: str) -> CVContact:
    """Pull the reliably-extractable contact fields from CV text."""
    email_match = _EMAIL_RE.search(text)
    linkedin_match = _LINKEDIN_RE.search(text)

    phone: str | None = None
    for candidate in _PHONE_RE.findall(text):
        digits = re.sub(r"\D", "", candidate)
        if 8 <= len(digits) <= 15:
            phone = candidate.strip()
            break

    linkedin_url: str | None = None
    if linkedin_match:
        linkedin_url = linkedin_match.group(0)
        if not linkedin_url.startswith("http"):
            linkedin_url = f"https://{linkedin_url}"

    return CVContact(
        email=email_match.group(0) if email_match else None,
        phone=phone,
        linkedin_url=linkedin_url,
    )


def _normalise(value: str) -> str:
    """Lowercase, strip accents, and reduce to space-separated word tokens.

    Punctuation is turned into spaces (applied identically to catalogue phrases
    and CV text) so ``Python,`` matches ``python`` and ``ASP.NET`` matches the
    two tokens ``asp net``.
    """
    nfkd = unicodedata.normalize("NFKD", value.lower())
    no_accents = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", no_accents).strip()


def _ngrams(tokens: list[str], max_words: int) -> set[str]:
    grams: set[str] = set()
    n = len(tokens)
    for size in range(1, max_words + 1):
        for i in range(n - size + 1):
            grams.add(" ".join(tokens[i : i + size]))
    return grams


async def match_skills(text: str, db: AsyncSession) -> list[SkillReference]:
    """Match CV text against ESCO/global skill references by name & alias.

    Uses an n-gram lookup of the CV text against a normalised phrase index, so
    the cost is roughly linear in the CV length rather than in the catalogue
    size.
    """
    result = await db.execute(
        select(SkillReference).where(SkillReference.creator_candidate_id.is_(None))
    )
    refs = list(result.scalars().all())

    # Build a phrase -> ref index from each ref's name + aliases.
    index: dict[str, SkillReference] = {}
    for ref in refs:
        phrases = [ref.name, *ref.aliases]
        for phrase in phrases:
            norm = _normalise(phrase)
            if len(norm) >= _MIN_SKILL_LEN and norm not in index:
                index[norm] = ref

    norm_text = _normalise(text)
    tokens = norm_text.split(" ")
    candidates = _ngrams(tokens, _MAX_NGRAM_WORDS)

    matched: dict[str, SkillReference] = {}
    for gram in candidates:
        hit = index.get(gram)
        if hit is not None:
            matched[str(hit.id)] = hit

    # Prefer longer (more specific) skill names first, then alphabetical.
    ordered = sorted(matched.values(), key=lambda r: (-len(r.name), r.name.lower()))
    return ordered[:_MAX_SKILL_SUGGESTIONS]


async def parse_cv(filename: str, data: bytes, db: AsyncSession) -> CVParseData:
    """Full pipeline: extract text, contact fields, and matched skills."""
    text = extract_text(filename, data)
    contact = extract_contact(text)
    skills = await match_skills(text, db)
    return CVParseData(
        email=contact["email"],
        phone=contact["phone"],
        linkedin_url=contact["linkedin_url"],
        skills=skills,
    )
