import datetime as dt
import json
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import scrape
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def recorded_frame(name: str, errors: dict[str, str] | None = None) -> pd.DataFrame:
    rows = json.loads((FIXTURES / f"{name}_rows.json").read_text())
    frame = pd.DataFrame(rows)
    frame["date_posted"] = frame["date_posted"].map(dt.date.fromisoformat)
    frame.attrs = {"errors": errors or {}, "warnings": {}}
    return frame


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


class FakeScrape:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.result: pd.DataFrame = recorded_frame("linkedin")
        self.error: Exception | None = None

    def __call__(self, **kwargs: object) -> pd.DataFrame:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def fake_scrape(monkeypatch: pytest.MonkeyPatch) -> FakeScrape:
    fake = FakeScrape()
    monkeypatch.setattr(scrape, "scrape_jobs", fake)
    return fake
