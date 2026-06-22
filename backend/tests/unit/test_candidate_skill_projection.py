"""Unit tests for the CandidateSkill status rollup — pure logic, no DB."""

from datetime import date
from uuid import UUID, uuid4

from models.skill import ReviewStatus, SkillKind, SkillStatus
from services.references.candidate_skill_projection import (
    DeclaredSkill,
    ProofRecord,
    ProofSignal,
    assemble_projections,
    rollup_status,
)


def _sig(review_status: ReviewStatus, validated: bool = False) -> ProofSignal:
    return ProofSignal(review_status=review_status, validated=validated)


def test_accepted_proof_is_evidenced():
    status = rollup_status([_sig(ReviewStatus.accepted)], declared=False)
    assert status is SkillStatus.evidenced


def test_accepted_and_validated_proof_is_validated():
    status = rollup_status([_sig(ReviewStatus.accepted, validated=True)], declared=False)
    assert status is SkillStatus.validated


def test_only_pending_proof_is_inferred():
    status = rollup_status([_sig(ReviewStatus.pending)], declared=True)
    assert status is SkillStatus.inferred


def test_declared_without_proof_is_declared_only():
    status = rollup_status([], declared=True)
    assert status is SkillStatus.declared_only


def test_rejected_proof_with_declaration_is_declared_only():
    status = rollup_status([_sig(ReviewStatus.rejected)], declared=True)
    assert status is SkillStatus.declared_only


def test_evidenced_outranks_pending_in_same_skill():
    status = rollup_status(
        [_sig(ReviewStatus.pending), _sig(ReviewStatus.accepted)], declared=False
    )
    assert status is SkillStatus.evidenced


def _declared(sid: UUID, name: str = "Python", highlighted: bool = False) -> DeclaredSkill:
    return DeclaredSkill(
        skill_ref_id=sid,
        skill_name=name,
        skill_kind=SkillKind.technical,
        is_profile_highlighted=highlighted,
    )


def _proof(
    sid: UUID,
    name: str = "Python",
    review_status: ReviewStatus = ReviewStatus.accepted,
    validated: bool = False,
) -> ProofRecord:
    return ProofRecord(
        skill_ref_id=sid,
        skill_name=name,
        skill_kind=SkillKind.technical,
        review_status=review_status,
        validated=validated,
        start=date(2022, 1, 1),
        end=date(2023, 1, 1),
    )


def test_declared_without_proof_projects_declared_only():
    sid = uuid4()
    (proj,) = assemble_projections([_declared(sid)], [])
    assert proj.status is SkillStatus.declared_only
    assert proj.evidence_count == 0
    assert proj.first_used is None


def test_proof_only_skill_is_included_and_evidenced():
    sid = uuid4()
    (proj,) = assemble_projections([], [_proof(sid)])
    assert proj.status is SkillStatus.evidenced
    assert proj.evidence_count == 1
    assert proj.first_used == date(2022, 1, 1)
    assert proj.last_used == date(2023, 1, 1)
    assert proj.is_profile_highlighted is False


def test_declared_metadata_kept_and_proofs_drive_status():
    sid = uuid4()
    (proj,) = assemble_projections(
        [_declared(sid, highlighted=True)], [_proof(sid, validated=True)]
    )
    assert proj.is_profile_highlighted is True
    assert proj.status is SkillStatus.validated
    assert proj.evidence_count == 1
