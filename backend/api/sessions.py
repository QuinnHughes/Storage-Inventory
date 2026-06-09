# Placeholder — sessions removed.
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db import crud
from schemas.session import SessionCreate, SessionRead, SessionSummary

router = APIRouter()


@router.post("", response_model=SessionRead, status_code=201)
def create_session(data: SessionCreate, db: Session = Depends(get_db)):
    return crud.create_session(db, data)


@router.get("", response_model=list[SessionSummary])
def list_sessions(db: Session = Depends(get_db)):
    sessions = crud.list_sessions(db)
    result = []
    for s in sessions:
        counts = crud.discrepancy_counts(db, s.id)
        result.append(SessionSummary(
            id=s.id,
            name=s.name,
            description=s.description,
            created_at=s.created_at,
            status=s.status,
            ils_count=s.ils_count,
            scan_count=s.scan_count,
            section_id=s.section_id,
            section_name=s.section.name if s.section else None,
            total_discrepancies=counts["total"],
            open_discrepancies=counts["open"],
            missing_count=counts["missing"],
            ghost_count=counts["ghost"],
            misplaced_count=counts["misplaced"],
            duplicate_count=counts["duplicate"],
        ))
    return result


@router.get("/{session_id}", response_model=SessionSummary)
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    counts = crud.discrepancy_counts(db, s.id)
    return SessionSummary(
        id=s.id,
        name=s.name,
        description=s.description,
        created_at=s.created_at,
        status=s.status,
        ils_count=s.ils_count,
        scan_count=s.scan_count,
        section_id=s.section_id,
        section_name=s.section.name if s.section else None,
        total_discrepancies=counts["total"],
        open_discrepancies=counts["open"],
        missing_count=counts["missing"],
        ghost_count=counts["ghost"],
        misplaced_count=counts["misplaced"],
        duplicate_count=counts["duplicate"],
    )


@router.delete("/{session_id}", status_code=200)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_session(db, session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "deleted_id": session_id}


@router.post("/{session_id}/run-comparison", status_code=200)
def run_comparison(session_id: int, db: Session = Depends(get_db)):
    """
    Run the comparison engine against the already-uploaded ILS and scan data
    for this session.  Existing discrepancies are wiped and replaced.
    If the session has a section assigned, only records within that section's
    call-number range are included in the comparison.
    """
    s = crud.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    if s.status not in ("ils_uploaded", "scan_uploaded", "complete"):
        raise HTTPException(
            status_code=400,
            detail="Both ILS and scan files must be uploaded before running comparison."
        )
    if s.ils_count == 0:
        raise HTTPException(status_code=400, detail="No ILS records found for this session.")
    if s.scan_count == 0:
        raise HTTPException(status_code=400, detail="No scan records found for this session.")

    from core.comparison import run_comparison as _run
    ils_records  = crud.get_ils_records(db, session_id)
    scan_records = crud.get_scan_records(db, session_id)

    # If a section is assigned, filter both record sets to that range
    section_start = None
    section_end   = None
    if s.section_id and s.section:
        section_start = s.section.start_call_number
        section_end   = s.section.end_call_number

    # Clear old discrepancies
    crud.delete_discrepancies(db, session_id)

    discrepancies = _run(
        ils_records, scan_records, session_id,
        section_start=section_start, section_end=section_end,
    )
    inserted = crud.bulk_insert_discrepancies(db, discrepancies)

    crud.update_session_status(db, session_id, "complete")

    counts = crud.discrepancy_counts(db, session_id)
    return {
        "success": True,
        "session_id": session_id,
        "discrepancies_found": inserted,
        "missing_count":   counts["missing"],
        "ghost_count":     counts["ghost"],
        "misplaced_count": counts["misplaced"],
        "duplicate_count": counts["duplicate"],
        "counts": counts,
    }
