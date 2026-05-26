# CRUD helpers will be added here as features are built.
from typing import Optional
from sqlalchemy.orm import Session

from db import models


# ── Floors ────────────────────────────────────────────────────────────────────

def list_floors(db: Session) -> list[models.Floor]:
    return db.query(models.Floor).order_by(models.Floor.id).all()


def get_floor(db: Session, floor_id: int) -> Optional[models.Floor]:
    return db.query(models.Floor).filter(models.Floor.id == floor_id).first()


def get_floor_by_code(db: Session, code: str) -> Optional[models.Floor]:
    return db.query(models.Floor).filter(models.Floor.code == code).first()


# ── Ranges ────────────────────────────────────────────────────────────────────

def list_ranges(db: Session, floor_id: int) -> list[models.Range]:
    return (
        db.query(models.Range)
        .filter(models.Range.floor_id == floor_id)
        .order_by(models.Range.range_number)
        .all()
    )


def get_range(db: Session, range_id: int) -> Optional[models.Range]:
    return db.query(models.Range).filter(models.Range.id == range_id).first()


def get_range_by_floor_and_number(
    db: Session, floor_id: int, range_number: str
) -> Optional[models.Range]:
    return (
        db.query(models.Range)
        .filter(models.Range.floor_id == floor_id, models.Range.range_number == range_number)
        .first()
    )


def create_range(
    db: Session,
    floor_id: int,
    range_number: str,
    material_type: Optional[str],
    notes: Optional[str],
) -> models.Range:
    obj = models.Range(
        floor_id=floor_id,
        range_number=range_number,
        material_type=material_type,
        notes=notes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_range(
    db: Session,
    range_id: int,
    material_type: Optional[str],
    notes: Optional[str],
) -> Optional[models.Range]:
    obj = get_range(db, range_id)
    if not obj:
        return None
    obj.material_type = material_type
    obj.notes = notes
    db.commit()
    db.refresh(obj)
    return obj


def delete_range(db: Session, range_id: int) -> bool:
    obj = get_range(db, range_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ── Range Sides ───────────────────────────────────────────────────────────────

def create_range_side(db: Session, range_id: int, side_letter: str) -> models.RangeSide:
    obj = models.RangeSide(range_id=range_id, side_letter=side_letter)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_range_side(db: Session, side_id: int) -> Optional[models.RangeSide]:
    return db.query(models.RangeSide).filter(models.RangeSide.id == side_id).first()


# ── Ladders ───────────────────────────────────────────────────────────────────

def create_ladder(
    db: Session, range_side_id: int, ladder_number: str, notes: Optional[str] = None
) -> models.Ladder:
    obj = models.Ladder(range_side_id=range_side_id, ladder_number=ladder_number, notes=notes)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_ladder(db: Session, ladder_id: int) -> Optional[models.Ladder]:
    return db.query(models.Ladder).filter(models.Ladder.id == ladder_id).first()


# ── Shelves ───────────────────────────────────────────────────────────────────

def bulk_create_shelves(
    db: Session, ladder_id: int, shelves: list[dict]
) -> list[models.Shelf]:
    """shelves: list of {"shelf_number": str, "width_inches": float|None}"""
    objs = [
        models.Shelf(ladder_id=ladder_id, shelf_number=s["shelf_number"], width_inches=s.get("width_inches"))
        for s in shelves
    ]
    db.bulk_save_objects(objs)
    db.commit()
    return objs


def get_shelf(db: Session, shelf_id: int) -> Optional[models.Shelf]:
    return db.query(models.Shelf).filter(models.Shelf.id == shelf_id).first()


def update_shelf_width(db: Session, shelf_id: int, width_inches: Optional[float]) -> Optional[models.Shelf]:
    obj = get_shelf(db, shelf_id)
    if not obj:
        return None
    obj.width_inches = width_inches
    db.commit()
    db.refresh(obj)
    return obj


# ── Map Shapes ─────────────────────────────────────────────────────────────────

def list_map_shapes(db: Session, floor_id: int) -> list[models.MapShape]:
    return (
        db.query(models.MapShape)
        .filter(models.MapShape.floor_id == floor_id)
        .all()
    )


def create_map_shape(db: Session, floor_id: int, data: dict) -> models.MapShape:
    obj = models.MapShape(floor_id=floor_id, **data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_map_shape(db: Session, shape_id: int, data: dict) -> Optional[models.MapShape]:
    obj = db.query(models.MapShape).filter(models.MapShape.id == shape_id).first()
    if not obj:
        return None
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_map_shape(db: Session, shape_id: int) -> bool:
    obj = db.query(models.MapShape).filter(models.MapShape.id == shape_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def bulk_update_map_shapes(db: Session, updates: list[dict]) -> None:
    """Batch position/size update — each dict must have 'id' + fields to update."""
    for u in updates:
        shape_id = u.pop("id")
        db.query(models.MapShape).filter(models.MapShape.id == shape_id).update(u)
    db.commit()


# ── Piece Templates ────────────────────────────────────────────────────────────

def list_piece_templates(db: Session) -> list[models.PieceTemplate]:
    return db.query(models.PieceTemplate).order_by(models.PieceTemplate.category, models.PieceTemplate.name).all()


def create_piece_template(db: Session, data: dict) -> models.PieceTemplate:
    obj = models.PieceTemplate(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def delete_piece_template(db: Session, template_id: int) -> bool:
    obj = db.query(models.PieceTemplate).filter(models.PieceTemplate.id == template_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ── Shape Groups ───────────────────────────────────────────────────────────────

def list_shape_groups(db: Session, floor_id: int) -> list[models.ShapeGroup]:
    return (
        db.query(models.ShapeGroup)
        .filter(models.ShapeGroup.floor_id == floor_id)
        .all()
    )


def create_shape_group(db: Session, floor_id: int, data: dict) -> models.ShapeGroup:
    obj = models.ShapeGroup(floor_id=floor_id, **data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_shape_group(db: Session, group_id: int, data: dict) -> Optional[models.ShapeGroup]:
    obj = db.query(models.ShapeGroup).filter(models.ShapeGroup.id == group_id).first()
    if not obj:
        return None
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_shape_group(db: Session, group_id: int) -> bool:
    """Delete group and unlink shapes (group_id → NULL via FK ondelete=SET NULL)."""
    obj = db.query(models.ShapeGroup).filter(models.ShapeGroup.id == group_id).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


def assign_shapes_to_group(db: Session, group_id: int, shape_ids: list[int]) -> None:
    db.query(models.MapShape).filter(models.MapShape.id.in_(shape_ids)).update(
        {models.MapShape.group_id: group_id}, synchronize_session=False
    )
    db.commit()


def remove_shape_from_group(db: Session, shape_id: int) -> None:
    db.query(models.MapShape).filter(models.MapShape.id == shape_id).update(
        {models.MapShape.group_id: None}, synchronize_session=False
    )
    db.commit()


def search_by_prefix(db: Session, floor_code: Optional[str], range_number: Optional[str],
                     side_letter: Optional[str], ladder_number: Optional[str]) -> dict:
    """Return matching structure nodes for a parsed call number prefix."""
    result: dict = {}

    floor = get_floor_by_code(db, floor_code) if floor_code else None
    if not floor:
        return result
    result["floor"] = floor

    if not range_number:
        result["ranges"] = list_ranges(db, floor.id)
        return result

    rng = get_range_by_floor_and_number(db, floor.id, range_number)
    if not rng:
        return result
    result["range"] = rng

    if not side_letter:
        return result

    side = (
        db.query(models.RangeSide)
        .filter(models.RangeSide.range_id == rng.id, models.RangeSide.side_letter == side_letter)
        .first()
    )
    if not side:
        return result
    result["side"] = side

    if not ladder_number:
        return result

    ladder = (
        db.query(models.Ladder)
        .filter(models.Ladder.range_side_id == side.id, models.Ladder.ladder_number == ladder_number)
        .first()
    )
    if not ladder:
        return result
    result["ladder"] = ladder
    return result

