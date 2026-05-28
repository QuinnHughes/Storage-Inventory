"""
Scanning API — shelf-reading sessions.

Endpoints
---------
GET    /api/scanning/floors/{floor_id}/scan-status  shelf tree with scan stats

POST   /api/scanning/sessions                  create session
GET    /api/scanning/sessions                  list sessions (paginated)
GET    /api/scanning/sessions/{id}             full session detail
PATCH  /api/scanning/sessions/{id}             update notes / inches / status
DELETE /api/scanning/sessions/{id}             delete session

POST   /api/scanning/sessions/{id}/items       add one scanned barcode (live scan)
DELETE /api/scanning/sessions/{id}/items/{pos} remove item by position (undo)

POST   /api/scanning/sessions/{id}/upload      batch-load barcodes from Excel/CSV
POST   /api/scanning/sessions/{id}/analyze     run analysis engine
"""

import csv
import io
from datetime import datetime, timezone
from typing import Optional

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func as sa_func
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from core.analysis import analyze_session as _run_analysis
from db import crud, models
from db.session import get_db

router = APIRouter()


# ── Location scan-status tree ─────────────────────────────────────────────────

@router.get("/floors/{floor_id}/scan-status")
def get_floor_scan_status(floor_id: int, db: Session = Depends(get_db)):
    """Return Range→Side→Ladder→Shelf tree for a floor, each shelf annotated with scan stats."""
    floor = db.query(models.Floor).filter(models.Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(404, "Floor not found")

    ranges = (
        db.query(models.Range)
        .options(
            joinedload(models.Range.sides)
            .joinedload(models.RangeSide.ladders)
            .joinedload(models.Ladder.shelves)
        )
        .filter(models.Range.floor_id == floor_id)
        .order_by(models.Range.range_number)
        .all()
    )

    shelf_ids = [
        shelf.id
        for rng in ranges
        for side in rng.sides
        for ladder in side.ladders
        for shelf in ladder.shelves
    ]

    stats: dict = {}
    last_status: dict[int, str] = {}
    active_session_map: dict[int, int] = {}

    if shelf_ids:
        stats_rows = (
            db.query(
                models.ScanSession.shelf_id,
                sa_func.count(models.ScanSession.id).label("session_count"),
                sa_func.max(models.ScanSession.created_at).label("last_scanned_at"),
            )
            .filter(models.ScanSession.shelf_id.in_(shelf_ids))
            .group_by(models.ScanSession.shelf_id)
            .all()
        )
        stats = {row.shelf_id: row for row in stats_rows}

        all_sessions = (
            db.query(
                models.ScanSession.shelf_id,
                models.ScanSession.id,
                models.ScanSession.status,
            )
            .filter(models.ScanSession.shelf_id.in_(shelf_ids))
            .order_by(models.ScanSession.shelf_id, models.ScanSession.created_at.desc())
            .all()
        )
        seen: set[int] = set()
        for row in all_sessions:
            if row.shelf_id not in seen:
                seen.add(row.shelf_id)
                last_status[row.shelf_id] = row.status
            if row.status == "scanning" and row.shelf_id not in active_session_map:
                active_session_map[row.shelf_id] = row.id

    ranges_out = []
    for rng in ranges:
        sides_out = []
        for side in sorted(rng.sides, key=lambda s: s.side_letter):
            ladders_out = []
            for ladder in sorted(side.ladders, key=lambda l: l.ladder_number):
                shelves_out = []
                for shelf in sorted(ladder.shelves, key=lambda s: s.shelf_number):
                    st = stats.get(shelf.id)
                    shelves_out.append({
                        "id": shelf.id,
                        "shelf_number": shelf.shelf_number,
                        "session_count": st.session_count if st else 0,
                        "last_scanned_at": st.last_scanned_at.isoformat() if (st and st.last_scanned_at) else None,
                        "last_status": last_status.get(shelf.id),
                        "active_session_id": active_session_map.get(shelf.id),
                    })
                ladders_out.append({
                    "id": ladder.id,
                    "ladder_number": ladder.ladder_number,
                    "shelves": shelves_out,
                })
            sides_out.append({
                "id": side.id,
                "side_letter": side.side_letter,
                "ladders": ladders_out,
            })
        ranges_out.append({
            "id": rng.id,
            "range_number": rng.range_number,
            "material_type": rng.material_type,
            "notes": rng.notes,
            "sides": sides_out,
        })

    return {
        "floor_id": floor.id,
        "display_name": floor.display_name,
        "ranges": ranges_out,
    }


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    shelf_id:       Optional[int]   = None
    location_label: Optional[str]   = None
    notes:          Optional[str]   = None


class SessionPatch(BaseModel):
    location_label:     Optional[str]   = None
    notes:              Optional[str]   = None
    inches_of_material: Optional[float] = None
    status:             Optional[str]   = None


class DiscrepancyOut(BaseModel):
    id:                    int
    scan_item_id:          Optional[int]
    type:                  str
    severity:              str
    detail:                Optional[str]
    expected_position:     Optional[int]
    resolved_at:           Optional[datetime]
    resolution_option_id:  Optional[int]
    resolution_option_name: Optional[str]
    resolution_notes:      Optional[str]

    model_config = {"from_attributes": True}


class ResolutionOptionOut(BaseModel):
    id:          int
    name:        str
    description: Optional[str]
    sort_order:  int

    model_config = {"from_attributes": True}


class ResolutionOptionCreate(BaseModel):
    name:        str
    description: Optional[str] = None
    sort_order:  int = 0


class DiscrepancyResolve(BaseModel):
    option_id: Optional[int] = None
    notes:     Optional[str] = None


class ScanItemOut(BaseModel):
    id:               int
    position:         int
    barcode:          str
    ils_record_id:    Optional[int]
    call_number:      Optional[str]
    call_number_norm: Optional[str]
    title:            Optional[str]
    status:           Optional[str]
    lifecycle:        Optional[str]
    location_code:    Optional[str]
    fulfillment_note: Optional[str]
    discrepancy:      Optional[DiscrepancyOut]

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id:                 int
    shelf_id:           Optional[int]
    location_label:     Optional[str]
    status:             str
    notes:              Optional[str]
    inches_of_material: Optional[float]
    created_at:         datetime
    analyzed_at:        Optional[datetime]
    item_count:         int
    discrepancy_count:  int

    model_config = {"from_attributes": True}


class SessionDetail(SessionOut):
    items:         list[ScanItemOut]
    discrepancies: list[DiscrepancyOut]


class SessionsPage(BaseModel):
    items: list[SessionOut]
    total: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_item(item: models.ScanItem, db: Session) -> None:
    """Look up the ILS record for item.barcode and cache fields on item."""
    rec = (
        db.query(models.IlsRecord)
        .filter(models.IlsRecord.barcode == item.barcode.strip().upper())
        .first()
    )
    if rec:
        item.ils_record_id    = rec.id
        item.call_number      = rec.call_number
        item.call_number_norm = rec.call_number_norm
        item.title            = rec.title
        item.status           = rec.status
        item.lifecycle        = rec.lifecycle
        item.location_code    = rec.location_code
        item.fulfillment_note = rec.fulfillment_note


def _to_out(s: models.ScanSession) -> dict:
    return {
        **{c.name: getattr(s, c.name) for c in s.__table__.columns},
        "item_count":        len(s.items),
        "discrepancy_count": len(s.discrepancies),
    }


def _session_or_404(session_id: int, db: Session) -> models.ScanSession:
    s = (
        db.query(models.ScanSession)
        .options(
            joinedload(models.ScanSession.items)
            .joinedload(models.ScanItem.discrepancy)
            .joinedload(models.ScanDiscrepancy.resolution_option),
            joinedload(models.ScanSession.discrepancies)
            .joinedload(models.ScanDiscrepancy.resolution_option),
        )
        .filter(models.ScanSession.id == session_id)
        .first()
    )
    if not s:
        raise HTTPException(404, "Scan session not found")
    return s


# ── Session CRUD ──────────────────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionDetail, status_code=201)
def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    location_label = body.location_label

    # Auto-build label from shelf hierarchy when shelf_id is provided
    if body.shelf_id and not location_label:
        shelf = (
            db.query(models.Shelf)
            .options(
                joinedload(models.Shelf.ladder)
                .joinedload(models.Ladder.side)
                .joinedload(models.RangeSide.range)
                .joinedload(models.Range.floor)
            )
            .filter(models.Shelf.id == body.shelf_id)
            .first()
        )
        if shelf and shelf.ladder and shelf.ladder.side and shelf.ladder.side.range:
            ladder = shelf.ladder
            side = ladder.side
            rng = side.range
            floor = rng.floor
            location_label = (
                f"{floor.display_name} · Range {rng.range_number}{side.side_letter} · "
                f"Ladder {ladder.ladder_number} · Shelf {shelf.shelf_number}"
            )

    s = models.ScanSession(
        shelf_id=body.shelf_id,
        location_label=location_label,
        notes=body.notes,
        status="scanning",
    )
    db.add(s)
    db.flush()
    db.refresh(s)
    s.items = []
    s.discrepancies = []
    db.commit()
    return {**_to_out(s), "items": [], "discrepancies": []}


@router.get("/sessions", response_model=SessionsPage)
def list_sessions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(models.ScanSession).order_by(models.ScanSession.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * per_page).limit(per_page).all()

    items = []
    for s in rows:
        items.append({
            **{c.name: getattr(s, c.name) for c in s.__table__.columns},
            "item_count":        db.query(models.ScanItem)
                                   .filter(models.ScanItem.session_id == s.id).count(),
            "discrepancy_count": db.query(models.ScanDiscrepancy)
                                   .filter(models.ScanDiscrepancy.session_id == s.id).count(),
        })
    return {"items": items, "total": total}


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = _session_or_404(session_id, db)
    return {
        **_to_out(s),
        "items":        s.items,
        "discrepancies": s.discrepancies,
    }


@router.patch("/sessions/{session_id}", response_model=SessionDetail)
def patch_session(session_id: int, body: SessionPatch, db: Session = Depends(get_db)):
    s = _session_or_404(session_id, db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(s, field, val)
    db.commit()
    db.refresh(s)
    s = _session_or_404(session_id, db)
    return {**_to_out(s), "items": s.items, "discrepancies": s.discrepancies}


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(models.ScanSession).filter(models.ScanSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Scan session not found")
    db.delete(s)
    db.commit()


# ── Scan items ────────────────────────────────────────────────────────────────

class AddItemBody(BaseModel):
    barcode: str


@router.post("/sessions/{session_id}/items", response_model=ScanItemOut, status_code=201)
def add_item(session_id: int, body: AddItemBody, db: Session = Depends(get_db)):
    s = db.query(models.ScanSession).filter(models.ScanSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Scan session not found")
    if s.status not in ("scanning",):
        raise HTTPException(400, "Session is not in scanning mode")

    barcode = body.barcode.strip().upper()
    if not barcode:
        raise HTTPException(400, "Barcode must not be empty")

    # Next position
    last = (
        db.query(models.ScanItem)
        .filter(models.ScanItem.session_id == session_id)
        .order_by(models.ScanItem.position.desc())
        .first()
    )
    position = (last.position + 1) if last else 1

    item = models.ScanItem(session_id=session_id, position=position, barcode=barcode)
    _resolve_item(item, db)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/sessions/{session_id}/items/{position}", status_code=204)
def remove_item(session_id: int, position: int, db: Session = Depends(get_db)):
    item = (
        db.query(models.ScanItem)
        .filter(
            models.ScanItem.session_id == session_id,
            models.ScanItem.position == position,
        )
        .first()
    )
    if not item:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    # Compact positions above the deleted one
    above = (
        db.query(models.ScanItem)
        .filter(
            models.ScanItem.session_id == session_id,
            models.ScanItem.position > position,
        )
        .order_by(models.ScanItem.position)
        .all()
    )
    for it in above:
        it.position -= 1
    db.commit()


# ── Batch upload barcodes from Excel / CSV ────────────────────────────────────

@router.post("/sessions/{session_id}/upload", status_code=200)
async def upload_barcodes(
    session_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    s = db.query(models.ScanSession).filter(models.ScanSession.id == session_id).first()
    if not s:
        raise HTTPException(404, "Scan session not found")
    if s.status not in ("scanning",):
        raise HTTPException(400, "Session is not in scanning mode")

    content = await file.read()
    name = (file.filename or "").lower()
    barcodes: list[str] = []

    if name.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            # Accept header named "barcode", "Barcode", "BARCODE", etc.
            bc = next(
                (v.strip() for k, v in row.items() if k.strip().lower() == "barcode"),
                "",
            )
            if bc:
                barcodes.append(bc.upper())
    elif name.endswith((".xlsx", ".xls")):
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        header_row = None
        bc_col = None
        for r_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if header_row is None:
                # Find the column whose header is "barcode"
                for c_idx, cell in enumerate(row):
                    if cell and str(cell).strip().lower() == "barcode":
                        bc_col = c_idx
                        header_row = r_idx
                        break
                continue
            if bc_col is not None and row[bc_col] is not None:
                barcodes.append(str(row[bc_col]).strip().upper())
        wb.close()
    else:
        raise HTTPException(400, "Unsupported file type (.csv, .xlsx, .xls only)")

    if not barcodes:
        raise HTTPException(400, "No barcodes found. Ensure the file has a 'Barcode' column header.")

    # Clear any existing items for this session (replace mode)
    db.query(models.ScanItem).filter(models.ScanItem.session_id == session_id).delete()

    for pos, barcode in enumerate(barcodes, start=1):
        item = models.ScanItem(session_id=session_id, position=pos, barcode=barcode)
        _resolve_item(item, db)
        db.add(item)

    db.commit()
    return {"loaded": len(barcodes)}


# ── Analysis ──────────────────────────────────────────────────────────────────

class AnalyzeBody(BaseModel):
    location_code: Optional[str] = None


@router.post("/sessions/{session_id}/analyze", response_model=SessionDetail)
def analyze(session_id: int, body: AnalyzeBody, db: Session = Depends(get_db)):
    s = _session_or_404(session_id, db)
    if not s.items:
        raise HTTPException(400, "Session has no scanned items to analyse")

    # Clear old discrepancies
    db.query(models.ScanDiscrepancy).filter(
        models.ScanDiscrepancy.session_id == session_id
    ).delete()
    db.flush()

    # Re-resolve ILS records in case data changed since scan
    for item in s.items:
        _resolve_item(item, db)
    db.flush()

    discs = _run_analysis(s, location_code=body.location_code)
    for d in discs:
        db.add(d)

    s.status      = "analyzed"
    s.analyzed_at = datetime.now(tz=timezone.utc)
    db.commit()

    s = _session_or_404(session_id, db)
    return {**_to_out(s), "items": s.items, "discrepancies": s.discrepancies}


# ── Resolution options ────────────────────────────────────────────────────────

@router.get("/resolution-options", response_model=list[ResolutionOptionOut])
def list_resolution_options(db: Session = Depends(get_db)):
    return crud.list_resolution_options(db)


@router.post("/resolution-options", response_model=ResolutionOptionOut, status_code=201)
def create_resolution_option(body: ResolutionOptionCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Name must not be empty")
    return crud.create_resolution_option(db, name, body.description, body.sort_order)


@router.delete("/resolution-options/{option_id}", status_code=204)
def delete_resolution_option(option_id: int, db: Session = Depends(get_db)):
    if not crud.delete_resolution_option(db, option_id):
        raise HTTPException(404, "Resolution option not found")


# ── Discrepancy resolution ─────────────────────────────────────────────────────

@router.patch("/sessions/{session_id}/discrepancies/{disc_id}", response_model=DiscrepancyOut)
def resolve_discrepancy(session_id: int, disc_id: int, body: DiscrepancyResolve, db: Session = Depends(get_db)):
    if not db.query(models.ScanSession).filter(models.ScanSession.id == session_id).first():
        raise HTTPException(404, "Scan session not found")
    disc = crud.resolve_discrepancy(db, disc_id, body.option_id, body.notes)
    if not disc:
        raise HTTPException(404, "Discrepancy not found")
    return disc
