#!/usr/bin/env python
"""Seed a demonstration organization with example candidates and alpha codes.

Usage:
    uv run python scripts/seed_demo_org.py
    uv run python scripts/seed_demo_org.py --codes 10

Idempotent: re-running will not duplicate the organization, the demo candidate
users, their profiles, experiences, skills or the demo opportunity (all looked
up by name/email before creating). Alpha codes ARE additive — each run prints a
fresh batch of codes linked to the demo org.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import sys
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.config import get_settings  # noqa: E402
from core.security import hash_password  # noqa: E402
from models.candidate_profile import (  # noqa: E402
    AvailabilityStatus,
    CandidateProfile,
    ContractType,
    Experience,
    WorkMode,
)
from models.invitation import AccessGrant, AccessGrantStatus  # noqa: E402
from models.opportunity import Opportunity, ShortlistEntry  # noqa: E402
from models.recruiter import Organization  # noqa: E402
from models.skill import Achievement, CandidateSkill, SkillReference  # noqa: E402
from models.user import CURRENT_CONSENT_VERSION, User, UserRole  # noqa: E402
from schemas.opportunity import OpportunityCreate  # noqa: E402
from services.auth.alpha_service import create_alpha_codes  # noqa: E402
from services.opportunity_service import create_opportunity  # noqa: E402
from services.recruiter_service import _slugify, _unique_join_code  # noqa: E402

ORG_NAME = "ACME Corporation"


# Each demo candidate: emails on the @jorg.local domain so they're never real.
DEMO_CANDIDATES = [
    {
        "email": "marie.demo@jorg.local",
        "first_name": "Marie",
        "last_name": "Laurent (démo)",
        "title": "Développeuse Full-Stack",
        "summary": (
            "Ingénieure logiciel avec 8 ans d'expérience sur des applications web "
            "à fort trafic. Spécialisée React / Node, autonome de la conception au déploiement."
        ),
        "location": "Lyon, France",
        "skills": ["React", "TypeScript", "Node.js", "PostgreSQL"],
        "experiences": [
            {
                "client_name": "Fintech Scale-up",
                "role": "Lead Front-End",
                "start_date": date(2021, 3, 1),
                "end_date": None,
                "is_current": True,
                "description": "Pilotage technique de l'équipe front (4 personnes).",
                "achievements": [
                    {
                        "description": "Migration complète vers React 18 et Vite.",
                        "impact": "Temps de build divisé par 3.",
                        "featured": True,
                    },
                    {
                        "description": "Mise en place du design system interne.",
                        "impact": None,
                        "featured": False,
                    },
                ],
            },
            {
                "client_name": "Agence Digitale",
                "role": "Développeuse Full-Stack",
                "start_date": date(2018, 1, 1),
                "end_date": date(2021, 2, 28),
                "is_current": False,
                "description": "Développement de sites e-commerce sur mesure.",
                "achievements": [
                    {
                        "description": "Livraison de 12 projets clients en 3 ans.",
                        "impact": "Taux de satisfaction client de 95%.",
                        "featured": False,
                    },
                ],
            },
        ],
    },
    {
        "email": "karim.demo@jorg.local",
        "first_name": "Karim",
        "last_name": "Benali (démo)",
        "title": "Ingénieur DevOps",
        "summary": (
            "Expert infrastructure cloud et CI/CD. 10 ans d'expérience, passionné "
            "par l'automatisation et l'observabilité."
        ),
        "location": "Paris, France",
        "skills": ["Docker", "Kubernetes", "Python", "AWS"],
        "experiences": [
            {
                "client_name": "Plateforme SaaS B2B",
                "role": "Senior DevOps Engineer",
                "start_date": date(2020, 6, 1),
                "end_date": None,
                "is_current": True,
                "description": "Conception et exploitation de l'infra Kubernetes multi-région.",
                "achievements": [
                    {
                        "description": "Réduction des coûts cloud via l'autoscaling fin.",
                        "impact": "-35% sur la facture AWS annuelle.",
                        "featured": True,
                    },
                ],
            },
            {
                "client_name": "ESN",
                "role": "Administrateur Systèmes",
                "start_date": date(2014, 9, 1),
                "end_date": date(2020, 5, 31),
                "is_current": False,
                "description": "Gestion de parcs serveurs et premiers pipelines CI.",
                "achievements": [],
            },
        ],
    },
    {
        "email": "sophie.demo@jorg.local",
        "first_name": "Sophie",
        "last_name": "Moreau (démo)",
        "title": "Product Designer",
        "summary": (
            "Designer produit orientée recherche utilisateur et accessibilité. "
            "Habituée à travailler en duo avec les équipes techniques."
        ),
        "location": "Remote, France",
        "skills": ["Figma", "UX Research"],
        "experiences": [
            {
                "client_name": "Studio Produit",
                "role": "Product Designer",
                "start_date": date(2019, 2, 1),
                "end_date": None,
                "is_current": True,
                "description": "Design de bout en bout sur plusieurs produits SaaS.",
                "achievements": [
                    {
                        "description": "Refonte du parcours d'onboarding.",
                        "impact": "Activation +22%.",
                        "featured": True,
                    },
                    {
                        "description": "Création d'une librairie de composants accessibles.",
                        "impact": None,
                        "featured": False,
                    },
                ],
            },
        ],
    },
]

OPPORTUNITY_TITLE = "Développeur Full-Stack"
OPPORTUNITY_SKILLS = ["React", "TypeScript", "Node.js"]


async def _find_displayable_skill_refs(db: AsyncSession, names: list[str]) -> dict[str, UUID]:
    """Return {name: skill_ref_id} for displayable jorg refs matching the given names.

    Names with no matching displayable jorg ref are simply omitted.
    """
    if not names:
        return {}
    result = await db.execute(
        select(SkillReference.name, SkillReference.id).where(
            SkillReference.source == "jorg",
            SkillReference.is_displayable.is_(True),
            SkillReference.name.in_(names),
        )
    )
    return {name: ref_id for name, ref_id in result.all()}


async def get_or_create_org(db: AsyncSession) -> Organization:
    result = await db.execute(select(Organization).where(Organization.name == ORG_NAME))
    org = result.scalar_one_or_none()
    if org is not None:
        return org
    org = Organization(
        name=ORG_NAME,
        slug=await _unique_slug(db),
        join_code=await _unique_join_code(db),
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def _unique_slug(db: AsyncSession) -> str:
    base = _slugify(ORG_NAME) or "jorg-decouverte"
    candidate = base
    suffix = 1
    while True:
        result = await db.execute(select(Organization).where(Organization.slug == candidate))
        if result.scalar_one_or_none() is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


async def get_or_create_candidate(
    db: AsyncSession, spec: dict, skill_index: dict[str, UUID]
) -> User:
    """Create the demo candidate user + profile + experiences + skills if absent."""
    result = await db.execute(select(User).where(User.email == spec["email"]))
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    user = User(
        email=spec["email"],
        hashed_password=hash_password(secrets.token_urlsafe(24)),
        role=UserRole.CANDIDATE,
        consented_at=datetime.now(UTC),
        consent_version=CURRENT_CONSENT_VERSION,
    )
    db.add(user)
    await db.flush()

    profile = CandidateProfile(
        user_id=user.id,
        first_name=spec["first_name"],
        last_name=spec["last_name"],
        title=spec["title"],
        summary=spec["summary"],
        location=spec["location"],
        availability_status=AvailabilityStatus.AVAILABLE_NOW,
        contract_type=ContractType.BOTH,
        work_mode=WorkMode.HYBRID,
    )
    db.add(profile)
    await db.flush()

    for exp_spec in spec["experiences"]:
        exp = Experience(
            profile_id=profile.id,
            client_name=exp_spec["client_name"],
            role=exp_spec["role"],
            start_date=exp_spec["start_date"],
            end_date=exp_spec["end_date"],
            is_current=exp_spec["is_current"],
            description=exp_spec["description"],
        )
        db.add(exp)
        await db.flush()
        for order, ach in enumerate(exp_spec["achievements"]):
            db.add(
                Achievement(
                    experience_id=exp.id,
                    description=ach["description"],
                    impact=ach["impact"],
                    order=order,
                    featured=ach["featured"],
                )
            )

    for skill_name in spec["skills"]:
        ref_id = skill_index.get(skill_name)
        if ref_id is not None:
            db.add(CandidateSkill(candidate_id=profile.id, skill_ref_id=ref_id))

    await db.commit()
    await db.refresh(user)
    return user


async def ensure_active_grant(db: AsyncSession, candidate_id: UUID, organization_id: UUID) -> None:
    result = await db.execute(
        select(AccessGrant).where(
            AccessGrant.candidate_id == candidate_id,
            AccessGrant.organization_id == organization_id,
            AccessGrant.status == AccessGrantStatus.ACTIVE,
        )
    )
    if result.scalar_one_or_none() is not None:
        return
    db.add(
        AccessGrant(
            candidate_id=candidate_id,
            organization_id=organization_id,
            status=AccessGrantStatus.ACTIVE,
            granted_at=datetime.now(UTC),
        )
    )
    await db.commit()


async def ensure_opportunity(
    db: AsyncSession,
    organization_id: UUID,
    created_by: UUID,
    skill_index: dict[str, UUID],
) -> UUID:
    result = await db.execute(
        select(Opportunity).where(
            Opportunity.organization_id == organization_id,
            Opportunity.title == OPPORTUNITY_TITLE,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        return existing.id
    skill_ref_ids = [skill_index[name] for name in OPPORTUNITY_SKILLS if name in skill_index]
    created = await create_opportunity(
        db,
        organization_id=organization_id,
        created_by=created_by,
        data=OpportunityCreate(
            title=OPPORTUNITY_TITLE,
            description="Mission de développement full-stack pour une équipe produit.",
            skill_ref_ids=skill_ref_ids,
        ),
    )
    return created.id


async def ensure_shortlisted(db: AsyncSession, opportunity_id: UUID, candidate_id: UUID) -> None:
    result = await db.execute(
        select(ShortlistEntry).where(
            ShortlistEntry.opportunity_id == opportunity_id,
            ShortlistEntry.candidate_id == candidate_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        return
    db.add(ShortlistEntry(opportunity_id=opportunity_id, candidate_id=candidate_id))
    await db.commit()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Jorg demonstration organization.")
    parser.add_argument("--codes", type=int, default=5, help="Number of alpha codes to generate.")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL") or get_settings().database_url
    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with session_factory() as db:
        org = await get_or_create_org(db)
        org_id = org.id
        print(f"Organization: {org.name} (id={org_id})")

        all_skill_names = sorted(
            {name for spec in DEMO_CANDIDATES for name in spec["skills"]} | set(OPPORTUNITY_SKILLS)
        )
        skill_index = await _find_displayable_skill_refs(db, all_skill_names)
        missing = [n for n in all_skill_names if n not in skill_index]
        if missing:
            print(
                f"Note: {len(missing)} skill name(s) not found as displayable jorg refs, "
                f"skipped: {', '.join(missing)}"
            )

        candidate_ids: list[UUID] = []
        for spec in DEMO_CANDIDATES:
            user = await get_or_create_candidate(db, spec, skill_index)
            await ensure_active_grant(db, user.id, org_id)
            candidate_ids.append(user.id)
            print(f"  candidate: {spec['email']} (id={user.id}) — active grant ensured")

        # The opportunity needs a creator; reuse the first demo candidate's user id
        # purely as the created_by value (no recruiter exists yet in the demo org).
        assert candidate_ids
        opportunity_id = await ensure_opportunity(db, org_id, candidate_ids[0], skill_index)
        print(f"  opportunity: {OPPORTUNITY_TITLE} ensured")

        # Shortlist every demo candidate so the opportunity shows a populated
        # shortlist with compatibility scores.
        for candidate_id in candidate_ids:
            await ensure_shortlisted(db, opportunity_id, candidate_id)
        print(f"  shortlist: {len(candidate_ids)} candidate(s) ensured")

        codes = await create_alpha_codes(db, args.codes, organization_id=org_id)
        print(f"\nGenerated {len(codes)} alpha invite code(s) linked to the demo org:")
        for code in codes:
            print(f"  {code}")
        print(
            "\nNote: alpha codes are additive — re-running this script prints a fresh batch "
            "but does NOT duplicate the org or demo candidates."
        )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
