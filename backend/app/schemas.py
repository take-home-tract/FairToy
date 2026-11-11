"""The API contract as typed models. See docs/api.md.

Fields are written in snake_case here and sent as camelCase (partsTouched).
"""

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.exposure import Exposure


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SupplierRef(ApiModel):
    id: int
    name: str


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
    # The suppliers with a finding that can make one of the toy's parts.
    flagged_suppliers: list[SupplierRef]
    # How many of its parts have a recorded supplier (a resolution).
    parts_resolved: int


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


class ResolutionOut(ApiModel):
    """The supplier the Finisher recorded as having made this part of this toy."""

    supplier: SupplierRef
    recorded_at: str  # ISO 8601, UTC
    recorded_by: str  # username


class ResolutionRequest(ApiModel):
    supplier_id: int = Field(ge=1)


class ResolutionResponse(ApiModel):
    resolution: ResolutionOut | None


class TracePart(ApiModel):
    id: int
    code: str
    name: str
    exposure: Exposure
    sources: list[TraceSource]  # every possible source, also when a resolution names one
    resolution: ResolutionOut | None


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
    part_count: int  # how many of the Finisher's parts this supplier can make
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


class SupplierPart(ApiModel):
    """A part this supplier can make for the Finisher."""

    id: int
    code: str
    name: str
    factories: list[TraceFactory]  # where this supplier makes it
    other_suppliers: list[SupplierRef]  # empty: this supplier is the only source
    toy_count: int  # how many toys use the part


class ReachedToy(ApiModel):
    id: int
    code: str
    name: str
    exposure_now: Exposure
    exposure_if_flagged: Exposure
    part_ids: list[int]  # the parts (from `parts`) that connect the toy to this supplier


class SupplierDetailResponse(ApiModel):
    supplier: SupplierOut
    parts: list[SupplierPart]
    toys: list[ReachedToy]
