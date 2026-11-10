import sqlite3

from fastapi import APIRouter, Depends

from app import services
from app.auth import CurrentUser, current_user, finisher_db
from app.routers.params import RecordId
from app.schemas import FindingResponse

router = APIRouter(prefix="/api/suppliers/{supplier_id}/finding", tags=["findings"])


@router.put("", response_model=FindingResponse)
def record_finding(
    supplier_id: RecordId,
    user: CurrentUser = Depends(current_user),
    db: sqlite3.Connection = Depends(finisher_db),
):
    """Record a child labor finding against a supplier. Recording twice changes nothing."""
    return services.record_finding(db, supplier_id, user.username)


@router.delete("", response_model=FindingResponse)
def withdraw_finding(supplier_id: RecordId, db: sqlite3.Connection = Depends(finisher_db)):
    """Withdraw the finding. Withdrawing twice changes nothing."""
    return services.withdraw_finding(db, supplier_id)
