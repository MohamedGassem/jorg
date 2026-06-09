from __future__ import annotations

import io
import re
from typing import Protocol

from services.cv.constants import MAX_CV_BYTES, _extension
from services.cv.exceptions import CVTextExtractionError, CVTooLargeError, UnsupportedCVFormatError
from services.cv.quality import score_text_quality
from services.cv.schemas import DocumentLine, TextExtractionResult


class DocumentParser(Protocol):
    method: str

    def supports(self, filename: str) -> bool: ...
    def extract(self, data: bytes) -> str: ...


class FastDocxParser:
    method = "docx_fast"

    def supports(self, filename: str) -> bool:
        return _extension(filename) == "docx"

    def extract(self, data: bytes) -> str:
        return _extract_docx(data)


class FastPdfParser:
    method = "pdf_pymupdf"

    def supports(self, filename: str) -> bool:
        return _extension(filename) == "pdf"

    def extract(self, data: bytes) -> str:
        text = _extract_pdf_layout(data)
        return text if text.strip() else _extract_pdf_legacy(data)


def validate_cv_file(filename: str, data: bytes) -> None:
    if len(data) > MAX_CV_BYTES:
        raise CVTooLargeError(f"file exceeds {MAX_CV_BYTES} bytes")
    if _extension(filename) not in {"pdf", "docx"}:
        raise UnsupportedCVFormatError("Format non supporté. Utilisez un fichier PDF ou DOCX.")


def extract_text(filename: str, data: bytes) -> str:
    result = extract_text_with_metadata(filename, data)
    return result.text


def extract_text_with_metadata(
    filename: str,
    data: bytes,
    parsers: list[DocumentParser] | None = None,
    fallback_parser: DocumentParser | None = None,
) -> TextExtractionResult:
    validate_cv_file(filename, data)
    warnings: list[str] = []
    selected = next(
        (p for p in (parsers or [FastDocxParser(), FastPdfParser()]) if p.supports(filename)),
        None,
    )
    if selected is None:
        raise UnsupportedCVFormatError("Format non supporté. Utilisez un fichier PDF ou DOCX.")

    try:
        text = selected.extract(data)
        fast_error: Exception | None = None
    except Exception as exc:
        warnings.append("L'extraction rapide a échoué.")
        text = ""
        fast_error = exc

    quality = score_text_quality(text)
    if quality.score < 45 and fallback_parser is not None and fallback_parser.supports(filename):
        try:
            fallback_text = fallback_parser.extract(data)
            fallback_quality = score_text_quality(fallback_text)
            if fallback_quality.score > quality.score:
                return TextExtractionResult(
                    text=clean_extracted_text(fallback_text),
                    method=fallback_parser.method,
                    warnings=[*warnings, *fallback_quality.warnings],
                    quality=fallback_quality,
                )
        except CVTextExtractionError as exc:
            warnings.append(str(exc))

    text = clean_extracted_text(text)
    if not text.strip():
        raise CVTextExtractionError("Aucun texte exploitable n'a pu être extrait du fichier.")
    if fast_error is not None:
        warnings.append(str(fast_error))
    lines = _extract_document_lines(filename, data, text)
    return TextExtractionResult(
        text=text,
        method=selected.method,
        warnings=warnings,
        lines=lines,
        quality=quality,
    )


def _extract_pdf_layout(data: bytes) -> str:
    import fitz  # type: ignore[import-untyped]

    document = fitz.open(stream=data, filetype="pdf")
    pages: list[str] = []
    for page in document:
        blocks = page.get_text("blocks", sort=True)
        lines: list[str] = []
        for block in blocks:
            if len(block) < 5:
                continue
            text = str(block[4]).strip()
            if not text:
                continue
            lines.extend(line.strip() for line in text.splitlines() if line.strip())
        pages.append("\n".join(lines))
    return "\n\n".join(page for page in pages if page.strip())


def _extract_document_lines(filename: str, data: bytes, fallback_text: str) -> list[DocumentLine]:
    if _extension(filename) == "pdf":
        try:
            lines = _extract_pdf_document_lines(data)
            if lines:
                return lines
        except Exception:
            pass
    return _text_to_document_lines(fallback_text)


def _extract_pdf_document_lines(data: bytes) -> list[DocumentLine]:
    import fitz

    document = fitz.open(stream=data, filetype="pdf")
    lines: list[DocumentLine] = []
    line_index = 0
    for page_index, page in enumerate(document, start=1):
        payload = page.get_text("dict", sort=True)
        for block in payload.get("blocks", []):
            if block.get("type") != 0:
                continue
            for raw_line in block.get("lines", []):
                spans = raw_line.get("spans", [])
                text = clean_extracted_text(" ".join(span.get("text", "") for span in spans))
                if not text:
                    continue
                bbox = raw_line.get("bbox", [None, None, None, None])
                sizes = [float(span.get("size", 0)) for span in spans if span.get("size")]
                font_names = " ".join(str(span.get("font", "")) for span in spans).lower()
                lines.append(
                    DocumentLine(
                        text=text,
                        page=page_index,
                        x0=bbox[0],
                        y0=bbox[1],
                        x1=bbox[2],
                        y1=bbox[3],
                        font_size=max(sizes) if sizes else None,
                        is_bold="bold" in font_names or "black" in font_names,
                        line_index=line_index,
                    )
                )
                line_index += 1
    return lines


def _text_to_document_lines(text: str) -> list[DocumentLine]:
    return [
        DocumentLine(text=line.strip(), line_index=index)
        for index, line in enumerate(text.splitlines())
        if line.strip()
    ]


def _extract_pdf_legacy(data: bytes) -> str:
    from pypdf import PdfReader  # type: ignore[import-not-found]

    reader = PdfReader(io.BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _extract_docx(data: bytes) -> str:
    from docx import Document

    document = Document(io.BytesIO(data))
    parts = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            parts.extend(cell.text for cell in row.cells)
    return "\n".join(parts)


def clean_extracted_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
