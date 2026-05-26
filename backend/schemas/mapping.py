from __future__ import annotations
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, field_validator


MATERIAL_TYPES = [
    "general stacks",
    "microfilm",
    "microfiche",
    "oversize",
    "special collections",
    "elec media",
    "documents",
]


# ── Request bodies ────────────────────────────────────────────────────────────

class ShelfIn(BaseModel):
    shelf_number: str
    width_inches: Optional[Decimal] = None


class LadderIn(BaseModel):
    ladder_number: str
    shelves: list[ShelfIn]


class SideIn(BaseModel):
    side_letter: str
    ladders: list[LadderIn]

    @field_validator("side_letter")
    @classmethod
    def valid_side(cls, v: str) -> str:
        if v.upper() not in ("A", "B", "C", "D"):
            raise ValueError("side_letter must be A, B, C, or D")
        return v.upper()


class RangeCreate(BaseModel):
    floor_id: int
    range_number: str
    material_type: Optional[str] = None
    notes: Optional[str] = None
    sides: list[SideIn]


class RangeUpdate(BaseModel):
    material_type: Optional[str] = None
    notes: Optional[str] = None


class ShelfWidthUpdate(BaseModel):
    width_inches: Optional[Decimal] = None


# ── Response bodies ───────────────────────────────────────────────────────────

class ShelfOut(BaseModel):
    id: int
    shelf_number: str
    width_inches: Optional[Decimal]

    model_config = {"from_attributes": True}


class LadderOut(BaseModel):
    id: int
    ladder_number: str
    notes: Optional[str]
    shelves: list[ShelfOut]

    model_config = {"from_attributes": True}


class SideOut(BaseModel):
    id: int
    side_letter: str
    ladders: list[LadderOut]

    model_config = {"from_attributes": True}


class RangeOut(BaseModel):
    id: int
    floor_id: int
    range_number: str
    material_type: Optional[str]
    notes: Optional[str]
    sides: list[SideOut]

    model_config = {"from_attributes": True}


class RangeSummary(BaseModel):
    """Lightweight listing without nested shelves — for range list views."""
    id: int
    floor_id: int
    range_number: str
    material_type: Optional[str]
    notes: Optional[str]
    side_count: int
    ladder_count: int
    shelf_count: int
    total_width_inches: Optional[Decimal]

    model_config = {"from_attributes": False}


class FloorOut(BaseModel):
    id: int
    code: str
    display_name: str

    model_config = {"from_attributes": True}


class SearchResult(BaseModel):
    floor: Optional[FloorOut] = None
    range: Optional[RangeOut] = None
    ladder_count: int = 0
    shelf_count: int = 0
    total_width_inches: Optional[Decimal] = None


# ── Map layout schemas ────────────────────────────────────────────────────────

class MapShapeCreate(BaseModel):
    range_id: Optional[int] = None
    template_id: Optional[int] = None
    group_id: Optional[int] = None
    label: Optional[str] = None
    x: Decimal = Decimal("0")
    y: Decimal = Decimal("0")
    width: Decimal = Decimal("80")
    height: Decimal = Decimal("40")
    color: Optional[str] = None
    rotation: int = 0


class MapShapeUpdate(BaseModel):
    range_id: Optional[int] = None
    template_id: Optional[int] = None
    group_id: Optional[int] = None
    label: Optional[str] = None
    x: Optional[Decimal] = None
    y: Optional[Decimal] = None
    width: Optional[Decimal] = None
    height: Optional[Decimal] = None
    color: Optional[str] = None
    rotation: Optional[int] = None


class MapShapeBulkUpdate(BaseModel):
    id: int
    x: Optional[Decimal] = None
    y: Optional[Decimal] = None
    width: Optional[Decimal] = None
    height: Optional[Decimal] = None
    rotation: Optional[int] = None


class MapShapeOut(BaseModel):
    id: int
    floor_id: int
    range_id: Optional[int]
    template_id: Optional[int]
    group_id: Optional[int]
    label: Optional[str]
    x: Decimal
    y: Decimal
    width: Decimal
    height: Decimal
    color: Optional[str]
    rotation: int

    model_config = {"from_attributes": True}


# ── Piece template schemas ────────────────────────────────────────────────────

class PieceTemplateCreate(BaseModel):
    name: str
    category: str
    width_inches: Decimal = Decimal("35")
    depth_inches: Decimal = Decimal("24")
    color: Optional[str] = None


class PieceTemplateOut(BaseModel):
    id: int
    name: str
    category: str
    width_inches: Decimal
    depth_inches: Decimal
    color: Optional[str]

    model_config = {"from_attributes": True}


# ── Shape group schemas ───────────────────────────────────────────────────────

class ShapeGroupCreate(BaseModel):
    range_id: Optional[int] = None
    label: Optional[str] = None
    ladder01_end: Optional[str] = None   # "left" | "right" | "top" | "bottom"


class ShapeGroupUpdate(BaseModel):
    range_id: Optional[int] = None
    label: Optional[str] = None
    ladder01_end: Optional[str] = None


class ShapeGroupOut(BaseModel):
    id: int
    floor_id: int
    range_id: Optional[int]
    label: Optional[str]
    ladder01_end: Optional[str]

    model_config = {"from_attributes": True}