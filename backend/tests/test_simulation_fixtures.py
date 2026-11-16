import json
from pathlib import Path

import numpy as np
import pytest

from app.simulation.fixtures import (
    read_analysis_fixture,
    read_simulation_truth,
    validate_simulation_fixture,
    write_simulation_fixture,
)
from app.simulation.types import SimulationResult


def test_fixture_round_trip_and_validation(
    tmp_path: Path, simulation_result: SimulationResult
) -> None:
    fixture_dir = tmp_path / "fixture"
    write_simulation_fixture(simulation_result, fixture_dir)

    report = validate_simulation_fixture(fixture_dir)
    signal = read_analysis_fixture(fixture_dir)
    truth = read_simulation_truth(fixture_dir)

    assert report.valid, report.errors
    assert report.checked_files == 4
    assert np.array_equal(signal.values, simulation_result.analysis_input.values)
    assert signal.source_sha256 == simulation_result.analysis_input.source_sha256
    assert not hasattr(signal, "model_id")
    assert truth.config.model_id == simulation_result.truth.config.model_id
    assert np.array_equal(truth.clean_values, simulation_result.truth.clean_values)


def test_tampered_fixture_is_detected(tmp_path: Path, simulation_result: SimulationResult) -> None:
    fixture_dir = tmp_path / "fixture"
    write_simulation_fixture(simulation_result, fixture_dir)
    with (fixture_dir / "analysis" / "arrays.npz").open("ab") as file:
        file.write(b"tampered")

    report = validate_simulation_fixture(fixture_dir)

    assert not report.valid
    assert any("hash mismatch" in error for error in report.errors)


def test_fixture_rejects_path_escape(tmp_path: Path, simulation_result: SimulationResult) -> None:
    fixture_dir = tmp_path / "fixture"
    manifest = write_simulation_fixture(simulation_result, fixture_dir)
    manifest["files"]["../escape"] = "0" * 64
    (fixture_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    report = validate_simulation_fixture(fixture_dir)

    assert not report.valid
    assert any("escapes" in error for error in report.errors)


def test_existing_fixture_is_not_overwritten(
    tmp_path: Path, simulation_result: SimulationResult
) -> None:
    fixture_dir = tmp_path / "fixture"
    write_simulation_fixture(simulation_result, fixture_dir)

    with pytest.raises(FileExistsError):
        write_simulation_fixture(simulation_result, fixture_dir)
