import datetime as dt
import os
from typing import Literal

import pandas as pd
from jobspy import scrape_jobs
from pydantic import BaseModel, Field

Site = Literal["linkedin", "indeed"]


class ScrapeRequest(BaseModel):
    site: Site
    search_term: str = Field(min_length=1)
    location: str = Field(min_length=1)
    hours_old: int = Field(ge=0)
    results_wanted: int = Field(ge=1)


class ScrapeResponse(BaseModel):
    rows: list[dict]
    errors: dict[str, str]


def proxies_from_env() -> list[str] | None:
    entries = [p.strip() for p in os.environ.get("JOBSPY_PROXIES", "").split(",")]
    return [p for p in entries if p] or None


def _json_value(value: object) -> object:
    if pd.isna(value):
        return None
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return value.item() if hasattr(value, "item") else value


def rows_as_json(frame: pd.DataFrame) -> list[dict]:
    return [
        {column: _json_value(value) for column, value in row.items()}
        for row in frame.astype(object).to_dict("records")
    ]


def scrape(request: ScrapeRequest) -> ScrapeResponse:
    frame = scrape_jobs(
        site_name=[request.site],
        search_term=request.search_term,
        location=request.location,
        hours_old=request.hours_old,
        results_wanted=request.results_wanted,
        country_indeed="Canada",
        proxies=proxies_from_env(),
    )
    return ScrapeResponse(
        rows=rows_as_json(frame), errors=dict(frame.attrs.get("errors", {}))
    )
