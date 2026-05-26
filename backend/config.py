"""
Reads the PostgreSQL connection URL from:
  1. %APPDATA%\\StorageInventory\\config.ini  (installed app)
  2. Environment variable DATABASE_URL         (dev override)
"""
import configparser
import os
from pathlib import Path


CONFIG_DIR  = Path(os.environ.get("APPDATA", Path.home())) / "StorageInventory"
CONFIG_FILE = CONFIG_DIR / "config.ini"


def get_database_url() -> str | None:
    """Return the DATABASE_URL string, or None if not yet configured."""
    # Dev override
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return env_url

    if CONFIG_FILE.exists():
        cfg = configparser.ConfigParser()
        cfg.read(CONFIG_FILE)
        return cfg.get("database", "url", fallback=None)

    return None


def save_database_url(url: str) -> None:
    """Persist a DATABASE_URL to config.ini."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    cfg = configparser.ConfigParser()
    if CONFIG_FILE.exists():
        cfg.read(CONFIG_FILE)
    if "database" not in cfg:
        cfg["database"] = {}
    cfg["database"]["url"] = url
    with open(CONFIG_FILE, "w") as f:
        cfg.write(f)
