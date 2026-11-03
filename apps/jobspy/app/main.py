from fastapi import FastAPI

from app.scrape import ScrapeRequest, ScrapeResponse, scrape

app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Sync on purpose: scrape_jobs blocks, so FastAPI runs it in a worker thread.
@app.post("/scrape")
def scrape_endpoint(request: ScrapeRequest) -> ScrapeResponse:
    return scrape(request)
