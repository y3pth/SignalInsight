from sqlalchemy import text

from app.core.config import Settings
from app.db import create_database_engine


def test_sqlite_connection() -> None:
    engine = create_database_engine(Settings(database_url="sqlite:///:memory:"))
    try:
        with engine.connect() as connection:
            assert connection.execute(text("SELECT 1")).scalar_one() == 1
    finally:
        engine.dispose()
