from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

from app.core.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    connect_args = (
        {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    )
    return create_engine(settings.database_url, connect_args=connect_args)
