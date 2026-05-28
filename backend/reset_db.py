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

    from sqlalchemy.orm import Session
    from db.models import ResolutionOption
    default_options = [
        ("Reshelved",            "Item was found and put back in the correct location.",     0),
        ("Sent to Cataloging",   "Item was pulled and sent to cataloging for review.",        1),
        ("Flagged for Review",   "Item was flagged for follow-up by a supervisor.",           2),
        ("Withdrawn",            "Item was withdrawn from the collection.",                   3),
        ("No Action Needed",     "Discrepancy reviewed but no physical action was required.", 4),
    ]
    with Session(engine) as seed_session:
        for name, desc, order in default_options:
            seed_session.add(ResolutionOption(name=name, description=desc, sort_order=order))
        seed_session.commit()

    print("Done — schema is clean and seed data inserted.")


if __name__ == "__main__":
    main()
