# backend/api/routes/skills.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.deps import CandidateProfile_dep, get_db
from models.candidate_profile import Experience
from models.skill import (
    Achievement as AchievementModel,
)
from models.skill import (
    AchievementSkillTag as AchievementSkillTagModel,
)
from models.skill import (
    CandidateSkill,
    ExperienceSkillUsage,
    SkillKind,
    SkillReference,
)
from schemas.skill import (
    AchievementCreate,
    AchievementRead,
    AchievementSkillTagCreate,
    AchievementSkillTagRead,
    AchievementUpdate,
    CandidateSkillCreate,
    CandidateSkillRead,
    CandidateSkillUpdate,
    ExperienceSkillUsageCreate,
    ExperienceSkillUsageRead,
    SkillMetricsRead,
    SkillReferenceCreate,
    SkillReferenceRead,
)
from services import skill_metrics_service, skill_reference_service

router = APIRouter(tags=["skills"])

DB = Annotated[AsyncSession, Depends(get_db)]


# ---- SkillReference ----------------------------------------------------------


@router.get("/skill-references", response_model=list[SkillReferenceRead])
async def search_skill_references(
    q: str,
    db: DB,
    profile: CandidateProfile_dep,
    kind: SkillKind | None = None,
    limit: int = 20,
) -> list[SkillReference]:
    return await skill_reference_service.search(
        q, kind=kind, limit=limit, candidate_id=profile.id, db=db
    )


@router.post("/skill-references", response_model=SkillReferenceRead)
async def create_or_get_skill_reference(
    data: SkillReferenceCreate,
    db: DB,
    profile: CandidateProfile_dep,
    response: Response,
) -> SkillReference:
    try:
        ref, was_created = await skill_reference_service.get_or_create_by_name(
            data.name, data.kind, creator_candidate_id=profile.id, db=db
        )
    except IntegrityError:
        await db.rollback()
        slug = skill_reference_service.slugify(data.name)
        result = await db.execute(
            select(SkillReference).where(
                SkillReference.slug == slug,
                SkillReference.creator_candidate_id.is_(None),
            )
        )
        recovered: SkillReference | None = result.scalar_one_or_none()
        if recovered is None:
            result = await db.execute(
                select(SkillReference).where(
                    SkillReference.slug == slug,
                    SkillReference.creator_candidate_id == profile.id,
                )
            )
            recovered = result.scalar_one_or_none()
        if recovered is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create or retrieve skill reference",
            ) from None
        response.status_code = status.HTTP_200_OK
        return recovered
    response.status_code = status.HTTP_201_CREATED if was_created else status.HTTP_200_OK
    return ref


# ---- CandidateSkill ----------------------------------------------------------


@router.get("/candidates/me/skills", response_model=list[CandidateSkillRead])
async def list_my_skills(profile: CandidateProfile_dep, db: DB) -> list[CandidateSkill]:
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.candidate_id == profile.id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    return list(result.scalars().all())


@router.post(
    "/candidates/me/skills",
    response_model=CandidateSkillRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_my_skill(
    data: CandidateSkillCreate,
    profile: CandidateProfile_dep,
    db: DB,
) -> CandidateSkill:
    skill = CandidateSkill(
        candidate_id=profile.id,
        skill_ref_id=data.skill_ref_id,
        self_assessed_level=data.self_assessed_level,
        featured=data.featured,
        notes=data.notes,
    )
    try:
        db.add(skill)
        await db.commit()
        await db.refresh(skill)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Skill already added to profile",
        ) from None
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.id == skill.id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    return result.scalar_one()


@router.put("/candidates/me/skills/{skill_id}", response_model=CandidateSkillRead)
async def update_my_skill(
    skill_id: UUID,
    data: CandidateSkillUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> CandidateSkill:
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.id == skill_id, CandidateSkill.candidate_id == profile.id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")

    update_data = data.model_dump(exclude_unset=True)
    kind = update_data.pop("kind", None)

    if kind is not None:
        if not skill.skill_ref.is_custom:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change kind of an ESCO skill",
            )
        skill.skill_ref.kind = kind

    for field, value in update_data.items():
        setattr(skill, field, value)

    await db.commit()
    result = await db.execute(
        select(CandidateSkill)
        .where(CandidateSkill.id == skill_id)
        .options(selectinload(CandidateSkill.skill_ref))
    )
    return result.scalar_one()


@router.delete("/candidates/me/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_skill(skill_id: UUID, profile: CandidateProfile_dep, db: DB) -> None:
    result = await db.execute(
        select(CandidateSkill).where(
            CandidateSkill.id == skill_id, CandidateSkill.candidate_id == profile.id
        )
    )
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill not found")
    await db.delete(skill)
    await db.commit()


# ---- ExperienceSkillUsage ----------------------------------------------------


async def _get_experience_or_404(exp_id: UUID, profile_id: UUID, db: AsyncSession) -> Experience:
    result = await db.execute(
        select(Experience).where(Experience.id == exp_id, Experience.profile_id == profile_id)
    )
    exp = result.scalar_one_or_none()
    if exp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="experience not found")
    return exp


@router.post(
    "/candidates/me/experiences/{exp_id}/skill-usages",
    response_model=ExperienceSkillUsageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_skill_usage(
    exp_id: UUID,
    data: ExperienceSkillUsageCreate,
    profile: CandidateProfile_dep,
    db: DB,
) -> ExperienceSkillUsage:
    await _get_experience_or_404(exp_id, profile.id, db)
    usage = ExperienceSkillUsage(
        experience_id=exp_id,
        skill_ref_id=data.skill_ref_id,
        usage_role=data.usage_role,
        intensity=data.intensity,
    )
    try:
        db.add(usage)
        await db.commit()
        await db.refresh(usage)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Skill usage already exists for this experience",
        ) from None
    result = await db.execute(
        select(ExperienceSkillUsage)
        .where(ExperienceSkillUsage.id == usage.id)
        .options(selectinload(ExperienceSkillUsage.skill_ref))
    )
    return result.scalar_one()


@router.delete(
    "/candidates/me/experiences/{exp_id}/skill-usages/{usage_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_skill_usage(
    exp_id: UUID, usage_id: UUID, profile: CandidateProfile_dep, db: DB
) -> None:
    await _get_experience_or_404(exp_id, profile.id, db)
    result = await db.execute(
        select(ExperienceSkillUsage).where(
            ExperienceSkillUsage.id == usage_id,
            ExperienceSkillUsage.experience_id == exp_id,
        )
    )
    usage = result.scalar_one_or_none()
    if usage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="usage not found")
    await db.delete(usage)
    await db.commit()


# ---- Metrics -----------------------------------------------------------------


@router.get("/candidates/me/skill-metrics", response_model=list[SkillMetricsRead])
async def get_my_skill_metrics(profile: CandidateProfile_dep, db: DB) -> list[SkillMetricsRead]:
    return await skill_metrics_service.compute_skill_metrics(profile.id, db)


# ---- Achievements ------------------------------------------------------------


@router.post(
    "/candidates/me/experiences/{exp_id}/achievements",
    response_model=AchievementRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_achievement(
    exp_id: UUID, data: AchievementCreate, profile: CandidateProfile_dep, db: DB
) -> AchievementModel:
    await _get_experience_or_404(exp_id, profile.id, db)
    achievement = AchievementModel(
        experience_id=exp_id,
        description=data.description,
        impact=data.impact,
        order=data.order,
    )
    db.add(achievement)
    await db.commit()
    result = await db.execute(
        select(AchievementModel)
        .where(AchievementModel.id == achievement.id)
        .options(
            selectinload(AchievementModel.skill_tags).selectinload(
                AchievementSkillTagModel.skill_ref
            )
        )
    )
    return result.scalar_one()


@router.get(
    "/candidates/me/experiences/{exp_id}/achievements",
    response_model=list[AchievementRead],
)
async def list_achievements(
    exp_id: UUID, profile: CandidateProfile_dep, db: DB
) -> list[AchievementModel]:
    await _get_experience_or_404(exp_id, profile.id, db)
    result = await db.execute(
        select(AchievementModel)
        .where(AchievementModel.experience_id == exp_id)
        .order_by(AchievementModel.order)
        .options(
            selectinload(AchievementModel.skill_tags).selectinload(
                AchievementSkillTagModel.skill_ref
            )
        )
    )
    return list(result.scalars().all())


@router.put(
    "/candidates/me/experiences/{exp_id}/achievements/{achievement_id}",
    response_model=AchievementRead,
)
async def update_achievement(
    exp_id: UUID,
    achievement_id: UUID,
    data: AchievementUpdate,
    profile: CandidateProfile_dep,
    db: DB,
) -> AchievementModel:
    await _get_experience_or_404(exp_id, profile.id, db)
    result = await db.execute(
        select(AchievementModel).where(
            AchievementModel.id == achievement_id,
            AchievementModel.experience_id == exp_id,
        )
    )
    achievement = result.scalar_one_or_none()
    if achievement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="achievement not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(achievement, field, value)
    await db.commit()
    result = await db.execute(
        select(AchievementModel)
        .where(AchievementModel.id == achievement_id)
        .options(
            selectinload(AchievementModel.skill_tags).selectinload(
                AchievementSkillTagModel.skill_ref
            )
        )
    )
    return result.scalar_one()


@router.delete(
    "/candidates/me/experiences/{exp_id}/achievements/{achievement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_achievement(
    exp_id: UUID, achievement_id: UUID, profile: CandidateProfile_dep, db: DB
) -> None:
    await _get_experience_or_404(exp_id, profile.id, db)
    result = await db.execute(
        select(AchievementModel).where(
            AchievementModel.id == achievement_id,
            AchievementModel.experience_id == exp_id,
        )
    )
    achievement = result.scalar_one_or_none()
    if achievement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="achievement not found")
    await db.delete(achievement)
    await db.commit()


# ---- AchievementSkillTag -----------------------------------------------------


@router.post(
    "/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags",
    response_model=AchievementSkillTagRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_skill_tag(
    exp_id: UUID,
    ach_id: UUID,
    data: AchievementSkillTagCreate,
    profile: CandidateProfile_dep,
    db: DB,
) -> AchievementSkillTagModel:
    await _get_experience_or_404(exp_id, profile.id, db)
    # Verify achievement belongs to this experience
    ach_result = await db.execute(
        select(AchievementModel).where(
            AchievementModel.id == ach_id,
            AchievementModel.experience_id == exp_id,
        )
    )
    if ach_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="achievement not found")
    # Verify skill is in the experience bouquet
    usage_result = await db.execute(
        select(ExperienceSkillUsage).where(
            ExperienceSkillUsage.experience_id == exp_id,
            ExperienceSkillUsage.skill_ref_id == data.skill_ref_id,
        )
    )
    if usage_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="skill_ref_id is not in this experience's skill bouquet",
        )
    tag = AchievementSkillTagModel(
        achievement_id=ach_id,
        skill_ref_id=data.skill_ref_id,
    )
    try:
        db.add(tag)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="skill already tagged on this achievement",
        ) from None
    result = await db.execute(
        select(AchievementSkillTagModel)
        .where(
            AchievementSkillTagModel.achievement_id == ach_id,
            AchievementSkillTagModel.skill_ref_id == data.skill_ref_id,
        )
        .options(selectinload(AchievementSkillTagModel.skill_ref))
    )
    return result.scalar_one()


@router.delete(
    "/candidates/me/experiences/{exp_id}/achievements/{ach_id}/skill-tags/{skill_ref_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_skill_tag(
    exp_id: UUID,
    ach_id: UUID,
    skill_ref_id: UUID,
    profile: CandidateProfile_dep,
    db: DB,
) -> None:
    await _get_experience_or_404(exp_id, profile.id, db)
    result = await db.execute(
        select(AchievementSkillTagModel).where(
            AchievementSkillTagModel.achievement_id == ach_id,
            AchievementSkillTagModel.skill_ref_id == skill_ref_id,
        )
    )
    tag = result.scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="skill tag not found")
    await db.delete(tag)
    await db.commit()
