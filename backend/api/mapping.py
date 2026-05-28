"""
Mapping API — physical structure of the storage facility.
Hierarchy: Floor → Range → RangeSide → Ladder → Shelf
"""
import re
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import crud, models
from db.session import get_db
from schemas.mapping import (
    FloorOut, FloorCreate,
    RangeCreate, RangeOut, RangeSummary, RangeUpdate, BulkRangeCreate,
    LadderOut, AddLadderBody, AddShelvesBody,
    SearchResult, ShelfWidthUpdate, MATERIAL_TYPES,
    MapShapeCreate, MapShapeUpdate, MapShapeBulkUpdate, MapShapeOut,
    PieceTemplateCreate, PieceTemplateOut,
    ShapeGroupCreate, ShapeGroupUpdate, ShapeGroupOut,
    LocationCreate, LocationOut,
)

router = APIRouter()


# ── Floors ────────────────────────────────────────────────────────────────────

@router.get("/floors", response_model=list[FloorOut])
def get_floors(facility: Optional[str] = Query(None), db: Session = Depends(get_db)):
    return crud.list_floors(db, facility=facility)


@router.post("/floors", response_model=FloorOut, status_code=201)
def create_floor(body: FloorCreate, db: Session = Depends(get_db)):
    existing = crud.get_floor_by_code(db, body.code)
    if existing:
        raise HTTPException(409, f"Floor with code '{body.code}' already exists")
    return crud.create_floor(db, body.code, body.display_name, body.facility)


@router.delete("/floors/{floor_id}", status_code=204)
def delete_floor(floor_id: int, db: Session = Depends(get_db)):
    if not crud.delete_floor(db, floor_id):
        raise HTTPException(404, "Floor not found")


# ── Ranges ────────────────────────────────────────────────────────────────────

@router.get("/floors/{floor_id}/ranges", response_model=list[RangeSummary])
def get_ranges(floor_id: int, db: Session = Depends(get_db)):
    floor = crud.get_floor(db, floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")
    ranges = crud.list_ranges(db, floor_id)
    return [_summarize_range(r) for r in ranges]


@router.get("/ranges/{range_id}", response_model=RangeOut)
def get_range(range_id: int, db: Session = Depends(get_db)):
    rng = crud.get_range(db, range_id)
    if not rng:
        raise HTTPException(404, "Range not found")
    return rng


@router.post("/ranges", response_model=RangeOut, status_code=201)
def create_range(body: RangeCreate, db: Session = Depends(get_db)):
    floor = crud.get_floor(db, body.floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")

    existing = crud.get_range_by_floor_and_number(db, body.floor_id, body.range_number)
    if existing:
        raise HTTPException(409, f"Range {body.range_number} already exists on this floor")

    if body.material_type and body.material_type not in MATERIAL_TYPES:
        raise HTTPException(422, f"Invalid material_type. Choose from: {', '.join(MATERIAL_TYPES)}")

    rng = crud.create_range(
        db, body.floor_id, body.range_number,
        body.material_type, body.notes, body.location_codes,
    )

    for side_in in body.sides:
        side = crud.create_range_side(db, rng.id, side_in.side_letter)
        for ldr_in in side_in.ladders:
            ladder = crud.create_ladder(db, side.id, ldr_in.ladder_number)
            if ldr_in.shelves:
                crud.bulk_create_shelves(
                    db, ladder.id,
                    [{"shelf_number": s.shelf_number, "width_inches": s.width_inches, "fill_inches": s.fill_inches}
                     for s in ldr_in.shelves]
                )

    db.refresh(rng)
    return rng


@router.put("/ranges/{range_id}", response_model=RangeOut)
def update_range(range_id: int, body: RangeUpdate, db: Session = Depends(get_db)):
    if body.material_type and body.material_type not in MATERIAL_TYPES:
        raise HTTPException(422, f"Invalid material_type. Choose from: {', '.join(MATERIAL_TYPES)}")
    rng = crud.update_range(db, range_id, body.material_type, body.notes, body.location_codes)
    if not rng:
        raise HTTPException(404, "Range not found")
    return rng


@router.delete("/ranges/{range_id}", status_code=204)
def delete_range(range_id: int, db: Session = Depends(get_db)):
    if not crud.delete_range(db, range_id):
        raise HTTPException(404, "Range not found")


@router.post("/ranges/bulk-create", status_code=201)
def bulk_create_ranges(body: BulkRangeCreate, db: Session = Depends(get_db)):
    """Create multiple ranges (range_from..range_to inclusive) with the same structure.
    Ranges that already exist on this floor are silently skipped.
    """
    floor = crud.get_floor(db, body.floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")
    if body.range_to < body.range_from:
        raise HTTPException(422, "range_to must be >= range_from")
    if body.material_type and body.material_type not in MATERIAL_TYPES:
        raise HTTPException(422, f"Invalid material_type. Choose from: {', '.join(MATERIAL_TYPES)}")

    created = 0
    skipped = 0
    for num in range(body.range_from, body.range_to + 1):
        rn = str(num).zfill(2)
        if crud.get_range_by_floor_and_number(db, body.floor_id, rn):
            skipped += 1
            continue
        rng = crud.create_range(
            db, body.floor_id, rn,
            body.material_type, body.notes, body.location_codes,
        )
        for side_in in body.sides:
            side = crud.create_range_side(db, rng.id, side_in.side_letter)
            for ldr_in in side_in.ladders:
                ladder = crud.create_ladder(db, side.id, ldr_in.ladder_number)
                if ldr_in.shelves:
                    crud.bulk_create_shelves(
                        db, ladder.id,
                        [{"shelf_number": s.shelf_number, "width_inches": s.width_inches, "fill_inches": s.fill_inches}
                         for s in ldr_in.shelves]
                    )
        created += 1

    return {"created": created, "skipped": skipped}


# ── Ladders ────────────────────────────────────────────────────────────────────

@router.post("/sides/{side_id}/ladders", response_model=LadderOut, status_code=201)
def add_ladder_to_side(side_id: int, body: AddLadderBody, db: Session = Depends(get_db)):
    """Append a new ladder to an existing range side, optionally pre-filling shelves."""
    side = crud.get_range_side(db, side_id)
    if not side:
        raise HTTPException(404, "Side not found")
    existing_nums = sorted(int(l.ladder_number) for l in side.ladders) if side.ladders else []
    next_num = (existing_nums[-1] + 1) if existing_nums else 1
    ladder = crud.create_ladder(db, side_id, str(next_num).zfill(2))
    if body.shelves_count and body.shelves_count > 0:
        crud.bulk_create_shelves(
            db, ladder.id,
            [{"shelf_number": str(i).zfill(2), "width_inches": body.width_inches, "fill_inches": body.fill_inches}
             for i in range(1, body.shelves_count + 1)]
        )
    db.refresh(ladder)
    return ladder


@router.delete("/ladders/{ladder_id}", status_code=204)
def delete_ladder(ladder_id: int, db: Session = Depends(get_db)):
    if not crud.delete_ladder(db, ladder_id):
        raise HTTPException(404, "Ladder not found")


# ── Shelves ────────────────────────────────────────────────────────────────────

@router.post("/ladders/{ladder_id}/shelves", response_model=LadderOut, status_code=201)
def add_shelves_to_ladder(ladder_id: int, body: AddShelvesBody, db: Session = Depends(get_db)):
    """Append one or more shelves to an existing ladder."""
    ladder = crud.get_ladder(db, ladder_id)
    if not ladder:
        raise HTTPException(404, "Ladder not found")
    existing_nums = sorted(int(s.shelf_number) for s in ladder.shelves) if ladder.shelves else []
    next_num = (existing_nums[-1] + 1) if existing_nums else 1
    count = max(1, body.count)
    crud.bulk_create_shelves(
        db, ladder_id,
        [{"shelf_number": str(next_num + i).zfill(2), "width_inches": body.width_inches, "fill_inches": body.fill_inches}
         for i in range(count)]
    )
    db.refresh(ladder)
    return ladder


@router.put("/shelves/{shelf_id}", response_model=dict)
def update_shelf(shelf_id: int, body: ShelfWidthUpdate, db: Session = Depends(get_db)):
    shelf = crud.update_shelf_width(db, shelf_id, body.width_inches, body.fill_inches)
    if not shelf:
        raise HTTPException(404, "Shelf not found")
    return {
        "id": shelf.id, "shelf_number": shelf.shelf_number,
        "width_inches": str(shelf.width_inches) if shelf.width_inches is not None else None,
        "fill_inches":  str(shelf.fill_inches)  if shelf.fill_inches  is not None else None,
    }


@router.delete("/shelves/{shelf_id}", status_code=204)
def delete_shelf(shelf_id: int, db: Session = Depends(get_db)):
    if not crud.delete_shelf(db, shelf_id):
        raise HTTPException(404, "Shelf not found")


# ── Search ────────────────────────────────────────────────────────────────────

@router.get("/search", response_model=SearchResult)
def search(prefix: str, db: Session = Depends(get_db)):
    """
    Parse a call number prefix (e.g. S-1-02B-03) and return the matching
    structure with totals.  Accepts partial prefixes at any level.
    """
    floor_code, range_number, side_letter, ladder_number = _parse_prefix(prefix)
    if not floor_code:
        raise HTTPException(422, "Prefix must start with 'S-{floor}' (e.g. S-1 or S-2-05A)")

    found = crud.search_by_prefix(db, floor_code, range_number, side_letter, ladder_number)
    if not found.get("floor"):
        raise HTTPException(404, "No matching floor found for that prefix")

    result = SearchResult(floor=found["floor"])
    rng = found.get("range")
    if rng:
        result.range = rng
        result.ladder_count, result.shelf_count, result.total_width_inches = _range_totals(rng)

        # If we drilled to a specific side or ladder, narrow the totals
        if found.get("ladder"):
            ladder = found["ladder"]
            result.shelf_count = len(ladder.shelves)
            w = sum(float(s.width_inches) for s in ladder.shelves if s.width_inches is not None)
            result.total_width_inches = Decimal(str(w)) if w else None
        elif found.get("side"):
            side = found["side"]
            result.ladder_count = len(side.ladders)
            sc = sum(len(l.shelves) for l in side.ladders)
            result.shelf_count = sc
            w = sum(float(s.width_inches) for l in side.ladders for s in l.shelves if s.width_inches)
            result.total_width_inches = Decimal(str(w)) if w else None

    return result


# ── Map Shapes ────────────────────────────────────────────────────────────────

@router.get("/floors/{floor_id}/shapes", response_model=list[MapShapeOut])
def get_shapes(floor_id: int, db: Session = Depends(get_db)):
    floor = crud.get_floor(db, floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")
    return crud.list_map_shapes(db, floor_id)


@router.post("/floors/{floor_id}/shapes", response_model=MapShapeOut, status_code=201)
def create_shape(floor_id: int, body: MapShapeCreate, db: Session = Depends(get_db)):
    floor = crud.get_floor(db, floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")
    data = body.model_dump()
    return crud.create_map_shape(db, floor_id, data)


@router.put("/shapes/{shape_id}", response_model=MapShapeOut)
def update_shape(shape_id: int, body: MapShapeUpdate, db: Session = Depends(get_db)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    shape = crud.update_map_shape(db, shape_id, data)
    if not shape:
        raise HTTPException(404, "Shape not found")
    return shape


@router.delete("/shapes/{shape_id}", status_code=204)
def delete_shape(shape_id: int, db: Session = Depends(get_db)):
    if not crud.delete_map_shape(db, shape_id):
        raise HTTPException(404, "Shape not found")


@router.post("/shapes/bulk-update", status_code=204)
def bulk_update_shapes(body: list[MapShapeBulkUpdate], db: Session = Depends(get_db)):
    updates = [u.model_dump(exclude_none=True) for u in body]
    crud.bulk_update_map_shapes(db, updates)


# ── Piece Templates ───────────────────────────────────────────────────────────

@router.get("/piece-templates", response_model=list[PieceTemplateOut])
def get_piece_templates(db: Session = Depends(get_db)):
    return crud.list_piece_templates(db)


@router.post("/piece-templates", response_model=PieceTemplateOut, status_code=201)
def create_piece_template(body: PieceTemplateCreate, db: Session = Depends(get_db)):
    return crud.create_piece_template(db, body.model_dump())


@router.delete("/piece-templates/{template_id}", status_code=204)
def delete_piece_template(template_id: int, db: Session = Depends(get_db)):
    if not crud.delete_piece_template(db, template_id):
        raise HTTPException(404, "Template not found")


# ── Shape Groups ──────────────────────────────────────────────────────────────

@router.get("/floors/{floor_id}/groups", response_model=list[ShapeGroupOut])
def get_shape_groups(floor_id: int, db: Session = Depends(get_db)):
    floor = crud.get_floor(db, floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")
    return crud.list_shape_groups(db, floor_id)


@router.post("/floors/{floor_id}/groups", response_model=ShapeGroupOut, status_code=201)
def create_shape_group(floor_id: int, body: ShapeGroupCreate, db: Session = Depends(get_db)):
    floor = crud.get_floor(db, floor_id)
    if not floor:
        raise HTTPException(404, "Floor not found")
    return crud.create_shape_group(db, floor_id, body.model_dump())


@router.put("/groups/{group_id}", response_model=ShapeGroupOut)
def update_shape_group(group_id: int, body: ShapeGroupUpdate, db: Session = Depends(get_db)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    group = crud.update_shape_group(db, group_id, data)
    if not group:
        raise HTTPException(404, "Group not found")
    return group


@router.delete("/groups/{group_id}", status_code=204)
def delete_shape_group(group_id: int, db: Session = Depends(get_db)):
    if not crud.delete_shape_group(db, group_id):
        raise HTTPException(404, "Group not found")


@router.post("/groups/{group_id}/assign", status_code=204)
def assign_shapes_to_group(group_id: int, shape_ids: list[int], db: Session = Depends(get_db)):
    crud.assign_shapes_to_group(db, group_id, shape_ids)


@router.delete("/groups/{group_id}/shapes/{shape_id}", status_code=204)
def remove_from_group(group_id: int, shape_id: int, db: Session = Depends(get_db)):
    crud.remove_shape_from_group(db, shape_id)


# ── Locations ─────────────────────────────────────────────────────────────────

_FACILITY_TO_COLLECTION = {"morgan": "Morgan", "storage": "Storage"}


@router.get("/locations", response_model=list[LocationOut])
def get_locations(facility: str = Query("morgan"), db: Session = Depends(get_db)):
    collection_name = _FACILITY_TO_COLLECTION.get(facility.lower(), "Morgan")
    return crud.list_locations(db, collection_name)


@router.post("/locations", response_model=LocationOut, status_code=201)
def create_location(body: LocationCreate, db: Session = Depends(get_db)):
    collection_name = _FACILITY_TO_COLLECTION.get(body.facility.lower(), "Morgan")
    try:
        return crud.create_location(db, collection_name, body.code, body.display_name)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.delete("/locations/{location_id}", status_code=204)
def delete_location(location_id: int, db: Session = Depends(get_db)):
    if not crud.delete_location(db, location_id):
        raise HTTPException(404, "Location not found")


# ── Helpers ───────────────────────────────────────────────────────────────────
def _parse_prefix(prefix: str):
    """Parse S-{floor}-{range}{side}-{ladder} into components."""
    prefix = prefix.strip().upper()
    # Strip leading "S-" if present
    m = re.match(r"^S-(.+)$", prefix)
    if not m:
        return None, None, None, None
    rest = m.group(1)

    parts = rest.split("-")
    floor_code = parts[0].lower()  # "1", "2", or "addition"
    range_number = None
    side_letter = None
    ladder_number = None

    if len(parts) >= 2:
        # "02B" → range "02", side "B"; "02" → range "02", side None
        rs = parts[1]
        m2 = re.match(r"^(\d+)([A-D]?)$", rs)
        if m2:
            range_number = m2.group(1).zfill(2) if m2.group(1) else None
            side_letter = m2.group(2) or None

    if len(parts) >= 3:
        ladder_number = parts[2].zfill(2)

    return floor_code, range_number, side_letter, ladder_number


def _summarize_range(rng: models.Range) -> dict:
    ladder_count = sum(len(side.ladders) for side in rng.sides)
    shelf_count = sum(len(ldr.shelves) for side in rng.sides for ldr in side.ladders)
    total_w = sum(
        float(s.width_inches)
        for side in rng.sides
        for ldr in side.ladders
        for s in ldr.shelves
        if s.width_inches is not None
    )
    return {
        "id": rng.id,
        "floor_id": rng.floor_id,
        "range_number": rng.range_number,
        "material_type": rng.material_type,
        "notes": rng.notes,
        "location_codes": [c.strip() for c in rng.location_codes.split(",") if c.strip()] if rng.location_codes else [],
        "side_count": len(rng.sides),
        "ladder_count": ladder_count,
        "shelf_count": shelf_count,
        "total_width_inches": Decimal(str(total_w)) if total_w else None,
    }


def _range_totals(rng: models.Range):
    ladder_count = sum(len(s.ladders) for s in rng.sides)
    shelf_count = sum(len(l.shelves) for s in rng.sides for l in s.ladders)
    total_w = sum(
        float(sh.width_inches)
        for s in rng.sides
        for l in s.ladders
        for sh in l.shelves
        if sh.width_inches is not None
    )
    w = Decimal(str(total_w)) if total_w else None
    return ladder_count, shelf_count, w