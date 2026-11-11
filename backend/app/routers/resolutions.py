import sqlite3

from fastapi import APIRouter, Depends

from app import services
from app.auth import CurrentUser, current_user, finisher_db
from app.routers.params import RecordId
from app.schemas import ResolutionRequest, ResolutionResponse

router = APIRouter(prefix="/api/toys/{toy_id}/parts/{part_id}/resolution", tags=["resolutions"])


@router.put("", response_model=ResolutionResponse)
def record_resolution(
    toy_id: RecordId,
    part_id: RecordId,
    body: ResolutionRequest,
    user: CurrentUser = Depends(current_user),
    db: sqlite3.Connection = Depends(finisher_db),
):
    """Record which supplier actually made this part of this toy, for example from purchase records."""
    return services.record_resolution(db, toy_id, part_id, body.supplier_id, user.username)


@router.delete("", response_model=ResolutionResponse)
def withdraw_resolution(toy_id: RecordId, part_id: RecordId, db: sqlite3.Connection = Depends(finisher_db)):
    """Withdraw the resolution. Withdrawing twice changes nothing."""
    return services.withdraw_resolution(db, toy_id, part_id)
