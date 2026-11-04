import json
from pathlib import Path

from app.main import app

if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "openapi.json"
    out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
