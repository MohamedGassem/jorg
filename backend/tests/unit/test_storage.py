# backend/tests/unit/test_storage.py
from pathlib import Path

import pytest

from core.storage import LocalStorageBackend


@pytest.fixture
def tmp_backend(tmp_path: Path) -> LocalStorageBackend:
    return LocalStorageBackend(upload_dir=tmp_path)


async def test_local_save_returns_path_under_upload_dir(
    tmp_backend: LocalStorageBackend, tmp_path: Path
) -> None:
    key = await tmp_backend.save(b"hello docx", "test.docx")
    assert Path(key).exists()
    assert Path(key).is_relative_to(tmp_path)


async def test_local_save_creates_unique_keys(tmp_backend: LocalStorageBackend) -> None:
    key1 = await tmp_backend.save(b"content", "file.docx")
    key2 = await tmp_backend.save(b"content", "file.docx")
    assert key1 != key2


async def test_local_delete_removes_file(tmp_backend: LocalStorageBackend) -> None:
    key = await tmp_backend.save(b"data", "doc.docx")
    assert Path(key).exists()
    await tmp_backend.delete(key)
    assert not Path(key).exists()


async def test_local_delete_silently_ignores_missing(tmp_backend: LocalStorageBackend) -> None:
    await tmp_backend.delete("/nonexistent/path.docx")  # must not raise


async def test_local_get_download_url_returns_none(tmp_backend: LocalStorageBackend) -> None:
    key = await tmp_backend.save(b"data", "doc.docx")
    url = await tmp_backend.get_download_url(key)
    assert url is None
