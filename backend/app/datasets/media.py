from pathlib import Path

from app.schemas.enums import DatasetMediaType

HDF5_MAGIC = b"\x89HDF\r\n\x1a\n"
EXTENSION_MEDIA_TYPES = {
    ".csv": DatasetMediaType.CSV,
    ".mat": DatasetMediaType.MAT,
}


def safe_original_filename(filename: str | None) -> str | None:
    if not filename:
        return None
    name = Path(filename).name
    if not name or len(name) > 512:
        return None
    return name


def detect_media_type(filename: str, head: bytes) -> DatasetMediaType | None:
    extension = Path(filename).suffix.lower()
    if extension == ".mat" and head.startswith(HDF5_MAGIC):
        return DatasetMediaType.MAT_V7_3
    return EXTENSION_MEDIA_TYPES.get(extension)
