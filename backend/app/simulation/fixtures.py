import json
import math
from dataclasses import asdict
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np

from app.schemas.enums import DatasetOrigin, SamplingKind, SignalKind
from app.schemas.simulations import SimulationRequest
from app.simulation.hashing import (
    canonical_json_sha256,
    compute_file_sha256,
    compute_signal_sha256,
)
from app.simulation.noise import measure_signal_power
from app.simulation.types import (
    AnalysisSignalInput,
    FixtureValidationReport,
    JsonObject,
    NoiseReport,
    SimulationResult,
    SimulationTruth,
)

MANIFEST_NAME = "manifest.json"
ANALYSIS_METADATA = "analysis/metadata.json"
ANALYSIS_ARRAYS = "analysis/arrays.npz"
TRUTH_METADATA = "truth/metadata.json"
TRUTH_ARRAYS = "truth/arrays.npz"
TRUTH_ONLY_FIELDS = {
    "model_id",
    "parameters",
    "random_seed",
    "clean_values",
    "noise_values",
    "truth",
}


def _atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    try:
        temporary.write_bytes(content)
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _write_json(path: Path, payload: Any) -> None:
    content = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    _atomic_write(path, content.encode("utf-8"))


def _write_npz(path: Path, **arrays: np.ndarray[Any, Any]) -> None:
    buffer = BytesIO()
    np.savez(buffer, allow_pickle=False, **arrays)
    _atomic_write(path, buffer.getvalue())


def _read_json(path: Path) -> JsonObject:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected a JSON object: {path}")
    return payload


def _safe_fixture_path(fixture_dir: Path, relative_path: str) -> Path:
    root = fixture_dir.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("fixture path escapes the fixture directory") from exc
    return candidate


def _analysis_metadata(result: SimulationResult) -> JsonObject:
    signal = result.analysis_input
    return {
        "schema_version": "1.0.0",
        "origin": signal.origin.value,
        "signal_kind": signal.signal_kind.value,
        "sampling_kind": signal.sampling_kind.value,
        "sample_rate_hz": signal.sample_rate_hz,
        "amplitude_unit": signal.amplitude_unit,
        "phase_reference_s": signal.phase_reference_s,
        "source_sha256": signal.source_sha256,
    }


def write_simulation_fixture(result: SimulationResult, fixture_dir: Path) -> JsonObject:
    if fixture_dir.exists() and any(fixture_dir.iterdir()):
        raise FileExistsError("fixture directory must be empty or absent")

    _write_npz(
        fixture_dir / ANALYSIS_ARRAYS,
        values=result.analysis_input.values,
        time_s=result.analysis_input.time_s,
    )
    _write_json(fixture_dir / ANALYSIS_METADATA, _analysis_metadata(result))

    truth_metadata = {
        "schema_version": "1.0.0",
        "config": result.truth.config.model_dump(mode="json"),
        "model_version": result.truth.model_version,
        "generator_version": result.truth.generator_version,
        "noise": asdict(result.truth.noise),
    }
    _write_json(fixture_dir / TRUTH_METADATA, truth_metadata)
    _write_npz(
        fixture_dir / TRUTH_ARRAYS,
        clean_values=result.truth.clean_values,
        noise_values=result.truth.noise_values,
        kept_indices=result.truth.kept_indices,
    )

    relative_files = [ANALYSIS_METADATA, ANALYSIS_ARRAYS, TRUTH_METADATA, TRUTH_ARRAYS]
    manifest = {
        "schema_version": "1.0.0",
        "generator_version": result.truth.generator_version,
        "analysis_source_sha256": result.analysis_input.source_sha256,
        "truth_metadata_sha256": canonical_json_sha256(truth_metadata),
        "files": {
            relative_path: compute_file_sha256(fixture_dir / relative_path)
            for relative_path in relative_files
        },
    }
    _write_json(fixture_dir / MANIFEST_NAME, manifest)
    return manifest


def _validate_analysis_arrays(signal: AnalysisSignalInput) -> None:
    if signal.values.ndim != 1 or signal.time_s.ndim != 1:
        raise ValueError("fixture arrays must be one-dimensional")
    if signal.values.shape != signal.time_s.shape:
        raise ValueError("fixture values and time must have matching shapes")
    if signal.values.size < 64:
        raise ValueError("fixture must contain at least 64 samples")
    if not np.all(np.isfinite(signal.values)) or not np.all(np.isfinite(signal.time_s)):
        raise ValueError("fixture arrays must be finite")
    if np.any(np.diff(signal.time_s) <= 0):
        raise ValueError("fixture time must be strictly increasing")
    if signal.sampling_kind == SamplingKind.UNIFORM and (
        signal.sample_rate_hz is None or signal.sample_rate_hz <= 0
    ):
        raise ValueError("uniform fixture requires a positive sample rate")
    if signal.sampling_kind != SamplingKind.UNIFORM and signal.sample_rate_hz is not None:
        raise ValueError("nonuniform fixture must not define a uniform sample rate")
    if signal.signal_kind == SignalKind.REAL and np.iscomplexobj(signal.values):
        raise ValueError("real fixture must not contain complex values")
    if signal.signal_kind != SignalKind.REAL and not np.iscomplexobj(signal.values):
        raise ValueError("complex fixture requires complex values")
    if compute_signal_sha256(signal.values, signal.time_s) != signal.source_sha256:
        raise ValueError("fixture source hash does not match arrays")


def read_analysis_fixture(fixture_dir: Path) -> AnalysisSignalInput:
    metadata = _read_json(_safe_fixture_path(fixture_dir, ANALYSIS_METADATA))
    forbidden = TRUTH_ONLY_FIELDS.intersection(metadata)
    if forbidden:
        raise ValueError(f"analysis metadata contains truth fields: {sorted(forbidden)}")
    with np.load(_safe_fixture_path(fixture_dir, ANALYSIS_ARRAYS), allow_pickle=False) as arrays:
        values = np.asarray(arrays["values"])
        time_s = np.asarray(arrays["time_s"], dtype=np.float64)
    values.setflags(write=False)
    time_s.setflags(write=False)
    signal = AnalysisSignalInput(
        values=values,
        time_s=time_s,
        sample_rate_hz=metadata["sample_rate_hz"],
        signal_kind=SignalKind(metadata["signal_kind"]),
        sampling_kind=SamplingKind(metadata["sampling_kind"]),
        amplitude_unit=metadata["amplitude_unit"],
        phase_reference_s=metadata["phase_reference_s"],
        origin=DatasetOrigin(metadata["origin"]),
        source_sha256=metadata["source_sha256"],
    )
    _validate_analysis_arrays(signal)
    return signal


def read_simulation_truth(fixture_dir: Path) -> SimulationTruth:
    metadata = _read_json(_safe_fixture_path(fixture_dir, TRUTH_METADATA))
    with np.load(_safe_fixture_path(fixture_dir, TRUTH_ARRAYS), allow_pickle=False) as arrays:
        clean_values = np.asarray(arrays["clean_values"])
        noise_values = np.asarray(arrays["noise_values"])
        kept_indices = np.asarray(arrays["kept_indices"], dtype=np.int64)
    for array in (clean_values, noise_values, kept_indices):
        array.setflags(write=False)
    if clean_values.shape != noise_values.shape or clean_values.shape != kept_indices.shape:
        raise ValueError("truth arrays must have matching shapes")
    return SimulationTruth(
        config=SimulationRequest.model_validate(metadata["config"]),
        model_version=metadata["model_version"],
        generator_version=metadata["generator_version"],
        noise=NoiseReport(**metadata["noise"]),
        clean_values=clean_values,
        noise_values=noise_values,
        kept_indices=kept_indices,
    )


def validate_simulation_fixture(fixture_dir: Path) -> FixtureValidationReport:
    errors: list[str] = []
    checked_files = 0
    try:
        manifest = _read_json(_safe_fixture_path(fixture_dir, MANIFEST_NAME))
        files = manifest["files"]
        if not isinstance(files, dict):
            raise ValueError("fixture manifest files must be an object")
        for relative_path, expected_hash in files.items():
            path = _safe_fixture_path(fixture_dir, relative_path)
            checked_files += 1
            if compute_file_sha256(path) != expected_hash:
                errors.append(f"file hash mismatch: {relative_path}")
        signal = read_analysis_fixture(fixture_dir)
        if signal.source_sha256 != manifest["analysis_source_sha256"]:
            errors.append("analysis source hash mismatch with manifest")
        truth = read_simulation_truth(fixture_dir)
        if not np.array_equal(
            signal.values,
            truth.clean_values + truth.noise_values,
        ):
            errors.append("analysis values do not equal clean signal plus noise")
        if truth.noise.target_snr_db != truth.config.snr_db:
            errors.append("noise report target SNR does not match simulation config")
        if truth.config.snr_db is not None:
            noise_power = measure_signal_power(truth.noise_values)
            if noise_power <= 0:
                errors.append("finite-SNR fixture requires nonzero noise power")
            else:
                actual_snr = 10.0 * math.log10(
                    measure_signal_power(truth.clean_values) / noise_power
                )
                if truth.noise.actual_snr_db is None or not math.isclose(
                    actual_snr,
                    truth.noise.actual_snr_db,
                    rel_tol=1e-12,
                    abs_tol=1e-12,
                ):
                    errors.append("noise report actual SNR is not reproducible")
        if (
            canonical_json_sha256(
                {
                    "schema_version": "1.0.0",
                    "config": truth.config.model_dump(mode="json"),
                    "model_version": truth.model_version,
                    "generator_version": truth.generator_version,
                    "noise": asdict(truth.noise),
                }
            )
            != manifest["truth_metadata_sha256"]
        ):
            errors.append("truth metadata hash mismatch with manifest")
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(str(exc))
    return FixtureValidationReport(
        valid=not errors,
        errors=errors,
        checked_files=checked_files,
    )
