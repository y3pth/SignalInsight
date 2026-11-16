import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np

from app.simulation.types import FloatArray, SignalArray


def _update_array(digest: Any, values: np.ndarray) -> None:
    array = np.ascontiguousarray(values)
    array = array.astype(array.dtype.newbyteorder("<"), copy=False)
    digest.update(str(array.dtype).encode("ascii"))
    digest.update(str(array.shape).encode("ascii"))
    digest.update(array.tobytes())


def compute_signal_sha256(values: SignalArray, time_s: FloatArray) -> str:
    digest = hashlib.sha256(b"SignalInsight\0")
    _update_array(digest, values)
    _update_array(digest, time_s)
    return digest.hexdigest()


def canonical_json_sha256(payload: Any) -> str:
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def compute_file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
