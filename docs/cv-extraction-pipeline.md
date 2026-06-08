# CV Extraction Pipeline

Jorg treats an uploaded CV as a proposal source, not as the profile source of
truth. Extracted data is stored as a `pending_review` proposal and must be
reviewed, corrected, and confirmed by the candidate before it updates profile
records.

## V1 Pipeline

1. Upload: candidate sends one PDF or DOCX to `POST /candidates/me/parse-cv`.
2. Validation: backend rejects unsupported formats and files over `MAX_CV_BYTES`
   (currently 5 MB).
3. Fast extraction:
   - DOCX: `python-docx`, method `docx_fast`.
   - PDF text layer: PyMuPDF block extraction, method `pdf_pymupdf`.
     `pypdf` remains a last-resort text fallback if PyMuPDF returns no text.
4. Quality score: technical-only score based on text length, email/date signals,
   likely CV sections, readable-character ratio, and non-empty line count.
5. Fallback: if fast extraction is weak, the pipeline calls the `DocumentParser`
   fallback. V1 ships a Docling stub (`docling_fallback`) so the integration
   point is explicit without adding a heavy runtime dependency.
6. Cleaning: whitespace and null characters are normalized.
7. Structured extraction:
   - If an LLM client is wired later, it must return strict JSON matching the
     Pydantic proposal schema.
   - Without an LLM, Jorg uses deterministic heuristics and marks ambiguous
     fields with `needs_review=true`.
8. Schema validation: proposal JSON is validated before persistence.
9. Skill matching: existing ESCO skill index is reused. Skills are separated by
   `match_type`: `explicit`, `normalized`, `inferred`, or `unmatched`, while
   preserving the original CV label.
10. Persistence: `cv_extraction_proposals` stores raw extracted text, structured
    proposal JSON, extraction method, quality score/details, warnings, file
    hash, and status.
11. Review: UI displays warnings and proposal metadata. Nothing is inserted into
    profile tables until the candidate confirms.

## Optional Dependencies

- Docling: future optional parser for complex PDFs. OCR must remain opt-in.
- OCR: not enabled by default. A future OCR parser should be another
  `DocumentParser` implementation with explicit configuration.
- LLM: V1 exposes a `CVLLMClient` abstraction. A provider can be added later
  with low temperature, strict JSON output, and no repeated full-CV calls unless
  required.

## Environment

No new required environment variable in V1.

Future LLM wiring should use provider-specific variables and keep the default
path provider-free.

## Known Limits

- Scanned PDFs are not handled unless a future OCR/Docling parser is enabled.
- Heuristic structured extraction is conservative and intentionally incomplete.
- The CV content must not be logged. Logs should contain only technical metadata
  such as method, score, status, and request IDs.
