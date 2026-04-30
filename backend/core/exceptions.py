# backend/core/exceptions.py


class JorgError(Exception):
    status_code: int = 500

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class NotFoundError(JorgError):
    status_code = 404


class ForbiddenError(JorgError):
    status_code = 403


class ConflictError(JorgError):
    status_code = 409


class BusinessRuleError(JorgError):
    status_code = 422
