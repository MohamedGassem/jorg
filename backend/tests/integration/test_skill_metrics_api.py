# backend/tests/integration/test_skill_metrics_api.py
from httpx import AsyncClient


async def test_metrics_empty_when_no_usages(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    r = await client.get("/candidates/me/skill-metrics", headers=candidate_headers)
    assert r.status_code == 200
    assert r.json() == []


async def test_metrics_computed_from_usages(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_r = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={
            "client_name": "MetricsCorp",
            "role": "Engineer",
            "start_date": "2022-01-01",
            "end_date": "2023-01-01",
        },
    )
    exp_id = exp_r.json()["id"]

    ref_r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "PythonMetrics", "kind": "technical"},
    )
    ref_id = ref_r.json()["id"]

    await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "usage_role": "implementer", "intensity": "primary"},
    )

    r = await client.get("/candidates/me/skill-metrics", headers=candidate_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    m = data[0]
    assert m["skill_name"] == "PythonMetrics"
    assert m["months_weighted"] == 12.0
    assert m["distinct_contexts"] == 1
    assert m["validated"] is True


async def test_metrics_secondary_weight(
    client: AsyncClient, candidate_headers: dict[str, str]
) -> None:
    exp_r = await client.post(
        "/candidates/me/experiences",
        headers=candidate_headers,
        json={
            "client_name": "SecCorp",
            "role": "Dev",
            "start_date": "2022-01-01",
            "end_date": "2023-01-01",
        },
    )
    exp_id = exp_r.json()["id"]
    ref_r = await client.post(
        "/skill-references",
        headers=candidate_headers,
        json={"name": "SecondarySkill", "kind": "tool"},
    )
    ref_id = ref_r.json()["id"]
    await client.post(
        f"/candidates/me/experiences/{exp_id}/skill-usages",
        headers=candidate_headers,
        json={"skill_ref_id": ref_id, "usage_role": "user", "intensity": "secondary"},
    )
    r = await client.get("/candidates/me/skill-metrics", headers=candidate_headers)
    metric = next(m for m in r.json() if m["skill_name"] == "SecondarySkill")
    assert metric["months_weighted"] == 6.0
    assert metric["validated"] is True


async def test_metrics_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/candidates/me/skill-metrics")
    assert r.status_code == 401
