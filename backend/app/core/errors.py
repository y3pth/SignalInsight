import logging
from collections.abc import Mapping
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response

from app.schemas.common import ErrorBody, ErrorResponse

logger = logging.getLogger("signalinsight")


class AppError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def request_id_for(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid4()))


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            details=details or {},
            request_id=request_id_for(request),
        )
    )
    response_headers = {"X-Request-ID": body.error.request_id}
    if headers:
        response_headers.update(headers)
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(body),
        headers=response_headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> Response:
        return error_response(
            request,
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> Response:
        return error_response(
            request,
            status_code=422,
            code="VALIDATION_ERROR",
            message="Request validation failed.",
            details={"errors": jsonable_encoder(exc.errors())},
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> Response:
        message = exc.detail if isinstance(exc.detail, str) else "HTTP request failed."
        details: dict[str, Any] = {} if isinstance(exc.detail, str) else {"detail": exc.detail}
        return error_response(
            request,
            status_code=exc.status_code,
            code=f"HTTP_{exc.status_code}",
            message=message,
            details=jsonable_encoder(details),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> Response:
        logger.error(
            "Unhandled application error",
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        return error_response(
            request,
            status_code=500,
            code="INTERNAL_SERVER_ERROR",
            message="An unexpected internal error occurred.",
        )
