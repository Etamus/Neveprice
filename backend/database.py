from pathlib import Path
import os
import re

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BACKEND_DIR / "precos.db"

load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _normalize_database_url(database_url):
    if not database_url:
        print(f"ATENCAO: Usando SQLite local em {DEFAULT_DB_PATH}")
        return _sqlite_url(DEFAULT_DB_PATH)

    if database_url.startswith("sqlite:///"):
        raw_path = database_url[len("sqlite:///"):]
        if raw_path.startswith("./"):
            raw_path = raw_path[2:]

        is_windows_absolute = re.match(r"^[A-Za-z]:/", raw_path) is not None
        is_posix_absolute = raw_path.startswith("/")
        if raw_path and not is_windows_absolute and not is_posix_absolute:
            return _sqlite_url((BACKEND_DIR / raw_path).resolve())

    return database_url


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL"))
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
