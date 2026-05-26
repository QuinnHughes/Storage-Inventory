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
        ("1",        "First Floor"),
        ("2",        "Second Floor"),
        ("addition", "Addition"),
    ]
    with engine.begin() as conn:
        for code, display_name in floors:
            conn.execute(
                text(
                    "INSERT INTO floors (code, display_name) "
                    "VALUES (:code, :name) "
                    "ON CONFLICT (code) DO NOTHING"
                ),
                {"code": code, "name": display_name},
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
    """Add columns that were introduced after the initial schema creation."""
    from sqlalchemy import text
    migrations = [
        # sections: new columns added when sessions were removed
        "ALTER TABLE sections ADD COLUMN IF NOT EXISTS status    VARCHAR NOT NULL DEFAULT 'pending'",
        "ALTER TABLE sections ADD COLUMN IF NOT EXISTS ils_count  INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE sections ADD COLUMN IF NOT EXISTS scan_count INTEGER NOT NULL DEFAULT 0",
        # child tables: rename session_id → section_id if the old column still exists
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ils_records'   AND column_name='session_id') THEN ALTER TABLE ils_records   RENAME COLUMN session_id TO section_id; END IF; END $$",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scan_records'  AND column_name='session_id') THEN ALTER TABLE scan_records  RENAME COLUMN session_id TO section_id; END IF; END $$",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discrepancies' AND column_name='session_id') THEN ALTER TABLE discrepancies RENAME COLUMN session_id TO section_id; END IF; END $$",
        # Drop old FK constraints that point to inventory_sessions, add new ones pointing to sections
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='ils_records_session_id_fkey')   THEN ALTER TABLE ils_records   DROP CONSTRAINT ils_records_session_id_fkey;   END IF; END $$",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='scan_records_session_id_fkey')  THEN ALTER TABLE scan_records  DROP CONSTRAINT scan_records_session_id_fkey;  END IF; END $$",
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='discrepancies_session_id_fkey') THEN ALTER TABLE discrepancies DROP CONSTRAINT discrepancies_session_id_fkey; END IF; END $$",
        # Add correct FK constraints to sections if they don't exist yet
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='ils_records_section_id_fkey')   THEN ALTER TABLE ils_records   ADD CONSTRAINT ils_records_section_id_fkey   FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE; END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='scan_records_section_id_fkey')  THEN ALTER TABLE scan_records  ADD CONSTRAINT scan_records_section_id_fkey  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE; END IF; END $$",
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='discrepancies_section_id_fkey') THEN ALTER TABLE discrepancies ADD CONSTRAINT discrepancies_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE; END IF; END $$",
        # map_shapes: new columns added with piece-template and group features
        "ALTER TABLE map_shapes ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES piece_templates(id) ON DELETE SET NULL",
        "ALTER TABLE map_shapes ADD COLUMN IF NOT EXISTS group_id    INTEGER REFERENCES shape_groups(id)    ON DELETE SET NULL",
        # ils_records: add location_id for new architecture (existing rows will need backfill)
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS barcode          VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS call_number      VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS title            TEXT",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS status           VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS lifecycle        VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS location_code    VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS location_name    VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS location_id      INTEGER REFERENCES locations(id) ON DELETE RESTRICT",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS call_number_norm VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS item_call_number VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS item_policy      VARCHAR",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS description      TEXT",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS author           TEXT",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS fulfillment_note TEXT",
        "ALTER TABLE ils_records ADD COLUMN IF NOT EXISTS uploaded_at      TIMESTAMPTZ DEFAULT now()",
    ]
    with engine.begin() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
            except Exception:
                pass  # column already exists or table doesn't exist yet


def reset_engine() -> None:
    """Force a new engine on next request (called after saving new DB URL)."""
    global _engine, _SessionLocal
    _engine = None
    _SessionLocal = None
