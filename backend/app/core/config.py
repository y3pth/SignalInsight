from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SIGNALINSIGHT_",
        env_file=".env",
        extra="ignore",
    )

    app_name: str = "SignalInsight"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    log_level: str = "INFO"
    data_dir: Path = Path("../data")
    database_url: str = "sqlite:///../data/signalinsight.db"

    @field_validator("api_prefix")
    @classmethod
    def validate_api_prefix(cls, value: str) -> str:
        if not value.startswith("/") or value == "/" or value.endswith("/"):
            raise ValueError("api_prefix must start with '/' and must not end with '/'")
        return value

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        level = value.upper()
        if level not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
            raise ValueError("unsupported log level")
        return level


@lru_cache
def get_settings() -> Settings:
    return Settings()
