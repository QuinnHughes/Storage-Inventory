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
from core.callnumber import normalize_storage
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

    if floor.facility == "morgan":
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

        side_ids = [
            side.id
            for rng in ranges
            for side in rng.sides
        ]

        stats: dict = {}
        last_status: dict[int, str] = {}
        active_session_map: dict[int, int] = {}

        if side_ids:
            stats_rows = (
                db.query(
                    models.ScanSession.range_side_id,
                    sa_func.count(models.ScanSession.id).label("session_count"),
                    sa_func.max(models.ScanSession.created_at).label("last_scanned_at"),
                )
                .filter(models.ScanSession.range_side_id.in_(side_ids))
                .group_by(models.ScanSession.range_side_id)
                .all()
            )
            stats = {row.range_side_id: row for row in stats_rows}

            all_sessions = (
                db.query(
                    models.ScanSession.range_side_id,
                    models.ScanSession.id,
                    models.ScanSession.status,
                )
                .filter(models.ScanSession.range_side_id.in_(side_ids))
                .order_by(models.ScanSession.range_side_id, models.ScanSession.created_at.desc())
                .all()
            )
            last_session_map: dict[int, int] = {}
            seen: set[int] = set()
            for row in all_sessions:
                if row.range_side_id not in seen:
                    seen.add(row.range_side_id)
                    last_status[row.range_side_id] = row.status
                    last_session_map[row.range_side_id] = row.id
                if row.status == "scanning" and row.range_side_id not in active_session_map:
                    active_session_map[row.range_side_id] = row.id

        ranges_out = []
        for rng in ranges:
            codes = [c.strip() for c in (rng.location_codes or "").split(",") if c.strip()]
            sides_out = []
            for side in sorted(rng.sides, key=lambda s: s.side_letter):
                st = stats.get(side.id)
                ladders_out = []
                for ladder in sorted(side.ladders, key=lambda l: l.ladder_number):
                    shelves_out = []
                    for shelf in sorted(ladder.shelves, key=lambda s: s.shelf_number):
                        shelves_out.append({
                            "id": shelf.id,
                            "side_id": side.id,
                            "shelf_number": shelf.shelf_number,
                            "session_count": st.session_count if st else 0,
                            "last_scanned_at": st.last_scanned_at.isoformat() if (st and st.last_scanned_at) else None,
                            "last_status": last_status.get(side.id),
                            "active_session_id": active_session_map.get(side.id),
                            "last_session_id": last_session_map.get(side.id),
                        })
                    ladders_out.append({
                        "id": ladder.id,
                        "ladder_number": ladder.ladder_number,
                        "shelves": shelves_out,
                    })
                sides_out.append({
                    "id": side.id,
                    "side_letter": side.side_letter,
                    "session_count": st.session_count if st else 0,
                    "last_scanned_at": st.last_scanned_at.isoformat() if (st and st.last_scanned_at) else None,
                    "last_status": last_status.get(side.id),
                    "active_session_id": active_session_map.get(side.id),
                    "last_session_id": last_session_map.get(side.id),
                    "ladders": ladders_out,
                })
            ranges_out.append({
                "id": rng.id,
                "range_number": rng.range_number,
                "material_type": rng.material_type,
                "notes": rng.notes,
                "location_codes": codes,
                "sides": sides_out,
            })

        return {
            "floor_id": floor.id,
            "display_name": floor.display_name,
            "ranges": ranges_out,
        }

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
        last_session_map: dict[int, int] = {}
        seen: set[int] = set()
        for row in all_sessions:
            if row.shelf_id not in seen:
                seen.add(row.shelf_id)
                last_status[row.shelf_id] = row.status
                last_session_map[row.shelf_id] = row.id
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
                        "last_session_id": last_session_map.get(shelf.id),
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
    range_side_id:  Optional[int]   = None
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


class LocationInfo(BaseModel):
    floor_id:           int
    floor_display_name: str
    range_id:           int
    range_number:       str
    side_id:            int
    side_letter:        str
    location_codes:     list[str]


class SessionOut(BaseModel):
    id:                 int
    shelf_id:           Optional[int]
    range_side_id:      Optional[int]
    location_label:     Optional[str]
    status:             str
    notes:              Optional[str]
    inches_of_material: Optional[float]
    created_at:         datetime
    analyzed_at:        Optional[datetime]
    item_count:         int
    discrepancy_count:  int
    location:           Optional[LocationInfo] = None

    model_config = {"from_attributes": True}


class SessionDetail(SessionOut):
    items:         list[ScanItemOut]
    discrepancies: list[DiscrepancyOut]


class SessionsPage(BaseModel):
    items: list[SessionOut]
    total: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session_facility(session_id: int, db: Session) -> str:
    """Return 'storage' or 'morgan' for a session by tracing its shelf → floor."""
    facility = (
        db.query(models.Floor.facility)
        .join(models.Range,     models.Range.floor_id       == models.Floor.id)
        .join(models.RangeSide, models.RangeSide.range_id   == models.Range.id)
        .join(models.Ladder,    models.Ladder.range_side_id == models.RangeSide.id)
        .join(models.Shelf,     models.Shelf.ladder_id      == models.Ladder.id)
        .join(models.ScanSession, models.ScanSession.shelf_id == models.Shelf.id)
        .filter(models.ScanSession.id == session_id)
        .scalar()
    )
    return facility or "morgan"


def _resolve_item(item: models.ScanItem, db: Session, facility: str = "morgan") -> None:
    """Look up the ILS record for item.barcode and cache fields on item.

    For storage sessions the storage call number lives in item_call_number
    (the S-{floor}-{range}-{ladder}-{shelf}-{item} field from Alma), so we
    use that instead of the LC call_number.
    """
    rec = (
        db.query(models.IlsRecord)
        .filter(models.IlsRecord.barcode == item.barcode.strip().upper())
        .first()
    )
    if rec:
        item.ils_record_id    = rec.id
        item.title            = rec.title
        item.status           = rec.status
        item.lifecycle        = rec.lifecycle
        item.location_code    = rec.location_code
        item.fulfillment_note = rec.fulfillment_note
        if facility == "storage":
            item.call_number      = rec.item_call_number
            item.call_number_norm = (
                normalize_storage(rec.item_call_number) if rec.item_call_number else None
            )
        else:
            item.call_number      = rec.call_number
            item.call_number_norm = rec.call_number_norm


def _get_location_info(s: models.ScanSession) -> Optional[dict]:
    """Build a LocationInfo dict by walking the range_side → range → floor chain."""
    if not s.range_side_id:
        return None
    try:
        side = s.range_side
        if side is None:
            return None
        rng = side.range
        floor = rng.floor
        codes = [c.strip() for c in (rng.location_codes or "").split(",") if c.strip()]
        return {
            "floor_id":           floor.id,
            "floor_display_name": floor.display_name,
            "range_id":           rng.id,
            "range_number":       rng.range_number,
            "side_id":            side.id,
            "side_letter":        side.side_letter,
            "location_codes":     codes,
        }
    except Exception:
        return None


def _to_out(s: models.ScanSession) -> dict:
    return {
        **{c.name: getattr(s, c.name) for c in s.__table__.columns},
        "item_count":        len(s.items),
        "discrepancy_count": len(s.discrepancies),
        "location":          _get_location_info(s),
    }


def _session_or_404(session_id: int, db: Session) -> models.ScanSession:
    s = (
        db.query(models.ScanSession)
        .options(
            joinedload(models.ScanSession.items)
            .joinedload(models.ScanItem.discrepancy),
            joinedload(models.ScanSession.discrepancies),
            joinedload(models.ScanSession.range_side)
            .joinedload(models.RangeSide.range)
            .joinedload(models.Range.floor),
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
    # Auto-generate a location_label when a range_side_id is provided
    location_label = body.location_label
    if body.range_side_id and not location_label:
        side = (
            db.query(models.RangeSide)
            .options(
                joinedload(models.RangeSide.range)
                .joinedload(models.Range.floor)
            )
            .filter(models.RangeSide.id == body.range_side_id)
            .first()
        )
        if side:
            rng = side.range
            floor = rng.floor
            location_label = f"{floor.display_name} · Range {rng.range_number} · Side {side.side_letter}"

    s = models.ScanSession(
        shelf_id=body.shelf_id,
        range_side_id=body.range_side_id,
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
    s = _session_or_404(s.id, db)
    return {**_to_out(s), "items": [], "discrepancies": []}


@router.get("/sessions", response_model=SessionsPage)
def list_sessions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    # Count without joins to avoid inflated row counts
    total = db.query(models.ScanSession).count()
    rows = (
        db.query(models.ScanSession)
        .options(
            joinedload(models.ScanSession.range_side)
            .joinedload(models.RangeSide.range)
            .joinedload(models.Range.floor)
        )
        .order_by(models.ScanSession.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for s in rows:
        items.append({
            **{c.name: getattr(s, c.name) for c in s.__table__.columns},
            "item_count":        db.query(models.ScanItem)
                                   .filter(models.ScanItem.session_id == s.id).count(),
            "discrepancy_count": db.query(models.ScanDiscrepancy)
                                   .filter(models.ScanDiscrepancy.session_id == s.id).count(),
            "location":          _get_location_info(s),
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

    facility = _get_session_facility(session_id, db)

    # Next position
    last = (
        db.query(models.ScanItem)
        .filter(models.ScanItem.session_id == session_id)
        .order_by(models.ScanItem.position.desc())
        .first()
    )
    position = (last.position + 1) if last else 1

    item = models.ScanItem(session_id=session_id, position=position, barcode=barcode)
    _resolve_item(item, db, facility=facility)
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

    facility = _get_session_facility(session_id, db)

    for pos, barcode in enumerate(barcodes, start=1):
        item = models.ScanItem(session_id=session_id, position=pos, barcode=barcode)
        _resolve_item(item, db, facility=facility)
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

    # Auto-detect facility so storage sessions use the storage call number
    facility         = _get_session_facility(session_id, db)
    call_number_type = "storage" if facility == "storage" else "lc"

    # Re-resolve ILS records in case data changed since scan
    for item in s.items:
        _resolve_item(item, db, facility=facility)
    db.flush()

    # Auto-detect location_code from the linked range side when not explicitly supplied
    location_code = body.location_code
    if not location_code and s.range_side_id:
        loc = _get_location_info(s)
        if loc and len(loc["location_codes"]) == 1:
            location_code = loc["location_codes"][0]

    discs = _run_analysis(s, location_code=location_code)
    for d in discs:
        db.add(d)

    # ── Not-on-shelf detection (storage only) ─────────────────────────────────
    # Find ILS records that should be on this shelf (by item_call_number prefix)
    # but whose barcode was never scanned in this session.
    if facility == "storage" and s.shelf_id:
        shelf_obj = (
            db.query(models.Shelf)
            .options(
                joinedload(models.Shelf.ladder)
                .joinedload(models.Ladder.side)
                .joinedload(models.RangeSide.range)
                .joinedload(models.Range.floor)
            )
            .filter(models.Shelf.id == s.shelf_id)
            .first()
        )
        if (
            shelf_obj and shelf_obj.ladder and shelf_obj.ladder.side
            and shelf_obj.ladder.side.range and shelf_obj.ladder.side.range.floor
        ):
            ladder = shelf_obj.ladder
            side   = ladder.side
            rng    = side.range
            floor  = rng.floor
            # S-{floor_code}-{range_number}{side_letter}-{ladder_number}-{shelf_number}-
            cn_prefix = (
                f"S-{floor.code}-{rng.range_number}{side.side_letter}"
                f"-{ladder.ladder_number}-{shelf_obj.shelf_number}-"
            ).upper()

            expected_recs = (
                db.query(models.IlsRecord)
                .filter(
                    sa_func.upper(models.IlsRecord.item_call_number).like(cn_prefix + "%"),
                    sa_func.upper(models.IlsRecord.status) == "ITEM IN PLACE",
                    sa_func.upper(models.IlsRecord.lifecycle) == "ACTIVE",
                )
                .all()
            )

            scanned_barcodes = {
                it.barcode.strip().upper() for it in s.items if it.barcode
            }

            for rec in expected_recs:
                if rec.barcode.strip().upper() not in scanned_barcodes:
                    db.add(models.ScanDiscrepancy(
                        session_id=session_id,
                        scan_item_id=None,
                        type="not_on_shelf",
                        severity="warning",
                        detail=(
                            f"Barcode {rec.barcode!r} \u2014 "
                            f"{rec.title or 'Unknown title'} "
                            f"[{rec.item_call_number}] is recorded as "
                            f"\u2018Item in place\u2019 / Active but was not "
                            f"scanned on this shelf."
                        ),
                    ))

    s.analyzed_at = datetime.now(tz=timezone.utc)
    db.commit()

    s = _session_or_404(session_id, db)
    return {**_to_out(s), "items": s.items, "discrepancies": s.discrepancies}


# ── Morgan Inventory Overview ─────────────────────────────────────────────────

def _make_empty_stats() -> dict:
    return {
        "shelves_total":          0,
        "shelves_done":           0,
        "coverage_pct":           0.0,
        "inches_measured":        0.0,
        "last_inventoried":       None,
        "discrepancies_total":    0,
        "discrepancies_resolved": 0,
        "resolution_pct":         0.0,
        "by_severity": {"error": 0, "warning": 0, "info": 0},
        "by_type": {
            "no_record": 0, "out_of_order": 0, "wrong_location": 0,
            "status_issue": 0, "fulfillment_note": 0, "deleted_on_shelf": 0,
            "not_on_shelf": 0,
        },
    }


@router.get("/morgan-overview")
def morgan_overview(db: Session = Depends(get_db)):
    """Aggregate coverage, measurement, and discrepancy stats for all Morgan shelves,
    broken down by Alma location code."""

    # 1 ─ Physical structure
    floor_ids = [
        row[0] for row in
        db.query(models.Floor.id).filter(models.Floor.facility == "morgan").all()
    ]
    if not floor_ids:
        return {"summary": _make_empty_stats(), "locations": []}

    ranges = (
        db.query(models.Range)
        .options(
            joinedload(models.Range.sides)
            .joinedload(models.RangeSide.ladders)
            .joinedload(models.Ladder.shelves)
        )
        .filter(models.Range.floor_id.in_(floor_ids))
        .all()
    )

    # shelf_id → list of location codes ("__uncategorized__" when none set)
    shelf_loc_map: dict[int, list[str]] = {}
    for rng in ranges:
        raw = rng.location_codes or ""
        codes = [c.strip() for c in raw.split(",") if c.strip()] or ["__uncategorized__"]
        for side in rng.sides:
            for ladder in side.ladders:
                for shelf in ladder.shelves:
                    shelf_loc_map[shelf.id] = codes

    all_shelf_ids = list(shelf_loc_map.keys())
    if not all_shelf_ids:
        return {"summary": _make_empty_stats(), "locations": []}

    # 2 ─ Sessions + discrepancies (eager-loaded to avoid N+1)
    sessions = (
        db.query(models.ScanSession)
        .filter(models.ScanSession.shelf_id.in_(all_shelf_ids))
        .options(joinedload(models.ScanSession.discrepancies))
        .all()
    )

    # Shelves that have at least one complete session
    complete_shelf_ids: set[int] = set()
    for s in sessions:
        if s.shelf_id and s.status == "complete":
            complete_shelf_ids.add(s.shelf_id)

    # 3 ─ Known Morgan locations (for display names and tab ordering)
    morgan_locs = (
        db.query(models.Location)
        .join(models.Collection)
        .filter(models.Collection.name == "Morgan")
        .order_by(models.Location.code)
        .all()
    )
    loc_display: dict[str, str] = {loc.code: loc.display_name for loc in morgan_locs}

    all_codes_in_ranges: set[str] = set()
    for codes in shelf_loc_map.values():
        all_codes_in_ranges.update(codes)

    # 4 ─ Aggregate helper
    _VALID_TYPES = {
        "no_record", "out_of_order", "wrong_location",
        "status_issue", "fulfillment_note", "deleted_on_shelf",
    }

    def aggregate(target_codes):
        if target_codes is None:
            in_scope = set(all_shelf_ids)
        else:
            in_scope = {
                sid for sid, codes in shelf_loc_map.items()
                if any(c in target_codes for c in codes)
            }

        shelves_total = len(in_scope)
        shelves_done  = len(in_scope & complete_shelf_ids)
        coverage_pct  = round(100 * shelves_done / shelves_total, 1) if shelves_total else 0.0

        inches_total     = 0.0
        last_inventoried = None
        disc_total       = 0
        disc_resolved    = 0
        by_severity      = {"error": 0, "warning": 0, "info": 0}
        by_type          = {t: 0 for t in _VALID_TYPES}

        for s in sessions:
            if not s.shelf_id or s.shelf_id not in in_scope:
                continue
            if s.status == "complete" and s.inches_of_material:
                inches_total += float(s.inches_of_material)
            if s.analyzed_at and s.status in ("analyzed", "complete"):
                if last_inventoried is None or s.analyzed_at > last_inventoried:
                    last_inventoried = s.analyzed_at
            for d in s.discrepancies:
                disc_total += 1
                if d.resolved_at:
                    disc_resolved += 1
                sev = d.severity if d.severity in by_severity else "info"
                by_severity[sev] += 1
                if d.type in by_type:
                    by_type[d.type] += 1

        resolution_pct = round(100 * disc_resolved / disc_total, 1) if disc_total else 0.0

        return {
            "shelves_total":          shelves_total,
            "shelves_done":           shelves_done,
            "coverage_pct":           coverage_pct,
            "inches_measured":        round(inches_total, 2),
            "last_inventoried":       last_inventoried.isoformat() if last_inventoried else None,
            "discrepancies_total":    disc_total,
            "discrepancies_resolved": disc_resolved,
            "resolution_pct":         resolution_pct,
            "by_severity":            by_severity,
            "by_type":                by_type,
        }

    # 5 ─ Build per-location list
    known_codes   = [loc.code for loc in morgan_locs]
    unknown_codes = sorted(
        c for c in all_codes_in_ranges
        if c != "__uncategorized__" and c not in loc_display
    )
    has_uncategorized = "__uncategorized__" in all_codes_in_ranges

    locations_out = []
    for code in known_codes + unknown_codes:
        locations_out.append({
            "code":         code,
            "display_name": loc_display.get(code, code),
            **aggregate({code}),
        })
    if has_uncategorized:
        locations_out.append({
            "code":         "__uncategorized__",
            "display_name": "Uncategorized",
            **aggregate({"__uncategorized__"}),
        })

    return {
        "summary":   aggregate(None),
        "locations": locations_out,
    }


# ── Storage Inventory Overview ────────────────────────────────────────────────

@router.get("/storage-overview")
def storage_overview(db: Session = Depends(get_db)):
    """Aggregate coverage, measurement, and discrepancy stats for all Storage shelves,
    broken down by Alma location code."""

    floor_ids = [
        row[0] for row in
        db.query(models.Floor.id).filter(models.Floor.facility == "storage").all()
    ]
    if not floor_ids:
        return {"summary": _make_empty_stats(), "locations": []}

    ranges = (
        db.query(models.Range)
        .options(
            joinedload(models.Range.sides)
            .joinedload(models.RangeSide.ladders)
            .joinedload(models.Ladder.shelves)
        )
        .filter(models.Range.floor_id.in_(floor_ids))
        .all()
    )

    shelf_loc_map: dict[int, list[str]] = {}
    for rng in ranges:
        raw = rng.location_codes or ""
        codes = [c.strip() for c in raw.split(",") if c.strip()] or ["__uncategorized__"]
        for side in rng.sides:
            for ladder in side.ladders:
                for shelf in ladder.shelves:
                    shelf_loc_map[shelf.id] = codes

    all_shelf_ids = list(shelf_loc_map.keys())
    if not all_shelf_ids:
        return {"summary": _make_empty_stats(), "locations": []}

    sessions = (
        db.query(models.ScanSession)
        .filter(models.ScanSession.shelf_id.in_(all_shelf_ids))
        .options(joinedload(models.ScanSession.discrepancies))
        .all()
    )

    complete_shelf_ids: set[int] = set()
    for s in sessions:
        if s.shelf_id and s.status == "complete":
            complete_shelf_ids.add(s.shelf_id)

    storage_locs = (
        db.query(models.Location)
        .join(models.Collection)
        .filter(models.Collection.name == "Storage")
        .order_by(models.Location.code)
        .all()
    )
    loc_display: dict[str, str] = {loc.code: loc.display_name for loc in storage_locs}

    all_codes_in_ranges: set[str] = set()
    for codes in shelf_loc_map.values():
        all_codes_in_ranges.update(codes)

    _VALID_TYPES = {
        "no_record", "out_of_order", "wrong_location",
        "status_issue", "fulfillment_note", "deleted_on_shelf",
        "not_on_shelf",
    }

    def aggregate(target_codes):
        in_scope = set(all_shelf_ids) if target_codes is None else {
            sid for sid, codes in shelf_loc_map.items()
            if any(c in target_codes for c in codes)
        }
        shelves_total = len(in_scope)
        shelves_done  = len(in_scope & complete_shelf_ids)
        coverage_pct  = round(100 * shelves_done / shelves_total, 1) if shelves_total else 0.0
        inches_total     = 0.0
        last_inventoried = None
        disc_total       = 0
        disc_resolved    = 0
        by_severity      = {"error": 0, "warning": 0, "info": 0}
        by_type          = {t: 0 for t in _VALID_TYPES}
        for s in sessions:
            if not s.shelf_id or s.shelf_id not in in_scope:
                continue
            if s.status == "complete" and s.inches_of_material:
                inches_total += float(s.inches_of_material)
            if s.analyzed_at and s.status in ("analyzed", "complete"):
                if last_inventoried is None or s.analyzed_at > last_inventoried:
                    last_inventoried = s.analyzed_at
            for d in s.discrepancies:
                disc_total += 1
                if d.resolved_at:
                    disc_resolved += 1
                sev = d.severity if d.severity in by_severity else "info"
                by_severity[sev] += 1
                if d.type in by_type:
                    by_type[d.type] += 1
        resolution_pct = round(100 * disc_resolved / disc_total, 1) if disc_total else 0.0
        return {
            "shelves_total":          shelves_total,
            "shelves_done":           shelves_done,
            "coverage_pct":           coverage_pct,
            "inches_measured":        round(inches_total, 2),
            "last_inventoried":       last_inventoried.isoformat() if last_inventoried else None,
            "discrepancies_total":    disc_total,
            "discrepancies_resolved": disc_resolved,
            "resolution_pct":         resolution_pct,
            "by_severity":            by_severity,
            "by_type":                by_type,
        }

    known_codes   = [loc.code for loc in storage_locs]
    unknown_codes = sorted(
        c for c in all_codes_in_ranges
        if c != "__uncategorized__" and c not in loc_display
    )
    has_uncategorized = "__uncategorized__" in all_codes_in_ranges

    locations_out = []
    for code in known_codes + unknown_codes:
        locations_out.append({
            "code":         code,
            "display_name": loc_display.get(code, code),
            **aggregate({code}),
        })
    if has_uncategorized:
        locations_out.append({
            "code":         "__uncategorized__",
            "display_name": "Uncategorized",
            **aggregate({"__uncategorized__"}),
        })

    return {"summary": aggregate(None), "locations": locations_out}


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
