import os
import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

is_testing = (
    os.getenv("TESTING", "").lower() in ("1", "true", "yes")
    or "PYTEST_CURRENT_TEST" in os.environ
    or "pytest" in sys.modules
    or any("pytest" in arg for arg in sys.argv)
)

if is_testing:
    DB_PATH = Path(__file__).resolve().parent.parent / "test_dsa_tutor.db"
else:
    DB_PATH = Path(__file__).resolve().parent.parent / "dsa_tutor.db"

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 15}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
