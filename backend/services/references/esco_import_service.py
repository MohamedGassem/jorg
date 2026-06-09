# backend/services/esco_import_service.py
"""Import the full ESCO skills taxonomy into the ``skill_references`` table.

ESCO publishes one row per skill in ``skills_<lang>.csv`` with columns:
``conceptUri``, ``skillType`` (``skill/competence`` | ``knowledge``),
``reuseLevel`` (``transversal`` | ``cross-sector`` | ``sector-specific`` |
``occupation-specific``), ``preferredLabel``, ``altLabels`` (newline
separated), ``description`` …

The pure helpers (``map_esco_kind``, ``parse_alt_labels``,
``esco_row_to_fields``) are unit-tested; ``import_esco_skills`` does the
streaming, slug-deduplicated, idempotent load.
"""

from __future__ import annotations

import csv
from collections.abc import Iterable
from pathlib import Path
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.skill import SkillKind, SkillReference
from services.references.esco_language_detection import is_esco_language_reference
from services.references.skill_reference_service import slugify

# Column widths from the SkillReference model — truncate to stay within them.
_NAME_MAX = 200
_SLUG_MAX = 200
_URI_MAX = 500
_SKILL_TYPE_MAX = 50


def map_esco_kind(skill_type: str, reuse_level: str) -> SkillKind:
    """Map ESCO skillType/reuseLevel onto our coarser SkillKind taxonomy.

    ESCO has no exact equivalent of our enum, so we use a defensible
    heuristic and keep the precise ESCO type in ``esco_skill_type``:

    - ``knowledge``            -> technical (domain/theoretical knowledge)
    - ``skill/competence`` + ``transversal`` -> soft (communication, etc.)
    - everything else          -> functional
    """
    st = (skill_type or "").strip().lower()
    rl = (reuse_level or "").strip().lower()
    if st == "knowledge":
        return SkillKind.technical
    if rl == "transversal":
        return SkillKind.soft
    return SkillKind.functional


def parse_alt_labels(raw: str) -> list[str]:
    """ESCO altLabels are newline-separated; also tolerate ``;`` and ``|``."""
    if not raw:
        return []
    parts: list[str] = []
    for chunk in raw.replace("|", "\n").replace(";", "\n").splitlines():
        label = chunk.strip()
        if label:
            parts.append(label)
    # Preserve order, drop duplicates.
    seen: set[str] = set()
    out: list[str] = []
    for p in parts:
        key = p.lower()
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


class EscoFields(TypedDict):
    name: str
    slug: str
    kind: SkillKind
    aliases: list[str]
    esco_uri: str
    esco_skill_type: str | None
    description: str | None


def esco_row_to_fields(row: dict[str, str]) -> EscoFields | None:
    """Convert one ESCO CSV row to SkillReference field values.

    Returns ``None`` when the row is unusable (no URI or no label, or a
    non-released status).
    """
    status = (row.get("status") or "").strip().lower()
    if status and status != "released":
        return None

    esco_uri = (row.get("conceptUri") or "").strip()
    name = (row.get("preferredLabel") or "").strip()
    if not esco_uri or not name:
        return None

    skill_type = (row.get("skillType") or "").strip()
    reuse_level = (row.get("reuseLevel") or "").strip()
    description = (row.get("description") or "").strip() or None
    if is_esco_language_reference(name, description, skill_type):
        return None

    return EscoFields(
        name=name[:_NAME_MAX],
        slug=slugify(name)[:_SLUG_MAX] or esco_uri[-_SLUG_MAX:],
        kind=map_esco_kind(skill_type, reuse_level),
        aliases=parse_alt_labels(row.get("altLabels") or ""),
        esco_uri=esco_uri[:_URI_MAX],
        esco_skill_type=(skill_type[:_SKILL_TYPE_MAX] or None),
        description=description,
    )


def _dedupe_slug(slug: str, uri: str, used: set[str]) -> str:
    """Ensure the slug is unique among ESCO rows (unique index requirement).

    On collision, append a short suffix derived from the ESCO URI's UUID so
    the result stays stable across re-runs.
    """
    if slug not in used:
        used.add(slug)
        return slug
    suffix = uri.rstrip("/").rsplit("/", 1)[-1][:8]
    candidate = f"{slug}-{suffix}"[:_SLUG_MAX]
    n = 1
    while candidate in used:
        candidate = f"{slug}-{suffix}-{n}"[:_SLUG_MAX]
        n += 1
    used.add(candidate)
    return candidate


class ImportStats(TypedDict):
    added: int
    skipped_existing: int
    skipped_invalid: int


def _iter_rows(csv_path: Path) -> Iterable[dict[str, str]]:
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        yield from csv.DictReader(f)


async def import_esco_skills(
    session: AsyncSession,
    csv_path: Path,
    *,
    batch_size: int = 1000,
    limit: int | None = None,
) -> ImportStats:
    """Idempotently load ESCO skills.

    Existing rows (matched by ``esco_uri``) are left untouched, so re-running
    only inserts what is missing. Slugs are deduplicated against both the DB
    and the rows seen in this run to satisfy the unique slug index.
    """
    stats: ImportStats = {"added": 0, "skipped_existing": 0, "skipped_invalid": 0}

    existing_uris = set((await session.execute(select(SkillReference.esco_uri))).scalars().all())
    existing_uris.discard(None)
    used_slugs: set[str] = set(
        (
            await session.execute(
                select(SkillReference.slug).where(SkillReference.creator_candidate_id.is_(None))
            )
        )
        .scalars()
        .all()
    )

    pending = 0
    processed = 0
    for row in _iter_rows(csv_path):
        if limit is not None and processed >= limit:
            break
        processed += 1

        fields = esco_row_to_fields(row)
        if fields is None:
            stats["skipped_invalid"] += 1
            continue
        if fields["esco_uri"] in existing_uris:
            stats["skipped_existing"] += 1
            continue

        existing_uris.add(fields["esco_uri"])
        slug = _dedupe_slug(fields["slug"], fields["esco_uri"], used_slugs)
        session.add(
            SkillReference(
                name=fields["name"],
                slug=slug,
                kind=fields["kind"],
                aliases=fields["aliases"],
                esco_uri=fields["esco_uri"],
                esco_skill_type=fields["esco_skill_type"],
                source="esco",
                description=fields["description"],
                is_custom=False,
            )
        )
        stats["added"] += 1
        pending += 1
        if pending >= batch_size:
            await session.commit()
            pending = 0

    if pending:
        await session.commit()
    return stats
