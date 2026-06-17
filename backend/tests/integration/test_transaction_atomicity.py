# backend/tests/integration/test_transaction_atomicity.py
"""Atomicity of the request-scoped transaction boundary (D2).

get_db commits once when the handler returns and rolls back on any exception,
so a failure after an intermediate write must leave no row behind.
"""

import pytest
from httpx import AsyncClient


async def test_error_after_write_rolls_back_the_whole_request(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Registration flushes the user row, then issues the token pair. Force the
    # token step to raise: the user write must roll back with the request.
    async def boom(*args: object, **kwargs: object) -> tuple[str, str]:
        raise RuntimeError("boom after the user row was written")

    monkeypatch.setattr("api.routes.auth.issue_token_pair", boom)

    with pytest.raises(RuntimeError):
        await client.post(
            "/auth/register",
            json={
                "email": "atomicity@test.com",
                "password": "testpass123",
                "role": "candidate",
            },
        )

    # The user row was rolled back: the email is free again, so a second
    # (now succeeding) registration returns 201 instead of 409.
    monkeypatch.undo()
    r = await client.post(
        "/auth/register",
        json={
            "email": "atomicity@test.com",
            "password": "testpass123",
            "role": "candidate",
        },
    )
    assert r.status_code == 201
