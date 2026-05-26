"""
Analytics API – upload Alma analytics exports and search/edit ILS records.

Accepts CSV and Excel (.xlsx / .xls) files.
All records land in the central ils_records table, routed by location_code.
Re-uploading the same file is safe: rows are upserted by barcode (normalised
to uppercase).
"""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from db import models
from db.session import get_db
from core.callnumber import normalize_lc

router = APIRouter()


# ── Column-name normalisation ─────────────────────────────────────────────────
# Maps normalised CSV/Excel header text → IlsRecord field name.
# First match wins when a header appears more than once (e.g. duplicate
# "Permanent Call Number" column in Alma exports).
_COL_MAP: dict[str, str] = {
    "title":                  "title",
    "location code":          "location_code",
    "location name":          "location_name",
    "item policy":            "item_policy",
    "permanent call number":  "call_number",
    "call number":            "call_number",
    "description":            "description",
    "item call number":       "item_call_number",
    "barcode":                "barcode",
    "lifecycle":              "lifecycle",
    "fulfillment note":       "fulfillment_note",
    "base status":            "status",
    "status":                 "status",
    "author":                 "author",
}


def _norm(header: str) -> str:
    return header.strip().lower()


def _map_headers(headers: list[str]) -> dict[int, str]:
    """Return {col_index: field_name}, skipping duplicate field mappings."""
    seen: set[str] = set()
    mapping: dict[int, str] = {}
    for i, h in enumerate(headers):
        field = _COL_MAP.get(_norm(h))
        if field and field not in seen:
            mapping[i] = field
            seen.add(field)
    return mapping


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    headers = next(reader, None)
    if not headers:
        return []
    col_map = _map_headers(headers)
    rows = []
    for raw in reader:
        row: dict[str, str] = {}
        for idx, field in col_map.items():
            if idx < len(raw):
                row[field] = raw[idx]
        rows.append(row)
    return rows


def _parse_excel(content: bytes) -> list[dict]:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            422,
            "openpyxl is required for Excel files. "
            "Install it with: pip install openpyxl",
        )
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    raw_headers = next(rows_iter, [])
    headers = [str(c).strip() if c is not None else "" for c in raw_headers]
    col_map = _map_headers(headers)
    rows = []
    for raw in rows_iter:
        row: dict[str, str] = {}
        for idx, field in col_map.items():
            if idx < len(raw):
                val = raw[idx]
                row[field] = str(val).strip() if val is not None else ""
        rows.append(row)
    wb.close()
    return rows


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class UploadResult(BaseModel):
    created: int
    updated: int
    skipped: int
    unknown_codes: list[str]


class RecordOut(BaseModel):
    id: int
    barcode: str
    title: Optional[str]
    call_number: Optional[str]
    item_call_number: Optional[str]
    item_policy: Optional[str]
    description: Optional[str]
    author: Optional[str]
    status: Optional[str]
    lifecycle: Optional[str]
    location_code: Optional[str]
    location_name: Optional[str]
    fulfillment_note: Optional[str]
    location_id: int
    uploaded_at: Optional[datetime]

    model_config = {"from_attributes": True}


class RecordsPage(BaseModel):
    items: list[RecordOut]
    total: int
    page: int
    per_page: int


class RecordUpdate(BaseModel):
    title: Optional[str] = None
    call_number: Optional[str] = None
    item_call_number: Optional[str] = None
    item_policy: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    status: Optional[str] = None
    lifecycle: Optional[str] = None
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    fulfillment_note: Optional[str] = None


class MetaOut(BaseModel):
    location_codes: list[str]
    statuses: list[str]
    lifecycles: list[str]
    collections: list[dict]


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResult)
async def upload_analytics(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    name = (file.filename or "").lower()

    if name.endswith(".csv"):
        rows = _parse_csv(content)
    elif name.endswith((".xlsx", ".xls")):
        rows = _parse_excel(content)
    else:
        raise HTTPException(
            400, "Unsupported file type. Upload a .csv or .xlsx / .xls file."
        )

    # Build case-insensitive location code → location_id lookup
    loc_lookup: dict[str, int] = {
        loc.code.lower(): loc.id
        for loc in db.query(models.Location).all()
    }

    created = updated = skipped = 0
    unknown_codes: set[str] = set()
    BATCH_SIZE = 500

    # ── Pass 1: validate rows and collect barcodes ────────────────────────────
    valid: list[tuple[str, int, str, dict]] = []   # (barcode, location_id, raw_code, row)

    def v(row: dict, key: str) -> Optional[str]:
        val = row.get(key, "").strip()
        return val if val else None

    for row in rows:
        barcode = row.get("barcode", "").strip().upper()
        if not barcode:
            skipped += 1
            continue

        loc_code_raw = row.get("location_code", "").strip()
        location_id = loc_lookup.get(loc_code_raw.lower())
        if location_id is None:
            unknown_codes.add(loc_code_raw or "(empty)")
            skipped += 1
            continue

        valid.append((barcode, location_id, loc_code_raw, row))

    # Deduplicate by barcode: if the same barcode appears more than once in the
    # file, keep only the last occurrence (last-wins matches Alma re-export behaviour).
    seen_idx: dict[str, int] = {}
    for i, (barcode, *_) in enumerate(valid):
        seen_idx[barcode] = i
    valid = [valid[i] for i in sorted(seen_idx.values())]

    # ── Pass 2: pre-fetch all matching barcodes in ONE query ──────────────────
    incoming_barcodes = {b for b, *_ in valid}
    existing_map: dict[str, models.IlsRecord] = {}
    if incoming_barcodes:
        # chunk IN clause to stay safe on very large files
        chunk_size = 2000
        bc_list = list(incoming_barcodes)
        for i in range(0, len(bc_list), chunk_size):
            chunk = bc_list[i : i + chunk_size]
            for rec in (
                db.query(models.IlsRecord)
                .filter(func.upper(models.IlsRecord.barcode).in_(chunk))
                .all()
            ):
                existing_map[rec.barcode.upper()] = rec

    # ── Pass 3: upsert in batches ─────────────────────────────────────────────
    try:
        for idx, (barcode, location_id, loc_code_raw, row) in enumerate(valid):
            raw_cn = v(row, "call_number")
            fields = {
                "location_id":      location_id,
                "barcode":          barcode,
                "call_number":      raw_cn,
                "call_number_norm": normalize_lc(raw_cn) if raw_cn else None,
                "item_call_number": v(row, "item_call_number"),
                "item_policy":      v(row, "item_policy"),
                "description":      v(row, "description"),
                "title":            v(row, "title"),
                "author":           v(row, "author"),
                "status":           v(row, "status"),
                "lifecycle":        v(row, "lifecycle"),
                "location_code":    loc_code_raw or None,
                "location_name":    v(row, "location_name"),
                "fulfillment_note": v(row, "fulfillment_note"),
            }

            existing = existing_map.get(barcode)
            if existing:
                for k, val in fields.items():
                    setattr(existing, k, val)
                updated += 1
            else:
                db.add(models.IlsRecord(**fields))
                created += 1

            # Flush every BATCH_SIZE rows so memory stays bounded
            if (idx + 1) % BATCH_SIZE == 0:
                db.flush()

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, f"Database error during import: {exc}")

    return UploadResult(
        created=created,
        updated=updated,
        skipped=skipped,
        unknown_codes=sorted(unknown_codes),
    )


# ── Meta (filter options) ─────────────────────────────────────────────────────

@router.get("/meta", response_model=MetaOut)
def get_meta(db: Session = Depends(get_db)):
    """Return distinct filter values present in the database for populating dropdowns."""

    def distinct_vals(col) -> list[str]:
        return sorted(
            r[0]
            for r in db.query(col).filter(col.isnot(None)).distinct().all()
            if r[0]
        )

    collections = [
        {"id": c.id, "name": c.name}
        for c in db.query(models.Collection).order_by(models.Collection.name).all()
    ]

    return MetaOut(
        location_codes=distinct_vals(models.IlsRecord.location_code),
        statuses=distinct_vals(models.IlsRecord.status),
        lifecycles=distinct_vals(models.IlsRecord.lifecycle),
        collections=collections,
    )


# ── Records ───────────────────────────────────────────────────────────────────

@router.get("/records", response_model=RecordsPage)
def search_records(
    q: str = Query(""),
    location_code: str = Query(""),
    collection_id: Optional[int] = Query(None),
    status: str = Query(""),
    lifecycle: str = Query(""),
    hide_deleted: bool = Query(True),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(models.IlsRecord)

    # Exclude lifecycle=Deleted by default unless caller opts in
    if hide_deleted:
        query = query.filter(
            or_(
                models.IlsRecord.lifecycle == None,
                func.lower(models.IlsRecord.lifecycle) != "deleted",
            )
        )

    if q:
        p = f"%{q}%"
        query = query.filter(
            or_(
                models.IlsRecord.barcode.ilike(p),
                models.IlsRecord.title.ilike(p),
                models.IlsRecord.call_number.ilike(p),
                models.IlsRecord.item_call_number.ilike(p),
                models.IlsRecord.description.ilike(p),
                models.IlsRecord.author.ilike(p),
                models.IlsRecord.fulfillment_note.ilike(p),
            )
        )

    if location_code:
        query = query.filter(
            func.lower(models.IlsRecord.location_code) == location_code.lower()
        )

    if collection_id is not None:
        query = query.join(models.Location).filter(
            models.Location.collection_id == collection_id
        )

    if status:
        query = query.filter(models.IlsRecord.status.ilike(f"%{status}%"))

    if lifecycle:
        query = query.filter(models.IlsRecord.lifecycle.ilike(lifecycle))

    total = query.count()
    items = (
        query
        .order_by(models.IlsRecord.call_number, models.IlsRecord.id)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return RecordsPage(items=items, total=total, page=page, per_page=per_page)


@router.get("/records/{record_id}", response_model=RecordOut)
def get_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(models.IlsRecord).filter(models.IlsRecord.id == record_id).first()
    if not rec:
        raise HTTPException(404, "Record not found")
    return rec


@router.put("/records/{record_id}", response_model=RecordOut)
def update_record(
    record_id: int, data: RecordUpdate, db: Session = Depends(get_db)
):
    rec = db.query(models.IlsRecord).filter(models.IlsRecord.id == record_id).first()
    if not rec:
        raise HTTPException(404, "Record not found")

    # If location_code is changing, re-resolve location_id
    new_code = (data.location_code or "").strip()
    if new_code and new_code.lower() != (rec.location_code or "").lower():
        loc = db.query(models.Location).filter(
            func.lower(models.Location.code) == new_code.lower()
        ).first()
        if not loc:
            raise HTTPException(400, f"Unknown location code: {new_code}")
        rec.location_id = loc.id

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(rec, key, val if val != "" else None)

    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/records/{record_id}", status_code=204)
def delete_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(models.IlsRecord).filter(models.IlsRecord.id == record_id).first()
    if not rec:
        raise HTTPException(404, "Record not found")
    db.delete(rec)
    db.commit()
