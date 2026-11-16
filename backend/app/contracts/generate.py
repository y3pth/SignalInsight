import json
from pathlib import Path
from typing import Any

from app.contracts.app import create_contract_app

PROJECT_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_PATH = PROJECT_ROOT / "contracts" / "openapi.json"


def build_openapi_spec() -> dict[str, Any]:
    return create_contract_app().openapi()


def generate_openapi(output_path: Path = OUTPUT_PATH) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(build_openapi_spec(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return output_path


if __name__ == "__main__":
    print(generate_openapi())
