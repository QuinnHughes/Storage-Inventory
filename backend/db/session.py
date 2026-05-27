from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from config import get_database_url

# Engine is created lazily so the app starts even without a DB URL configured.
_engine = None
_SessionLocal = None


def _get_engine():
    global _engine, _SessionLocal
    url = get_database_url()
    if url is None:
        return None
    if _engine is None or str(_engine.url) != url:
        _engine = create_engine(url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def get_db() -> Generator[Session, None, None]:
    engine = _get_engine()
    if engine is None or _SessionLocal is None:
        raise RuntimeError("Database not configured. Please set the connection URL in Settings.")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Create all tables if they do not already exist, and add any missing columns."""
    engine = _get_engine()
    if engine is None:
        return
    from db.base import Base
    import db.models  # noqa: F401 – ensure models are registered
    Base.metadata.create_all(bind=engine)
    _migrate(engine)
    _seed_floors(engine)
    _seed_collections(engine)


def _seed_floors(engine) -> None:
    """Insert the three floors if they don't exist yet (idempotent)."""
    from sqlalchemy import text
    floors = [
        ("1",        "First Floor",  "storage"),
        ("2",        "Second Floor", "storage"),
        ("addition", "Addition",     "storage"),
    ]
    with engine.begin() as conn:
        for code, display_name, facility in floors:
            conn.execute(
                text(
                    "INSERT INTO floors (code, display_name, facility) "
                    "VALUES (:code, :name, :facility) "
                    "ON CONFLICT (code) DO NOTHING"
                ),
                {"code": code, "name": display_name, "facility": facility},
            )


def _seed_collections(engine) -> None:
    """Insert Morgan and Storage collections with their location codes (idempotent)."""
    from sqlalchemy import text

    seed_data = [
        {
            "name": "Morgan",
            "description": "Morgan Library collection",
            "call_number_type": "lc",
            "locations": [
                ("ms",  "Morgan"),
                ("msj", "Bound Journal"),
                ("msg", "Graphic Novels"),
                ("mso", "Oversize"),
                ("mr",  "Reference"),
                ("msu", "Chyac"),
            ],
        },
        {
            "name": "Storage",
            "description": "Storage facility collection",
            "call_number_type": "storage",
            "locations": [
                ("ssy", "Storage Access"),
            ],
        },
    ]

    with engine.begin() as conn:
        for col in seed_data:
            conn.execute(
                text(
                    "INSERT INTO collections (name, description, call_number_type) "
                    "VALUES (:name, :desc, :ctype) "
                    "ON CONFLICT (name) DO NOTHING"
                ),
                {"name": col["name"], "desc": col["description"], "ctype": col["call_number_type"]},
            )
            row = conn.execute(
                text("SELECT id FROM collections WHERE name = :name"),
                {"name": col["name"]},
            ).fetchone()
            if row:
                cid = row[0]
                for code, display_name in col["locations"]:
                    conn.execute(
                        text(
                            "INSERT INTO locations (collection_id, code, display_name) "
                            "VALUES (:cid, :code, :dname) "
                            "ON CONFLICT (code) DO NOTHING"
                        ),
                        {"cid": cid, "code": code, "dname": display_name},
                    )


def _migrate(engine) -> None:
    """Apply additive schema changes introduced after the initial create_all.

    Each entry must be idempotent (use IF NOT EXISTS / IF EXISTS guards).
    Add new entries at the bottom when a column or index is added to a model.
    """
    from sqlalchemy import text
    migrations: list[str] = [
        "ALTER TABLE floors ADD COLUMN IF NOT EXISTS facility VARCHAR(20) NOT NULL DEFAULT 'storage'",
        "ALTER TABLE ranges ADD COLUMN IF NOT EXISTS location_codes TEXT",
        "ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS range_side_id INTEGER REFERENCES range_sides(id) ON DELETE SET NULL",
    ]
    with engine.begin() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass


def reset_engine() -> None:
    """Force a new engine on next request (called after saving new DB URL)."""
    global _engine, _SessionLocal
    _engine = None
    _SessionLocal = None
