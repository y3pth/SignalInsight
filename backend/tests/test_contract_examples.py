import json

import pytest
from pydantic import TypeAdapter, ValidationError

from app.contracts.examples import (
    EXAMPLES_DIR,
    analysis_request,
    analysis_result,
    dataset_mapping,
    payloads,
)
from app.schemas.analysis import AnalysisRequest, AnalysisResult
from app.schemas.datasets import DatasetMapping


@pytest.mark.parametrize("name", sorted(payloads()))
def test_example_payloads_validate(name: str) -> None:
    model, payload = payloads()[name]
    TypeAdapter(model).validate_python(payload)


@pytest.mark.parametrize("name", sorted(payloads()))
def test_generated_examples_match_source(name: str) -> None:
    _, expected = payloads()[name]
    actual = json.loads((EXAMPLES_DIR / f"{name}.json").read_text(encoding="utf-8"))
    assert actual == expected


def test_specified_analysis_requires_models() -> None:
    payload = analysis_request()
    payload["candidate_models"] = []
    with pytest.raises(ValidationError):
        TypeAdapter(AnalysisRequest).validate_python(payload)


def test_mapping_requires_sampling_source() -> None:
    payload = dataset_mapping()
    payload["time"] = None
    payload["sample_rate_hz"] = None
    with pytest.raises(ValidationError):
        TypeAdapter(DatasetMapping).validate_python(payload)


def test_unknown_fields_are_rejected() -> None:
    payload = analysis_request()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        TypeAdapter(AnalysisRequest).validate_python(payload)


def test_non_finite_numbers_are_rejected() -> None:
    payload = analysis_request()
    payload["analysis_config"]["max_tones"] = float("nan")
    with pytest.raises(ValidationError):
        TypeAdapter(AnalysisRequest).validate_python(payload)


def test_result_source_hash_must_match_manifest() -> None:
    payload = analysis_result()
    payload["source_sha256"] = "b" * 64
    with pytest.raises(ValidationError):
        TypeAdapter(AnalysisResult).validate_python(payload)


def test_unknown_state_must_be_consistent() -> None:
    payload = analysis_result()
    payload["reliability"]["is_unknown"] = True
    with pytest.raises(ValidationError):
        TypeAdapter(AnalysisResult).validate_python(payload)


def test_succeeded_run_requires_result() -> None:
    model, payload = payloads()["analysis_run_detail"]
    payload["result"] = None
    with pytest.raises(ValidationError):
        TypeAdapter(model).validate_python(payload)
