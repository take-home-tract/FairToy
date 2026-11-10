"""The API contract as typed models. See docs/api.md."""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str


class FinisherOut(BaseModel):
    id: int
    name: str


class MeResponse(BaseModel):
    user: UserOut
    finisher: FinisherOut


class LoginResponse(MeResponse):
    token: str
