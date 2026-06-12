import uuid
from datetime import UTC, datetime, timedelta

from models.generated_document import GeneratedDocument
from models.invitation import AccessGrant, AccessGrantStatus, Invitation, InvitationStatus
from models.recruiter import Organization
from services.candidate_service import assemble_timeline


def _org(name: str = "Acme") -> Organization:
    org = Organization(name=name, slug=name.lower(), join_code=uuid.uuid4().hex[:8])
    org.id = uuid.uuid4()
    return org


def _invitation(
    org: Organization,
    status: InvitationStatus = InvitationStatus.PENDING,
    at: datetime | None = None,
) -> Invitation:
    inv = Invitation(
        recruiter_id=uuid.uuid4(),
        organization_id=org.id,
        candidate_email="c@test.com",
        token=uuid.uuid4().hex,
        status=status,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    inv.created_at = at or datetime.now(UTC)
    return inv


def _grant(
    org: Organization,
    status: AccessGrantStatus = AccessGrantStatus.ACTIVE,
    granted_at: datetime | None = None,
    revoked_at: datetime | None = None,
) -> AccessGrant:
    grant = AccessGrant(
        candidate_id=uuid.uuid4(),
        organization_id=org.id,
        status=status,
        granted_at=granted_at or datetime.now(UTC),
    )
    grant.id = uuid.uuid4()
    grant.revoked_at = revoked_at
    return grant


def test_pending_invitation_yields_invited_card() -> None:
    org = _org()
    cards = assemble_timeline([(_invitation(org), org)], [], [])
    assert len(cards) == 1
    assert cards[0].current_status == "invited"
    assert [e.type for e in cards[0].events] == ["invitation_sent"]


def test_rejected_invitation_without_grant_is_expired_status() -> None:
    org = _org()
    cards = assemble_timeline([(_invitation(org, InvitationStatus.REJECTED), org)], [], [])
    assert cards[0].current_status == "expired"


def test_active_grant_wins_over_revoked() -> None:
    org = _org()
    now = datetime.now(UTC)
    revoked = _grant(
        org,
        AccessGrantStatus.REVOKED,
        granted_at=now - timedelta(days=2),
        revoked_at=now - timedelta(days=1),
    )
    active = _grant(org, AccessGrantStatus.ACTIVE, granted_at=now)
    cards = assemble_timeline([], [(revoked, org), (active, org)], [])
    assert cards[0].current_status == "active"
    types = [e.type for e in cards[0].events]
    assert types.count("access_granted") == 2
    assert "access_revoked" in types


def test_events_sorted_ascending_within_card() -> None:
    org = _org()
    now = datetime.now(UTC)
    inv = _invitation(org, InvitationStatus.ACCEPTED, at=now - timedelta(days=3))
    grant = _grant(org, granted_at=now - timedelta(days=2))
    cards = assemble_timeline([(inv, org)], [(grant, org)], [])
    occurred = [e.occurred_at for e in cards[0].events]
    assert occurred == sorted(occurred)


def test_cards_sorted_by_latest_event_desc() -> None:
    org_a, org_b = _org("Ancienne"), _org("Recente")
    now = datetime.now(UTC)
    cards = assemble_timeline(
        [
            (_invitation(org_a, at=now - timedelta(days=3)), org_a),
            (_invitation(org_b, at=now), org_b),
        ],
        [],
        [],
    )
    assert [c.organization_name for c in cards] == ["Recente", "Ancienne"]


def test_document_event_carries_metadata() -> None:
    org = _org()
    grant = _grant(org)
    doc = GeneratedDocument(
        access_grant_id=grant.id,
        file_path="x",
        file_format="pdf",
        template_name="Synthèse",
    )
    doc.generated_at = datetime.now(UTC)
    cards = assemble_timeline([], [(grant, org)], [(doc, None, None)])
    doc_events = [e for e in cards[0].events if e.type == "document_generated"]
    assert len(doc_events) == 1
    assert doc_events[0].metadata.file_format == "pdf"
    assert doc_events[0].metadata.template_name == "Synthèse"
