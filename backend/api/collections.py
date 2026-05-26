from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from db.session import get_db
from db import models

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class LocationOut(BaseModel):
    id: int
    collection_id: int
    code: str
    display_name: str

    model_config = {"from_attributes": True}


class CollectionOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    call_number_type: str
    locations: list[LocationOut] = []

    model_config = {"from_attributes": True}


class CollectionIn(BaseModel):
    name: str
    description: Optional[str] = None
    call_number_type: str = "lc"


class LocationIn(BaseModel):
    code: str
    display_name: str


# ── Collections ───────────────────────────────────────────────────────────────

@router.get("", response_model=list[CollectionOut])
def list_collections(db: Session = Depends(get_db)):
    return db.query(models.Collection).order_by(models.Collection.name).all()


@router.post("", response_model=CollectionOut, status_code=201)
def create_collection(data: CollectionIn, db: Session = Depends(get_db)):
    obj = models.Collection(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{collection_id}", response_model=CollectionOut)
def update_collection(
    collection_id: int, data: CollectionIn, db: Session = Depends(get_db)
):
    obj = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Collection not found")
    for key, val in data.model_dump().items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{collection_id}", status_code=204)
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Collection not found")
    db.delete(obj)
    db.commit()


# ── Locations ─────────────────────────────────────────────────────────────────

@router.post("/{collection_id}/locations", response_model=LocationOut, status_code=201)
def create_location(
    collection_id: int, data: LocationIn, db: Session = Depends(get_db)
):
    if not db.query(models.Collection).filter(models.Collection.id == collection_id).first():
        raise HTTPException(status_code=404, detail="Collection not found")
    obj = models.Location(collection_id=collection_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{collection_id}/locations/{location_id}", response_model=LocationOut)
def update_location(
    collection_id: int,
    location_id: int,
    data: LocationIn,
    db: Session = Depends(get_db),
):
    obj = (
        db.query(models.Location)
        .filter(
            models.Location.id == location_id,
            models.Location.collection_id == collection_id,
        )
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Location not found")
    for key, val in data.model_dump().items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{collection_id}/locations/{location_id}", status_code=204)
def delete_location(
    collection_id: int, location_id: int, db: Session = Depends(get_db)
):
    obj = (
        db.query(models.Location)
        .filter(
            models.Location.id == location_id,
            models.Location.collection_id == collection_id,
        )
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(obj)
    db.commit()
