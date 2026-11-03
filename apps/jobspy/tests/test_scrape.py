import pytest
from fastapi.testclient import TestClient

from tests.conftest import FakeScrape, recorded_frame

BODY = {
    "site": "linkedin",
    "search_term": "junior software developer",
    "location": "Toronto, ON",
    "hours_old": 2,
    "results_wanted": 10,
}


def test_rows_serialize_with_null_and_iso_dates(
    client: TestClient, fake_scrape: FakeScrape
) -> None:
    response = client.post("/scrape", json=BODY)

    assert response.status_code == 200
    body = response.json()
    assert body["errors"] == {}
    [row] = body["rows"]
    assert row["id"] == "li-4484496029"
    assert row["date_posted"] == "2026-10-28"
    assert row["job_url_direct"] is None
    assert row["min_amount"] is None
    assert row["is_remote"] is False
    assert row["emails"] == "jobs@example.com, careers@example.com"


def test_indeed_numbers_and_dates(client: TestClient, fake_scrape: FakeScrape) -> None:
    fake_scrape.result = recorded_frame("indeed")

    response = client.post("/scrape", json={**BODY, "site": "indeed"})

    [row] = response.json()["rows"]
    assert row["min_amount"] == 58000.0
    assert row["date_posted"] == "2026-10-29"
    assert row["job_type"] is None


def test_request_reaches_scrape_jobs(
    client: TestClient, fake_scrape: FakeScrape
) -> None:
    client.post("/scrape", json=BODY)

    [call] = fake_scrape.calls
    assert call["site_name"] == ["linkedin"]
    assert call["search_term"] == "junior software developer"
    assert call["location"] == "Toronto, ON"
    assert call["hours_old"] == 2
    assert call["results_wanted"] == 10
    assert not call.get("linkedin_fetch_description")
    assert not call.get("fetch_description")


def test_indeed_searches_use_canada(
    client: TestClient, fake_scrape: FakeScrape
) -> None:
    client.post("/scrape", json={**BODY, "site": "indeed"})

    assert fake_scrape.calls[0]["country_indeed"] == "Canada"


def test_blocked_board_is_200_with_errors(
    client: TestClient, fake_scrape: FakeScrape
) -> None:
    blocked = recorded_frame("linkedin").iloc[0:0]
    blocked.attrs = {
        "errors": {"linkedin": "429 Too Many Requests (blocked: use a proxy)"}
    }
    fake_scrape.result = blocked

    response = client.post("/scrape", json=BODY)

    assert response.status_code == 200
    assert response.json() == {
        "rows": [],
        "errors": {"linkedin": "429 Too Many Requests (blocked: use a proxy)"},
    }


def test_exception_is_500(client: TestClient, fake_scrape: FakeScrape) -> None:
    fake_scrape.error = RuntimeError("boom")

    assert client.post("/scrape", json=BODY).status_code == 500


def test_unknown_site_is_422(client: TestClient, fake_scrape: FakeScrape) -> None:
    response = client.post("/scrape", json={**BODY, "site": "glassdoor"})

    assert response.status_code == 422
    assert fake_scrape.calls == []


@pytest.mark.parametrize(
    "override",
    [{"hours_old": -1}, {"results_wanted": 0}, {"search_term": ""}, {"location": " "}],
)
def test_out_of_range_field_is_422(
    client: TestClient, fake_scrape: FakeScrape, override: dict
) -> None:
    assert client.post("/scrape", json={**BODY, **override}).status_code == 422
    assert fake_scrape.calls == []


@pytest.mark.parametrize(
    "field", ["search_term", "location", "hours_old", "results_wanted"]
)
def test_missing_field_is_422(
    client: TestClient, fake_scrape: FakeScrape, field: str
) -> None:
    body = {k: v for k, v in BODY.items() if k != field}

    assert client.post("/scrape", json=body).status_code == 422


def test_proxies_come_from_env(
    client: TestClient, fake_scrape: FakeScrape, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("JOBSPY_PROXIES", "u:p@proxy-a:8000, u:p@proxy-b:8000 ,")

    client.post("/scrape", json=BODY)

    assert fake_scrape.calls[0]["proxies"] == ["u:p@proxy-a:8000", "u:p@proxy-b:8000"]


def test_no_proxies_when_env_is_unset(
    client: TestClient, fake_scrape: FakeScrape, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("JOBSPY_PROXIES", raising=False)

    client.post("/scrape", json=BODY)

    assert fake_scrape.calls[0]["proxies"] is None


def test_request_cannot_set_proxies(
    client: TestClient, fake_scrape: FakeScrape
) -> None:
    client.post("/scrape", json={**BODY, "proxies": ["evil:1"]})

    assert fake_scrape.calls[0]["proxies"] is None


def test_openapi_lists_scrape_models(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()

    assert "/scrape" in spec["paths"]
    assert {"ScrapeRequest", "ScrapeResponse"} <= set(spec["components"]["schemas"])
