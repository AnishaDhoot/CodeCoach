import os
import sys
from pathlib import Path
from sqlalchemy import create_engine, MetaData
from sqlalchemy.orm import declarative_base, sessionmaker

# Deterministic constraint names so Alembic can ALTER them on every backend —
# critically, SQLite batch mode (table-rebuild) requires named constraints.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

is_testing = (
    os.getenv("TESTING", "").lower() in ("1", "true", "yes")
    or "PYTEST_CURRENT_TEST" in os.environ
    or "pytest" in sys.modules
    or any("pytest" in arg for arg in sys.argv)
)


def _normalize_db_url(url: str) -> str:
    """Normalize a hosted Postgres URL to the driver SQLAlchemy expects.

    Managed providers (Render/Fly/Heroku/Railway) hand out `postgres://...`,
    but SQLAlchemy 2.x requires an explicit driver, e.g. `postgresql+psycopg2://`.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+" not in url.split("://", 1)[0]:
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


# Production/hosted: set DATABASE_URL (Postgres). Local dev & tests: SQLite file.
_env_db_url = os.getenv("DATABASE_URL", "").strip()

if _env_db_url and not is_testing:
    DATABASE_URL = _normalize_db_url(_env_db_url)
    _is_sqlite = DATABASE_URL.startswith("sqlite")
else:
    if is_testing:
        DB_PATH = Path(__file__).resolve().parent.parent / "test_dsa_tutor.db"
    else:
        DB_PATH = Path(__file__).resolve().parent.parent / "dsa_tutor.db"
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    _is_sqlite = True

# check_same_thread is a SQLite-only connect arg; Postgres pools handle threads natively.
if _is_sqlite:
    engine = create_engine(
        DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 15}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # drop dead connections (managed Postgres idles them out)
        pool_size=5,
        max_overflow=10,
    )

# Expose the dialect so callers (e.g. the in-place SQLite migration) can branch.
IS_SQLITE = _is_sqlite

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base(metadata=MetaData(naming_convention=NAMING_CONVENTION))

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
