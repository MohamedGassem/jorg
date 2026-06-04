from uuid import uuid4

from models.invitation import AccessGrant, AccessGrantStatus
from services import access_policy


def test_is_member_true_when_org_matches():
    class P:
        organization_id = uuid4()

    p = P()
    assert access_policy.is_member(p, p.organization_id) is True


def test_is_member_false_when_org_differs():
    class P:
        organization_id = uuid4()

    assert access_policy.is_member(P(), uuid4()) is False


def test_active_grant_clause_is_a_boolean_expression():
    clause = access_policy.active_grant_clause()
    # Compiles to "status = :param" against the AccessGrant table
    compiled = str(clause)
    assert "status" in compiled
    # The clause must compare the status column against ACTIVE specifically.
    assert clause.left.compare(AccessGrant.status.expression)
    assert clause.right.value == AccessGrantStatus.ACTIVE
