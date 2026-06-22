"""Unit tests for the régime B linker — pure logic, no DB."""

from uuid import uuid4

from models.skill import SkillKind
from services.cv.skill_matching import SkillEntry
from services.skill_usage_linker import (
    LINKER_CONFIDENCE,
    ProposedSkillUsage,
    propose_skill_usages,
)


def _index(**by_norm: SkillEntry) -> dict[str, SkillEntry]:
    return dict(by_norm)


def test_proposes_usage_for_skill_mentioned_in_text():
    python_id = uuid4()
    index = _index(python=SkillEntry(id=python_id, name="Python", kind=SkillKind.technical))

    proposals = propose_skill_usages("Developpement Python sur le projet embarque", index)

    assert [p.skill_ref_id for p in proposals] == [python_id]
    assert proposals[0].confidence == LINKER_CONFIDENCE
    assert isinstance(proposals[0], ProposedSkillUsage)


def test_excludes_skills_already_used_on_experience():
    python_id = uuid4()
    java_id = uuid4()
    index = _index(
        python=SkillEntry(id=python_id, name="Python", kind=SkillKind.technical),
        java=SkillEntry(id=java_id, name="Java", kind=SkillKind.technical),
    )

    proposals = propose_skill_usages(
        "Projet en Python et Java", index, existing_skill_ref_ids=[python_id]
    )

    assert [p.skill_ref_id for p in proposals] == [java_id]


def test_no_proposal_when_text_mentions_no_known_skill():
    index = _index(python=SkillEntry(id=uuid4(), name="Python", kind=SkillKind.technical))

    assert propose_skill_usages("Gestion de projet et communication d'equipe", index) == []
