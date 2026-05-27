from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, Text, DateTime, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .base import Base


# ── Mapping: physical structure of the storage facility ──────────────────────

class Floor(Base):
    """One of the three physical locations (first, second, addition)."""
    __tablename__ = "floors"

    id           = Column(Integer, primary_key=True)
    code         = Column(String, nullable=False, unique=True)   # "1" | "2" | "addition"
    display_name = Column(String, nullable=False)
    facility     = Column(String(20), nullable=False, server_default="storage")  # "storage" | "morgan"

    ranges = relationship("Range", back_populates="floor", cascade="all, delete-orphan",
                          order_by="Range.range_number")


class Range(Base):
    """A single physical range (row of shelving), identified by its 2-digit number."""
    __tablename__ = "ranges"

    id             = Column(Integer, primary_key=True)
    floor_id       = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    range_number   = Column(String(4), nullable=False)   # e.g. "02"
    material_type  = Column(String, nullable=True)        # microfilm | oversize | general stacks | …
    notes          = Column(Text, nullable=True)
    location_codes = Column(Text, nullable=True)          # comma-separated, e.g. "ms,msu"

    floor = relationship("Floor", back_populates="ranges")
    sides = relationship("RangeSide", back_populates="range", cascade="all, delete-orphan",
                         order_by="RangeSide.side_letter")


class RangeSide(Base):
    """One face (A / B / C / D) of a range.  Each side has its own ladders."""
    __tablename__ = "range_sides"

    id          = Column(Integer, primary_key=True)
    range_id    = Column(Integer, ForeignKey("ranges.id", ondelete="CASCADE"), nullable=False, index=True)
    side_letter = Column(String(1), nullable=False)   # A | B | C | D

    range   = relationship("Range", back_populates="sides")
    ladders = relationship("Ladder", back_populates="side", cascade="all, delete-orphan",
                           order_by="Ladder.ladder_number")


class Ladder(Base):
    """A vertical section of shelves within one side of a range."""
    __tablename__ = "ladders"

    id            = Column(Integer, primary_key=True)
    range_side_id = Column(Integer, ForeignKey("range_sides.id", ondelete="CASCADE"), nullable=False, index=True)
    ladder_number = Column(String(4), nullable=False)   # e.g. "03"
    notes         = Column(Text, nullable=True)

    side    = relationship("RangeSide", back_populates="ladders")
    shelves = relationship("Shelf", back_populates="ladder", cascade="all, delete-orphan",
                           order_by="Shelf.shelf_number")


class Shelf(Base):
    """A single shelf within a ladder.  Records its physical width for space calculations."""
    __tablename__ = "shelves"

    id           = Column(Integer, primary_key=True)
    ladder_id    = Column(Integer, ForeignKey("ladders.id", ondelete="CASCADE"), nullable=False, index=True)
    shelf_number = Column(String(4), nullable=False)    # e.g. "04"
    width_inches = Column(Numeric(6, 2), nullable=True)  # physical measured width

    ladder = relationship("Ladder", back_populates="shelves")


__all__ = ["Base", "Floor", "Range", "RangeSide", "Ladder", "Shelf",
           "PieceTemplate", "ShapeGroup", "MapShape",
           "Collection", "Location", "IlsRecord"]


# ── Collections & Locations ──────────────────────────────────────────────────

class Collection(Base):
    """Top-level grouping of locations: e.g. Morgan or Storage."""
    __tablename__ = "collections"

    id               = Column(Integer, primary_key=True)
    name             = Column(String(100), nullable=False, unique=True)   # "Morgan" | "Storage"
    description      = Column(Text, nullable=True)
    call_number_type = Column(String(20), nullable=False, default="lc")   # "lc" | "storage"

    locations = relationship(
        "Location", back_populates="collection",
        cascade="all, delete-orphan", order_by="Location.code",
    )


class Location(Base):
    """A specific Alma location code within a collection."""
    __tablename__ = "locations"

    id            = Column(Integer, primary_key=True)
    collection_id = Column(Integer, ForeignKey("collections.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    code          = Column(String(50), nullable=False, unique=True)   # "ms", "msj", "ssy"
    display_name  = Column(String(100), nullable=False)               # "Morgan", "Bound Journal"

    collection  = relationship("Collection", back_populates="locations")
    ils_records = relationship("IlsRecord", back_populates="location")


# ── ILS Records ───────────────────────────────────────────────────────────────

class IlsRecord(Base):
    """
    A single item record imported from an Alma analytics export.
    All uploads land here; the location_id (resolved from the row's location_code)
    determines which collection/location the item belongs to.
    Re-uploading is safe: rows are upserted by barcode.
    """
    __tablename__ = "ils_records"

    id               = Column(Integer, primary_key=True)
    location_id      = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"),
                              nullable=False, index=True)
    barcode          = Column(String(100), nullable=False, unique=True, index=True)
    call_number      = Column(String(255), nullable=True)   # raw call number from Alma
    call_number_norm = Column(String(255), nullable=True)   # normalised for sort/comparison
    item_call_number = Column(String(255), nullable=True)   # item-level call number if different
    title            = Column(Text, nullable=True)
    author           = Column(Text, nullable=True)
    status           = Column(String(100), nullable=True)   # "Item in place" | "Missing" | …
    lifecycle        = Column(String(100), nullable=True)
    location_code    = Column(String(50), nullable=True)    # raw value from Alma (informational)
    location_name    = Column(String(100), nullable=True)
    item_policy      = Column(String(100), nullable=True)
    description      = Column(Text, nullable=True)
    fulfillment_note = Column(Text, nullable=True)
    uploaded_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    location = relationship("Location", back_populates="ils_records")


# ── Piece templates (reusable shelf-unit blueprints) ──────────────────────────

class PieceTemplate(Base):
    """
    A savable, reusable shelf-unit blueprint.
    Dimensions stored in inches; the canvas renders them scaled by PIXELS_PER_INCH.
    """
    __tablename__ = "piece_templates"

    id           = Column(Integer, primary_key=True)
    name         = Column(String(100), nullable=False)
    category     = Column(String(100), nullable=False, index=True)   # e.g. "General Stacks"
    width_inches = Column(Numeric(8, 2), nullable=False, default=35)  # physical shelf width
    depth_inches = Column(Numeric(8, 2), nullable=False, default=24)  # range depth (front-to-back)
    color        = Column(String(7), nullable=True)                   # hex override or None


# ── Shape groups (pieces grouped into one logical range) ─────────────────────

class ShapeGroup(Base):
    """
    A collection of map shapes that together represent one physical range on the floor plan.
    ladder01_end tells which physical end of the group has the first ladder.
    """
    __tablename__ = "shape_groups"

    id           = Column(Integer, primary_key=True)
    floor_id     = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    range_id     = Column(Integer, ForeignKey("ranges.id", ondelete="SET NULL"), nullable=True, index=True)
    label        = Column(String(100), nullable=True)
    ladder01_end = Column(String(10), nullable=True)   # "left" | "right" | "top" | "bottom"

    floor  = relationship("Floor")
    range  = relationship("Range")
    shapes = relationship("MapShape", back_populates="group",
                          foreign_keys="MapShape.group_id")


# ── Map layout: placed shapes on the floor plan ───────────────────────────────

class MapShape(Base):
    """
    One placed rectangle on the top-down floor plan for a floor.
    Can be a free shape, a placed piece template instance, or part of a group.
    """
    __tablename__ = "map_shapes"

    id           = Column(Integer, primary_key=True)
    floor_id     = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    range_id     = Column(Integer, ForeignKey("ranges.id", ondelete="SET NULL"), nullable=True, index=True)
    template_id  = Column(Integer, ForeignKey("piece_templates.id", ondelete="SET NULL"), nullable=True)
    group_id     = Column(Integer, ForeignKey("shape_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    label        = Column(String, nullable=True)
    x            = Column(Numeric(10, 2), nullable=False, default=0)
    y            = Column(Numeric(10, 2), nullable=False, default=0)
    width        = Column(Numeric(10, 2), nullable=False, default=80)
    height       = Column(Numeric(10, 2), nullable=False, default=40)
    color        = Column(String(7), nullable=True)
    rotation     = Column(Integer, nullable=False, default=0)

    floor    = relationship("Floor")
    range    = relationship("Range")
    template = relationship("PieceTemplate")
    group    = relationship("ShapeGroup", back_populates="shapes",
                            foreign_keys=[group_id])


# ── Shelf-reading / scanning ───────────────────────────────────────────────────

class ScanSession(Base):
    """
    A single shelf-reading session.  Linked to a physical shelf in the mapping
    structure (nullable so sessions can be created before mapping is complete).
    """
    __tablename__ = "scan_sessions"

    id                 = Column(Integer, primary_key=True)
    shelf_id           = Column(Integer, ForeignKey("shelves.id", ondelete="SET NULL"),
                                nullable=True, index=True)
    range_side_id      = Column(Integer, ForeignKey("range_sides.id", ondelete="SET NULL"),
                                nullable=True, index=True)
    # Human-readable location path — auto-built or manually entered
    location_label     = Column(String(300), nullable=True)
    status             = Column(String(20),  nullable=False, default="scanning")
    # scanning → analyzed → complete
    notes              = Column(Text,        nullable=True)
    inches_of_material = Column(Numeric(7, 2), nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    analyzed_at        = Column(DateTime(timezone=True), nullable=True)

    shelf      = relationship("Shelf")
    range_side = relationship("RangeSide")
    items        = relationship("ScanItem",        cascade="all, delete-orphan",
                                order_by="ScanItem.position", back_populates="session")
    discrepancies = relationship("ScanDiscrepancy", cascade="all, delete-orphan",
                                 back_populates="session")


class ScanItem(Base):
    """One barcode scanned in position order within a ScanSession."""
    __tablename__ = "scan_items"

    id            = Column(Integer, primary_key=True)
    session_id    = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    position      = Column(Integer, nullable=False)           # 1-based scan order
    barcode       = Column(String(100), nullable=False)

    # Resolved from ils_records at analysis time (denormalised for fast display)
    ils_record_id    = Column(Integer, ForeignKey("ils_records.id", ondelete="SET NULL"),
                              nullable=True, index=True)
    call_number      = Column(String(255), nullable=True)
    call_number_norm = Column(String(255), nullable=True)
    title            = Column(Text,        nullable=True)
    status           = Column(String(100), nullable=True)
    lifecycle        = Column(String(100), nullable=True)
    location_code    = Column(String(50),  nullable=True)
    fulfillment_note = Column(Text,        nullable=True)

    session    = relationship("ScanSession", back_populates="items")
    ils_record = relationship("IlsRecord")
    discrepancy = relationship("ScanDiscrepancy", back_populates="scan_item", uselist=False)


class ScanDiscrepancy(Base):
    """
    A single discrepancy detected during analysis of a ScanSession.

    type values:
      no_record        – barcode not found in ILS
      out_of_order     – call number breaks ascending sequence
      wrong_location   – item's location_code doesn't match the session shelf
      status_issue     – status is not 'Item in place'
      fulfillment_note – item has a fulfillment note
      deleted_on_shelf – lifecycle is 'Deleted' but item was found on shelf
    """
    __tablename__ = "scan_discrepancies"

    id                = Column(Integer, primary_key=True)
    session_id        = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"),
                               nullable=False, index=True)
    scan_item_id      = Column(Integer, ForeignKey("scan_items.id",    ondelete="CASCADE"),
                               nullable=True, index=True)
    type              = Column(String(50),  nullable=False)
    severity          = Column(String(20),  nullable=False, default="warning")
    # info | warning | error
    detail            = Column(Text,        nullable=True)
    expected_position = Column(Integer,     nullable=True)   # for out_of_order

    session   = relationship("ScanSession",  back_populates="discrepancies")
    scan_item = relationship("ScanItem",     back_populates="discrepancy")

