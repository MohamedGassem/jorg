# backend/services/candidate_service.py
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.exceptions import BusinessRuleError
from models.candidate_profile import (
    AvailabilityStatus as _AvailabilityStatus,
)
from models.candidate_profile import (
    CandidateProfile,
    Certification,
    Education,
    Experience,
    Language,
)
from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization, RecruiterProfile
from models.template import Template
from schemas.candidate import (
    CandidateProfileUpdate,
    InteractionEvent,
    InteractionEventMetadata,
    OrganizationInteractionCard,
)
from services.base_crud import CRUDService

# ---- Per-model CRUD instances -----------------------------------------------

experience_crud: CRUDService[Experience] = CRUDService(Experience, "profile_id")
education_crud: CRUDService[Education] = CRUDService(Education, "profile_id")
certification_crud: CRUDService[Certification] = CRUDService(Certification, "profile_id")
language_crud: CRUDService[Language] = CRUDService(Language, "profile_id")

# ---- CandidateProfile -------------------------------------------------------


async def get_or_create_profile(db: AsyncSession, user_id: UUID) -> CandidateProfile:
    result = await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = CandidateProfile(user_id=user_id)
        db.add(profile)
        await db.flush()
        await db.refresh(profile)
    return profile


async def update_profile(
    db: AsyncSession,
    profile: CandidateProfile,
    data: CandidateProfileUpdate,
) -> CandidateProfile:
    updates = data.model_dump(exclude_unset=True)
    new_status = updates.get("availability_status", profile.availability_status)
    new_date = updates.get("availability_date", profile.availability_date)
    if new_status == _AvailabilityStatus.AVAILABLE_FROM and new_date is None:
        raise BusinessRuleError(
            "availability_date is required when availability_status is 'available_from'"
        )
    for field, value in updates.items():
        setattr(profile, field, value)
    await db.flush()
    await db.refresh(profile)
    return profile


# ---- Interaction timeline ---------------------------------------------------

_INVITATION_EVENT_TYPE = {
    InvitationStatus.PENDING: "invitation_sent",
    InvitationStatus.ACCEPTED: "invitation_accepted",
    InvitationStatus.REJECTED: "invitation_rejected",
    InvitationStatus.EXPIRED: "invitation_expired",
}


def assemble_timeline(
    invitations: list[tuple[Invitation, Organization]],
    grants: list[tuple[AccessGrant, Organization]],
    documents: list[tuple[GeneratedDocument, Template | None, RecruiterProfile | None]],
) -> list[OrganizationInteractionCard]:
    """Assemblage pur du journal par organisation. Aucune I/O."""
    orgs: dict[str, dict[str, Any]] = {}

    for inv, org in invitations:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        orgs[oid]["events"].append(
            InteractionEvent(
                type=_INVITATION_EVENT_TYPE[inv.status],
                occurred_at=inv.created_at,
            )
        )

    for grant, org in grants:
        oid = str(org.id)
        if oid not in orgs:
            orgs[oid] = {"org": org, "events": [], "grants": []}
        orgs[oid]["grants"].append(grant)
        orgs[oid]["events"].append(
            InteractionEvent(type="access_granted", occurred_at=grant.granted_at)
        )
        if grant.status == AccessGrantStatus.REVOKED and grant.revoked_at:
            orgs[oid]["events"].append(
                InteractionEvent(type="access_revoked", occurred_at=grant.revoked_at)
            )

    grant_org_map = {str(grant.id): str(org.id) for grant, org in grants}
    for doc, tmpl, recruiter in documents:
        doc_oid = grant_org_map.get(str(doc.access_grant_id))
        if doc_oid and doc_oid in orgs:
            oid = doc_oid
            orgs[oid]["events"].append(
                InteractionEvent(
                    type="document_generated",
                    occurred_at=doc.generated_at,
                    metadata=InteractionEventMetadata(
                        template_name=tmpl.name if tmpl else doc.template_name,
                        file_format=doc.file_format,
                        recruiter_first_name=recruiter.first_name if recruiter else None,
                        recruiter_last_name=recruiter.last_name if recruiter else None,
                    ),
                )
            )

    result: list[OrganizationInteractionCard] = []
    for oid, data in orgs.items():
        org = data["org"]
        org_grants: list[AccessGrant] = data["grants"]
        events: list[InteractionEvent] = sorted(data["events"], key=lambda e: e.occurred_at)

        active_grant = next((g for g in org_grants if g.status == AccessGrantStatus.ACTIVE), None)
        revoked_grant = next((g for g in org_grants if g.status == AccessGrantStatus.REVOKED), None)

        if active_grant:
            status_val = "active"
        elif revoked_grant:
            status_val = "revoked"
        else:
            org_invs = [inv for inv, o in invitations if str(o.id) == oid]
            has_pending = any(i.status == InvitationStatus.PENDING for i in org_invs)
            status_val = "invited" if has_pending else "expired"

        result.append(
            OrganizationInteractionCard(
                organization_id=org.id,
                organization_name=org.name,
                logo_url=getattr(org, "logo_url", None),
                current_status=status_val,
                events=events,
            )
        )

    result.sort(
        key=lambda c: c.events[-1].occurred_at if c.events else datetime.min.replace(tzinfo=UTC),
        reverse=True,
    )
    return result


async def list_organization_interactions(
    db: AsyncSession, user_id: UUID, user_email: str
) -> list[OrganizationInteractionCard]:
    inv_result = await db.execute(
        select(Invitation, Organization)
        .join(Organization, Organization.id == Invitation.organization_id)
        .where(
            or_(
                Invitation.candidate_id == user_id,
                Invitation.candidate_email == user_email,
            )
        )
    )
    invitations = [(row.Invitation, row.Organization) for row in inv_result.all()]

    grant_result = await db.execute(
        select(AccessGrant, Organization)
        .join(Organization, Organization.id == AccessGrant.organization_id)
        .where(AccessGrant.candidate_id == user_id)
    )
    grants = [(row.AccessGrant, row.Organization) for row in grant_result.all()]

    grant_ids = [grant.id for grant, _ in grants]
    documents: list[tuple[GeneratedDocument, Template | None, RecruiterProfile | None]] = []
    if grant_ids:
        doc_result = await db.execute(
            select(GeneratedDocument, Template, RecruiterProfile)
            .outerjoin(Template, Template.id == GeneratedDocument.template_id)
            .outerjoin(
                RecruiterProfile,
                RecruiterProfile.user_id == GeneratedDocument.generated_by_user_id,
            )
            .where(GeneratedDocument.access_grant_id.in_(grant_ids))
        )
        documents = [
            (row.GeneratedDocument, row.Template, row.RecruiterProfile) for row in doc_result.all()
        ]

    return assemble_timeline(invitations, grants, documents)
