from __future__ import annotations


class UnsupportedCVFormatError(Exception):
    """Raised when the uploaded file type is not supported."""


class CVTooLargeError(Exception):
    """Raised when the uploaded file exceeds MAX_CV_BYTES."""


class CVTextExtractionError(Exception):
    """Raised when no readable text could be extracted from the file."""


class CVLLMExtractionError(Exception):
    """Raised when an LLM response cannot be validated as strict JSON."""


class CVPersistenceUnavailableError(Exception):
    """Raised when the proposal store is unavailable or not migrated."""
