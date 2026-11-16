import json
from pathlib import Path

from openapi_spec_validator import validate

from app.contracts.generate import OUTPUT_PATH, build_openapi_spec
from app.core.config import Settings
from app.main import create_app

EXPECTED_OPERATIONS = {
    ("get", "/api/v1/health"),
    ("get", "/api/v1/capabilities"),
    ("get", "/api/v1/models"),
    ("post", "/api/v1/datasets"),
    ("get", "/api/v1/datasets"),
    ("get", "/api/v1/datasets/{dataset_id}"),
    ("get", "/api/v1/datasets/{dataset_id}/variables"),
    ("put", "/api/v1/datasets/{dataset_id}/mapping"),
    ("get", "/api/v1/datasets/{dataset_id}/series"),
    ("delete", "/api/v1/datasets/{dataset_id}"),
    ("post", "/api/v1/analysis-runs"),
    ("get", "/api/v1/analysis-runs"),
    ("get", "/api/v1/analysis-runs/{analysis_id}"),
    ("post", "/api/v1/analysis-runs/{analysis_id}/cancel"),
    ("post", "/api/v1/analysis-runs/{analysis_id}/rerun"),
    ("get", "/api/v1/analysis-runs/{analysis_id}/series"),
    ("get", "/api/v1/analysis-runs/{analysis_id}/export"),
    ("post", "/api/v1/analysis-batches"),
    ("get", "/api/v1/analysis-batches/{batch_id}"),
    ("post", "/api/v1/analysis-runs/{analysis_id}/explanations"),
    ("get", "/api/v1/explanations/{explanation_id}"),
    ("post", "/api/v1/simulated-datasets"),
}


def load_spec() -> dict:
    return json.loads(Path(OUTPUT_PATH).read_text(encoding="utf-8"))


def test_openapi_spec_is_valid() -> None:
    validate(load_spec())


def test_all_required_operations_are_present() -> None:
    spec = load_spec()
    actual = {
        (method, path)
        for path, path_item in spec["paths"].items()
        for method in ("get", "post", "put", "delete")
        if method in path_item
    }
    assert actual == EXPECTED_OPERATIONS


def test_operation_ids_are_unique() -> None:
    spec = load_spec()
    operation_ids = [
        operation["operationId"]
        for path_item in spec["paths"].values()
        for method, operation in path_item.items()
        if method in {"get", "post", "put", "delete"}
    ]
    assert len(operation_ids) == len(set(operation_ids))


def test_declared_errors_use_common_error_response() -> None:
    spec = load_spec()
    for path_item in spec["paths"].values():
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "delete"}:
                continue
            for status, response in operation["responses"].items():
                if status not in {"400", "404", "409", "413", "422", "500", "503"}:
                    continue
                schema = response["content"]["application/json"]["schema"]
                assert schema["$ref"].endswith("/ErrorResponse")


def test_generated_file_matches_contract_routes() -> None:
    assert load_spec() == build_openapi_spec()


def test_runtime_does_not_expose_unimplemented_business_routes() -> None:
    runtime_paths = create_app(Settings(environment="test")).openapi()["paths"]
    assert set(runtime_paths) == {
        "/api/v1/health",
        "/api/v1/datasets",
        "/api/v1/datasets/{dataset_id}",
    }
