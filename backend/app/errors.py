"""One error shape for the whole API (docs/api.md):

    { "error": { "code": "supplier_not_found", "message": "No such supplier for this Finisher." } }
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, headers: dict[str, str] | None = None):
        self.status, self.code, self.message, self.headers = status, code, message, headers


def not_authenticated() -> ApiError:
    return ApiError(401, "not_authenticated", "Sign in to continue.", {"WWW-Authenticate": "Bearer"})


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    def api_error(request: Request, exc: ApiError):
        return JSONResponse(_body(exc.code, exc.message), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    def invalid_request(request: Request, exc: RequestValidationError):
        # The framework's own validation errors, for example an id that is not a number.
        return JSONResponse(_body("invalid_request", "The request is not valid."), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    def http_error(request: Request, exc: StarletteHTTPException):
        # Raised by the framework itself: unknown path, wrong method.
        codes = {404: "not_found", 405: "method_not_allowed"}
        return JSONResponse(
            _body(codes.get(exc.status_code, "http_error"), str(exc.detail)),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    def internal_error(request: Request, exc: Exception):
        return JSONResponse(_body("internal_error", "Something went wrong on the server."), status_code=500)
