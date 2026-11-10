"""The exposure rule from docs/spec.md, and nothing else.

Pure functions: no database, no HTTP. This is the only place the rule lives
(docs/decisions.md, D12). The caller passes plain ids and sets.

For one part, looking at the suppliers that can make it:
- affected:          every one of them is implicated;
- possibly_affected: only some are, so we cannot tell which one was used;
- no_finding:        none is. Also a part with no known supplier.

A toy takes the most severe exposure among its parts.

A preview ("what if I flag supplier X?") is the same call with X added to the
implicated set.
"""

from collections.abc import Collection, Mapping
from dataclasses import dataclass
from enum import Enum


class Exposure(str, Enum):
    AFFECTED = "affected"
    POSSIBLY_AFFECTED = "possibly_affected"
    NO_FINDING = "no_finding"


# Most severe first. Also the order toys and parts are listed in.
SEVERITY = (Exposure.AFFECTED, Exposure.POSSIBLY_AFFECTED, Exposure.NO_FINDING)


@dataclass(frozen=True)
class ToyExposure:
    exposure: Exposure
    parts: dict[int, Exposure]  # part id -> that part's exposure

    @property
    def parts_touched(self) -> int:
        """How many parts have at least one implicated supplier."""
        return sum(1 for e in self.parts.values() if e is not Exposure.NO_FINDING)


def part_exposure(suppliers: Collection[int], implicated: Collection[int]) -> Exposure:
    """Exposure of one part, given the suppliers that can make it.

    `suppliers` may repeat an id (two factories of one supplier): it counts once.
    """
    suppliers = set(suppliers)
    hit = suppliers & set(implicated)
    if not hit:
        return Exposure.NO_FINDING
    if hit == suppliers:
        return Exposure.AFFECTED
    return Exposure.POSSIBLY_AFFECTED


def toy_exposure(parts: Mapping[int, Collection[int]], implicated: Collection[int]) -> ToyExposure:
    """Exposure of one toy. `parts` maps each part id to the suppliers that can make it."""
    implicated = set(implicated)
    per_part = {part_id: part_exposure(suppliers, implicated) for part_id, suppliers in parts.items()}
    worst = min(per_part.values(), key=SEVERITY.index, default=Exposure.NO_FINDING)
    return ToyExposure(exposure=worst, parts=per_part)
