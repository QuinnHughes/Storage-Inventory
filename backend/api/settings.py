from fastapi import APIRouter
from pydantic import BaseModel

from config import get_database_url

router = APIRouter()


class SettingsRead(BaseModel):
    configured: bool
    source: str
    message: str


@router.get("", response_model=SettingsRead)
def get_settings():
    url = get_database_url()
    if url:
        return SettingsRead(
            configured=True,
            source="environment",
            message="Database connection is configured via the backend environment or .env file.",
        )
    return SettingsRead(
        configured=False,
        source="unset",
        message="Database connection is not configured. Set DATABASE_URL in backend/.env or the server environment.",
    )
