import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_api_prefix_validation() -> None:
    with pytest.raises(ValidationError):
        Settings(api_prefix="api/v1")

    with pytest.raises(ValidationError):
        Settings(api_prefix="/api/v1/")


def test_log_level_is_normalized() -> None:
    assert Settings(log_level="debug").log_level == "DEBUG"
