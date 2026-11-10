"""The API contract as typed models. See docs/api.md.

Fields are written in snake_case here and sent as camelCase (partsTouched).
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.exposure import Exposure


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --- auth ---


class LoginRequest(ApiModel):
    username: str
    password: str


class UserOut(ApiModel):
    id: int
    username: str


class FinisherOut(ApiModel):
    id: int
    name: str


class MeResponse(ApiModel):
    user: UserOut
    finisher: FinisherOut


class LoginResponse(MeResponse):
    token: str


# --- findings ---


class FindingOut(ApiModel):
    recorded_at: str  # ISO 8601, UTC
    recorded_by: str  # username


class FindingResponse(ApiModel):
    finding: FindingOut | None


# --- toys ---


class ToySummary(ApiModel):
    total: int
    affected: int
    possibly_affected: int
    no_finding: int


class ToyListItem(ApiModel):
    id: int
    code: str
    name: str
    exposure: Exposure
    parts_touched: int
    part_count: int


class ToysResponse(ApiModel):
    summary: ToySummary
    toys: list[ToyListItem]


class TraceSupplier(ApiModel):
    id: int
    name: str
    country: str


class TraceFactory(ApiModel):
    name: str
    country: str


class TraceSource(ApiModel):
    supplier: TraceSupplier
    factory: TraceFactory
    has_finding: bool


class TracePart(ApiModel):
    id: int
    code: str
    name: str
    exposure: Exposure
    sources: list[TraceSource]


class TraceToy(ApiModel):
    id: int
    code: str
    name: str
    exposure: Exposure


class ToyTraceResponse(ApiModel):
    toy: TraceToy
    parts: list[TracePart]


# --- suppliers ---


class SupplierListItem(ApiModel):
    id: int
    code: str
    name: str
    country: str
    toys_reached: int
    finding: FindingOut | None


class SuppliersResponse(ApiModel):
    suppliers: list[SupplierListItem]


class SupplierOut(ApiModel):
    id: int
    code: str
    name: str
    country: str
    finding: FindingOut | None


class ReachedToy(ApiModel):
    id: int
    code: str
    name: str
    exposure_now: Exposure
    exposure_if_flagged: Exposure


class SupplierDetailResponse(ApiModel):
    supplier: SupplierOut
    toys: list[ReachedToy]
