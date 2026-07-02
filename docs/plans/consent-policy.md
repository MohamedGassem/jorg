# Plan: deepen the consent envelope into one `ConsentPolicy` module

Status: ready to execute. All design decisions are locked (grilled 2026-07-02).
Execute slice by slice with TDD. This is critical business logic (the opposable
consent record, ADR-0002) — do not skip the freeze-parity test in slice 3.

## Goal

Give the consent envelope a single owner. Today the grant's consent axes and its
opposable exclusions are read and projected by hand in two places — the render
path and the snapshot freeze — which means a new rendering-relevant consent axis
must be added in three spots or the immutable legal snapshot silently
under-records an axis that actually shaped the document that went out.

After this change: one pure `ConsentPolicy` value object is the only place that
knows how a grant (or an L3a dossier) maps to consent. Both consumers read their
projection from it. Adding a consent axis is one edit.

See `CONTEXT.md` → "Consent envelope" for the term as recorded.

## Existing code (already built, do not rebuild)

- `resolve_dossier` reads five grant axes into render params and reads
  EXPERIENCE-typed exclusions via `_excluded_experience_ids`
  (`backend/services/documents/generation_service.py:137-246`).
- `snapshot_service._consent_policy` reads a superset of the grant fields plus
  all exclusions into a hand-built dict
  (`backend/services/documents/snapshot_service.py:31-59`).
- `build_render_model` consumes the five render params and builds
  `AnonymizationPolicy` (`backend/services/documents/render_model.py:62-77`,
  `docx_engine.py:454-475`). `ConsentPolicy` sits **upstream** of
  `AnonymizationPolicy` and does not replace it.
- `_excluded_experience_ids` is duplicated verbatim in `dossier_service.py:59-71`
  and `generation_service.py:137-153` (both fold into `ConsentPolicy`).

## The friction

- Two hand-maintained projections of the same grant, in two modules.
- The render projection (5 axes) is a subset of the freeze projection (5 axes +
  `reachable`, `purpose`, `retention_until`, `exclusions`). Nothing ties them.
- Real risk: add a rendering-relevant axis to `resolve_dossier` +
  `build_render_model`, forget the freeze dict → the frozen snapshot omits an
  axis that shaped the document. ADR-0002 makes the snapshot the proof of a
  legitimate send, so an under-recording freeze is a correctness bug, not a tidy.

## Locked decisions

1. **One concept, two consumers (grilled: "A").** A single `ConsentPolicy` value
   object carries every axis; each consumer reads the projection it needs. Not
   two separate types.
2. **Receives, does not load (grilled: "B2").** The builders are pure — loaded
   ORM rows in, value object out. The two call sites keep their queries and hand
   the rows over. Matches the existing pure-core pattern in `dossier_resolution`.
   The module takes no `AsyncSession`.
3. **Exclusions live inside the envelope.** `ConsentPolicy` carries the
   exclusions; `resolve_dossier`'s experience filter becomes
   `policy.excluded_experience_ids`, and the duplicated `_excluded_experience_ids`
   is deleted from both modules.
4. **The value object owns its freeze format.** `to_frozen_dict()` produces the
   snapshot JSON. Snapshots are immutable historical records (ADR-0002): each is
   frozen under the rules of its time, so if the object's fields evolve later,
   old snapshots keep their old JSON — that is correct, not drift.
5. **L3a is a `ConsentPolicy` with grant-only fields absent.** No separate type.
   `from_candidate_dossier(dossier)` yields render params `identity_anonymized
=False`, `mask_client_names=False`, `temporal_precision="exact"`,
   `share_contact`/`share_finances` from the dossier, empty exclusions, and a
   `to_frozen_dict()` limited to `share_contact`/`share_finances` (matches
   today's L3a freeze exactly).

## Interface (locked)

```python
# backend/services/documents/consent_policy.py
@dataclass(frozen=True)
class ConsentPolicy:
    # all axes + legal fields; grant-only fields Optional for the L3a case

    @classmethod
    def from_grant(cls, grant: AccessGrant, exclusions: Sequence[AccessGrantExclusion]) -> "ConsentPolicy": ...

    @classmethod
    def from_candidate_dossier(cls, dossier: Dossier) -> "ConsentPolicy": ...

    def render_params(self) -> RenderParams: ...          # the 5-axis subset build_render_model consumes
    @property
    def excluded_experience_ids(self) -> frozenset[UUID]: ...
    def to_frozen_dict(self) -> dict[str, Any]: ...        # the snapshot JSON
```

`render_params()` returns exactly the keyword arguments `build_render_model`
already takes today (`share_contact`, `share_finances`, `identity_anonymized`,
`mask_client_names`, `temporal_precision`) — a small frozen carrier, not the
whole object, so the DOCX engine's signature does not couple to `ConsentPolicy`.

## Slices (TDD, each independently mergeable)

### Slice 1 — the pure module, no callers changed

Write `consent_policy.py` with both builders and the three projections. Unit
tests (no DB): `from_grant` maps every axis; `from_candidate_dossier` yields the
L3a defaults; `excluded_experience_ids` filters to EXPERIENCE targets;
`to_frozen_dict()` for L3b equals today's `_consent_policy` output field-for-field
and for L3a equals `{share_contact, share_finances}`. Verify: new unit test file
green, nothing else touched.

### Slice 2 — render path reads the policy

`resolve_dossier` builds `ConsentPolicy` from the loaded grant + exclusions (or
from the dossier for L3a), then feeds `build_render_model(**policy.render_params())`
and filters experiences on `policy.excluded_experience_ids`. Delete
`generation_service._excluded_experience_ids` and the inline grant-field
extraction. Verify: existing render/generation integration tests unchanged and
green (needs Docker).

### Slice 3 — freeze reads the policy, parity locked

`snapshot_service.create_dossier_snapshot` builds the same `ConsentPolicy` and
freezes `policy.to_frozen_dict()`. Delete `_consent_policy`. **Parity test:** for
a fixed grant + exclusions, the frozen dict is byte-for-byte what the old
`_consent_policy` produced (snapshot the expected dict in the test). Delete
`dossier_service._excluded_experience_ids` (now unused). Verify:
`test_snapshot_captures_consent_policy` and the new parity test green.

## Out of scope

- No schema change. No new consent axis is added by this refactor; it only
  relocates the mapping.
- `AnonymizationPolicy` and `build_render_model` internals are untouched.
- The `download_document` / `is_live` liveness cleanup (separate change, already
  landed on `dev`) is unrelated.
