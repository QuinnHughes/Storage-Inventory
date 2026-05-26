from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import get_database_url, save_database_url
from db.session import reset_engine, create_tables

router = APIRouter()


class SettingsRead(BaseModel):
    configured: bool
    # We never expose the full URL to the client; return a masked version.
    url_masked: str | None = None


class SettingsUpdate(BaseModel):
    database_url: str


def _mask_url(url: str) -> str:
    """Replace password in a postgres URL with *** for display."""
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(url)
        if parsed.password:
            masked = parsed._replace(
                netloc=f"{parsed.username}:***@{parsed.hostname}"
                       + (f":{parsed.port}" if parsed.port else "")
            )
            return urlunparse(masked)
    except Exception:
        pass
    return url[:8] + "***" if len(url) > 8 else "***"


@router.get("", response_model=SettingsRead)
def get_settings():
    url = get_database_url()
    if url:
        return SettingsRead(configured=True, url_masked=_mask_url(url))
    return SettingsRead(configured=False, url_masked=None)


@router.put("", status_code=200)
def save_settings(data: SettingsUpdate):
    url = data.database_url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="database_url cannot be empty")

    save_database_url(url)
    reset_engine()

    # Create tables immediately so the DB is ready to use
    try:
        create_tables()
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Settings saved but could not connect to the database: {exc}"
        )

    return {"success": True, "message": "Database URL saved and tables initialised."}
