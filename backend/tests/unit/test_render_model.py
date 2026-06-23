# backend/tests/unit/test_render_model.py
"""Invariants of the DossierRenderModel seam (#63).

#1 — no template reads CandidateProfile: the engine builds its context from the
    typed model, never from the profile ORM.
#2 — render only via the render model: build_context is a pure function whose
    sole input is a DossierRenderModel.
"""

import inspect
from types import SimpleNamespace

from services.documents.builtin_template_service import _mock_render_inputs
from services.documents.docx_engine import (
    build_context,
    build_render_model,
)
from services.documents.render_model import (
    AnonymizationPolicy,
    AssetsBlock,
    DossierRenderModel,
    HeaderBlock,
)


def _empty_header() -> HeaderBlock:
    return HeaderBlock(**{f.name: "" for f in HeaderBlock.__dataclass_fields__.values()})


def test_invariant_1_engine_never_reads_candidate_profile() -> None:
    """build_context's body must not touch a profile object at all."""
    source = inspect.getsource(build_context)
    assert "profile" not in source
    assert "CandidateProfile" not in source


def test_invariant_2_build_context_consumes_only_the_render_model() -> None:
    sig = inspect.signature(build_context)
    params = list(sig.parameters.values())
    assert len(params) == 1
    assert params[0].name == "model"
    assert params[0].annotation == "DossierRenderModel"


def test_context_is_derivable_from_model_without_any_orm() -> None:
    """A hand-built model (no ORM, no profile) renders to a full context."""
    model = DossierRenderModel(
        header=_empty_header(),
        anonymization=AnonymizationPolicy(),
        experience_blocks=(),
        skills=(),
        education_blocks=(),
        language_blocks=(),
        assets=AssetsBlock(),
    )
    context = build_context(model)
    assert context["first_name"] == ""
    assert context["experiences"] == []
    assert "skill_groups" in context
    assert "skills_technical" in context


def test_build_render_model_applies_anonymization_to_header() -> None:
    profile, experiences, skills, education, certifications, languages = _mock_render_inputs()
    model = build_render_model(
        profile,
        experiences,
        skills,
        education,
        certifications,
        languages,
        share_contact=False,
        share_finances=False,
    )
    assert model.anonymization.share_contact is False
    assert model.header.phone == ""
    assert model.header.email_contact == ""
    assert model.header.linkedin_url == ""
    assert model.header.daily_rate == ""
    assert model.header.annual_salary == ""


def test_build_render_model_anonymizes_identity_to_initials() -> None:
    profile, experiences, skills, education, certifications, languages = _mock_render_inputs()
    model = build_render_model(
        profile,
        experiences,
        skills,
        education,
        certifications,
        languages,
        identity_anonymized=True,
    )
    # "Joris Martin" -> initiales, et on retire ce qui trahit directement l'identité.
    assert model.header.first_name == "J."
    assert model.header.last_name == "M."
    assert model.header.email_contact == ""
    assert model.header.linkedin_url == ""
    assert model.anonymization.anonymize_identity is True


def test_build_context_masks_client_names() -> None:
    profile, experiences, skills, education, certifications, languages = _mock_render_inputs()
    model = build_render_model(
        profile,
        experiences,
        skills,
        education,
        certifications,
        languages,
        mask_client_names=True,
    )
    context = build_context(model)
    assert {exp["client_name"] for exp in context["experiences"]} == {"Client confidentiel"}
    assert all("FlowUp" not in item["ref"] for item in context["featured_achievements"])


def test_temporal_precision_year_collapses_experience_dates() -> None:
    profile, experiences, skills, education, certifications, languages = _mock_render_inputs()
    model = build_render_model(
        profile,
        experiences,
        skills,
        education,
        certifications,
        languages,
        temporal_precision="year",
    )
    context = build_context(model)
    # Nova Consulting : 03/2020 - 12/2022 -> rabote au millésime.
    nova = next(exp for exp in context["experiences"] if exp["role"] == "Data Engineer")
    assert nova["start_date"] == "2020"
    assert nova["end_date"] == "2022"


def test_competency_and_sector_blocks_partition_skills_in_order() -> None:
    tech = SimpleNamespace(skill_ref=SimpleNamespace(kind="technical"), featured=False)
    sect = SimpleNamespace(skill_ref=SimpleNamespace(kind="sectoral"), featured=False)
    model = DossierRenderModel(
        header=_empty_header(),
        anonymization=AnonymizationPolicy(),
        experience_blocks=(),
        skills=(tech, sect),
        education_blocks=(),
        language_blocks=(),
        assets=AssetsBlock(),
    )
    assert model.competency_blocks == (tech,)
    assert model.sector_blocks == (sect,)
    # The canonical ordered list keeps both, so legacy context keys stay identical.
    assert model.skills == (tech, sect)
