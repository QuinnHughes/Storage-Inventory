#!/usr/bin/env python3
"""
Drop every table in the configured database and reinitialise
the schema from the current SQLAlchemy models.

Run from the backend directory:
    python reset_db.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from config import get_database_url
from sqlalchemy import create_engine


def main() -> None:
    url = get_database_url()
    if not url:
        print("ERROR: No database URL configured. Save your connection in the app Settings first.")
        sys.exit(1)

    engine = create_engine(url)

    print("Dropping public schema (removes all tables and sequences)…")
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
    print("Schema cleared.")

    print("Recreating schema and seeding default data…")
    from db.session import create_tables
    create_tables()
    print("Done — schema is clean and seed data inserted.")


if __name__ == "__main__":
    main()
