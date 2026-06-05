from uuid import uuid4

from models.invitation import AccessGrant, AccessGrantStatus
from models.recruiter import RecruiterProfile
from services import access_policy


def test_is_member_true_when_org_matches():
    org_id = uuid4()
    profile = RecruiterProfile(user_id=uuid4(), organization_id=org_id)
    assert access_policy.is_member(profile, org_id) is True


def test_is_member_false_when_org_differs():
    profile = RecruiterProfile(user_id=uuid4(), organization_id=uuid4())
    assert access_policy.is_member(profile, uuid4()) is False


def test_active_grant_clause_is_a_boolean_expression():
    clause = access_policy.active_grant_clause()
    # Compiles to "status = :param" against the AccessGrant table
    compiled = str(clause)
    assert "status" in compiled
    # The clause must compare the status column against ACTIVE specifically.
    assert clause.left.compare(AccessGrant.status.expression)
    assert clause.right.value == AccessGrantStatus.ACTIVE
