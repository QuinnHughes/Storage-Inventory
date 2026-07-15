"""
Reads the PostgreSQL connection URL from environment variables or a backend .env file.

Priority:
1. Environment variable DATABASE_URL
2. backend/.env
3. project-root .env
"""
import os
from pathlib import Path


def _load_env_file() -> None:
    """Populate os.environ from a backend or project-root .env file if present."""
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parent.parent / ".env",
    ]
    for env_path in candidates:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        break


_load_env_file()


def get_database_url() -> str | None:
    """Return the DATABASE_URL string, or None if not yet configured."""
    return os.environ.get("DATABASE_URL")


def save_database_url(url: str) -> None:
    """Persist DATABASE_URL to backend/.env for server-side configuration."""
    env_path = Path(__file__).resolve().parent / ".env"
    env_path.write_text(f"DATABASE_URL={url}\n", encoding="utf-8")
    os.environ["DATABASE_URL"] = url
