import sqlite3

from fastapi import APIRouter, Depends

from app import services
from app.auth import finisher_db
from app.routers.params import RecordId
from app.schemas import SupplierDetailResponse, SuppliersResponse

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=SuppliersResponse)
def list_suppliers(db: sqlite3.Connection = Depends(finisher_db)):
    """The Finisher's own suppliers, and whether each has a finding."""
    return services.list_suppliers(db)


@router.get("/{supplier_id}", response_model=SupplierDetailResponse)
def supplier_detail(supplier_id: RecordId, db: sqlite3.Connection = Depends(finisher_db)):
    """One supplier and the toys it reaches: exposure now, and if it were flagged."""
    return services.supplier_detail(db, supplier_id)
