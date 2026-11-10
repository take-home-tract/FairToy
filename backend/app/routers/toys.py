import sqlite3

from fastapi import APIRouter, Depends

from app import services
from app.auth import finisher_db
from app.routers.params import RecordId
from app.schemas import ToysResponse, ToyTraceResponse

router = APIRouter(prefix="/api/toys", tags=["toys"])


@router.get("", response_model=ToysResponse)
def list_toys(db: sqlite3.Connection = Depends(finisher_db)):
    """The Finisher's toys with their exposure, plus totals."""
    return services.list_toys(db)


@router.get("/{toy_id}", response_model=ToyTraceResponse)
def toy_trace(toy_id: RecordId, db: sqlite3.Connection = Depends(finisher_db)):
    """One toy: its parts, and every possible source of each part."""
    return services.toy_trace(db, toy_id)
