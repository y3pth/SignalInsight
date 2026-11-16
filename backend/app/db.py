from collections.abc import Iterator
from functools import lru_cache

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    connect_args = (
        {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    )
    engine = create_engine(settings.database_url, connect_args=connect_args)
    if engine.url.get_backend_name() == "sqlite":

        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection: object, connection_record: object) -> None:
            cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


@lru_cache
def engine_for_url(database_url: str) -> Engine:
    return create_database_engine(Settings(database_url=database_url))


@lru_cache
def session_factory_for_url(database_url: str) -> sessionmaker[Session]:
    return sessionmaker(bind=engine_for_url(database_url), expire_on_commit=False)


def get_session(request: Request) -> Iterator[Session]:
    factory = session_factory_for_url(request.app.state.settings.database_url)
    with factory() as session:
        yield session
