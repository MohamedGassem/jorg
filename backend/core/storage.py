# backend/core/storage.py
"""File storage backends. Local for dev; S3/R2 for production.

Generated documents use get_storage() / StorageBackend.
Template files use the module-level save_upload() / delete_file() (local only).
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path
from typing import Any, Protocol

_UPLOAD_DIR = Path(__file__).parent.parent / "uploads"


# ---------------------------------------------------------------------------
# Legacy helpers — used by template upload/delete in organizations.py
# ---------------------------------------------------------------------------


def upload_dir() -> Path:
    return _UPLOAD_DIR.resolve()


def save_upload(content: bytes, original_filename: str) -> str:
    """Save raw bytes to local upload dir. Returns absolute path."""
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{Path(original_filename).name}"
    dest = _UPLOAD_DIR / safe_name
    dest.write_bytes(content)
    return str(dest)


def delete_file(file_path: str) -> None:
    """Delete a local file. Silently ignores missing files."""
    path = Path(file_path)
    if path.exists():
        path.unlink()


# ---------------------------------------------------------------------------
# StorageBackend — used for generated documents
# ---------------------------------------------------------------------------


class StorageBackend(Protocol):
    async def save(self, file_bytes: bytes, filename: str) -> str: ...

    async def delete(self, key: str) -> None: ...

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str | None: ...


class LocalStorageBackend:
    def __init__(self, upload_dir: Path = _UPLOAD_DIR) -> None:
        self._dir = upload_dir

    def upload_dir(self) -> Path:
        return self._dir.resolve()

    def resolve_local_path(self, key: str) -> Path:
        """Resolve storage key to a validated absolute path within upload_dir.

        Raises ValueError on path traversal attempts.
        """
        path = Path(key).resolve()
        if not path.is_relative_to(self.upload_dir()):
            raise ValueError("path is outside upload directory")
        return path

    async def save(self, file_bytes: bytes, filename: str) -> str:
        safe_name = f"{uuid.uuid4()}_{Path(filename).name}"
        dest = self._dir / safe_name
        loop = asyncio.get_running_loop()

        def _write() -> None:
            self._dir.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(file_bytes)

        await loop.run_in_executor(None, _write)
        return str(dest)

    async def delete(self, key: str) -> None:
        path = Path(key)
        loop = asyncio.get_running_loop()

        def _delete() -> None:
            if path.exists():
                path.unlink()

        await loop.run_in_executor(None, _delete)

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str | None:
        return None  # served locally by the download endpoint


class S3StorageBackend:
    # boto3 clients are not thread-safe for concurrent calls. We store only the
    # config and create a fresh client per executor call to avoid data races in
    # the thread pool used by run_in_executor.
    def __init__(
        self,
        bucket: str,
        endpoint_url: str | None,
        access_key: str,
        secret_key: str,
        region: str,
    ) -> None:
        self._bucket = bucket
        self._endpoint_url = endpoint_url
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = region

    def _make_client(self) -> Any:
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name=self._region,
            config=Config(signature_version="s3v4"),
        )

    async def save(self, file_bytes: bytes, filename: str) -> str:
        key = f"{uuid.uuid4()}_{Path(filename).name}"
        bucket = self._bucket
        client = self._make_client()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, lambda: client.put_object(Bucket=bucket, Key=key, Body=file_bytes)
        )
        return key

    async def delete(self, key: str) -> None:
        bucket = self._bucket
        client = self._make_client()
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: client.delete_object(Bucket=bucket, Key=key))

    async def get_download_url(self, key: str, expires_in: int = 3600) -> str | None:
        bucket = self._bucket
        client = self._make_client()
        loop = asyncio.get_running_loop()
        url: str = await loop.run_in_executor(
            None,
            lambda: client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_in,
            ),
        )
        return url


_storage_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage_instance
    if _storage_instance is None:
        from core.config import get_settings

        settings = get_settings()
        if settings.storage_backend == "s3":
            bucket = settings.s3_bucket_name or ""
            access_key = settings.s3_access_key_id or ""
            secret_key = settings.s3_secret_access_key or ""
            if not bucket or not access_key or not secret_key:
                raise ValueError(
                    "S3_BUCKET_NAME, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY "
                    "are required when STORAGE_BACKEND=s3"
                )
            _storage_instance = S3StorageBackend(
                bucket=bucket,
                endpoint_url=settings.s3_endpoint_url,
                access_key=access_key,
                secret_key=secret_key,
                region=settings.s3_region,
            )
        else:
            _storage_instance = LocalStorageBackend()
    return _storage_instance


def override_storage(backend: StorageBackend | None) -> None:
    """Test helper — override the storage singleton."""
    global _storage_instance
    _storage_instance = backend
