from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_not_found_uses_error_contract(client: TestClient) -> None:
    response = client.get("/api/v1/missing")

    assert response.status_code == 404
    body = response.json()["error"]
    assert body["code"] == "HTTP_404"
    assert body["details"] == {}
    assert body["request_id"] == response.headers["X-Request-ID"]


def test_validation_error_uses_error_contract(settings: Settings) -> None:
    app = create_app(settings)

    @app.get("/validation-test")
    def validation_test(value: int) -> dict[str, int]:
        return {"value": value}

    with TestClient(app) as client:
        response = client.get("/validation-test", params={"value": "invalid"})

    assert response.status_code == 422
    body = response.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["errors"][0]["loc"] == ["query", "value"]


def test_unexpected_error_is_sanitized(settings: Settings) -> None:
    app = create_app(settings)

    @app.get("/failure-test")
    def failure_test() -> None:
        raise RuntimeError("sensitive internal detail")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/failure-test")

    assert response.status_code == 500
    body = response.json()["error"]
    assert body["code"] == "INTERNAL_SERVER_ERROR"
    assert "sensitive internal detail" not in response.text
    assert body["request_id"] == response.headers["X-Request-ID"]
