# backend/core/storage.py
"""Local file storage for dev. Replace with S3 adapter in production."""

from __future__ import annotations

import uuid
from pathlib import Path

_UPLOAD_DIR = Path(__file__).parent.parent / "uploads"


def upload_dir() -> Path:
    return _UPLOAD_DIR.resolve()


def save_upload(content: bytes, original_filename: str) -> str:
    """Save raw bytes to local storage.

    Returns the absolute path of the saved file as a string.
    """
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{Path(original_filename).name}"
    dest = _UPLOAD_DIR / safe_name
    dest.write_bytes(content)
    return str(dest)


def delete_file(file_path: str) -> None:
    """Delete a file from local storage. Silently ignores missing files."""
    path = Path(file_path)
    if path.exists():
        path.unlink()
