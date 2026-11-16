from fastapi import FastAPI

from app.contracts.routes import contract_router

CONTRACT_VERSION = "1.0.0"


def create_contract_app() -> FastAPI:
    app = FastAPI(
        title="SignalInsight API",
        version=CONTRACT_VERSION,
        openapi_url="/api/v1/openapi.json",
    )
    app.include_router(contract_router)
    return app
