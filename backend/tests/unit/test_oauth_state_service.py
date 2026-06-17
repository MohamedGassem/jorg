# backend/tests/unit/test_oauth_state_service.py
from unittest.mock import AsyncMock, MagicMock

import pytest

import services.auth.oauth_state_service as oauth_state_service


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


async def test_create_state_returns_token(mock_db: AsyncMock) -> None:
    state = await oauth_state_service.create_state(mock_db, "google", "candidate")
    assert len(state) > 16
    mock_db.add.assert_called_once()
    mock_db.flush.assert_called_once()


async def test_consume_state_returns_provider_and_role(mock_db: AsyncMock) -> None:
    # First execute: DELETE ... RETURNING with matched row
    returning_result = MagicMock()
    returning_result.one_or_none.return_value = MagicMock(provider="google", role="candidate")
    # Second execute: bulk cleanup of expired rows
    cleanup_result = MagicMock()
    mock_db.execute = AsyncMock(side_effect=[returning_result, cleanup_result])

    result = await oauth_state_service.consume_state(mock_db, "test-state-token")

    assert result == ("google", "candidate")
    assert mock_db.execute.call_count == 2
    mock_db.flush.assert_called_once()


async def test_consume_state_returns_none_for_missing(mock_db: AsyncMock) -> None:
    returning_result = MagicMock()
    returning_result.one_or_none.return_value = None
    cleanup_result = MagicMock()
    mock_db.execute = AsyncMock(side_effect=[returning_result, cleanup_result])

    result = await oauth_state_service.consume_state(mock_db, "nonexistent")

    assert result is None
    assert mock_db.execute.call_count == 2
    mock_db.flush.assert_called_once()


async def test_consume_state_returns_none_for_expired(mock_db: AsyncMock) -> None:
    # The DELETE ... RETURNING filters expires_at >= now, so expired tokens return no row.
    # The expired token is swept by the cleanup DELETE that follows.
    returning_result = MagicMock()
    returning_result.one_or_none.return_value = None
    cleanup_result = MagicMock()
    mock_db.execute = AsyncMock(side_effect=[returning_result, cleanup_result])

    result = await oauth_state_service.consume_state(mock_db, "expired-state-token")

    assert result is None
    assert mock_db.execute.call_count == 2
    mock_db.flush.assert_called_once()
