import json
from pathlib import Path
from typing import Any

from app.schemas.analysis import (
    AnalysisBatchAccepted,
    AnalysisRequest,
    AnalysisResult,
    AnalysisRunAccepted,
    AnalysisRunDetail,
)
from app.schemas.capabilities import CapabilitiesResponse, ModelDefinition
from app.schemas.common import ErrorResponse
from app.schemas.datasets import DatasetManifest, DatasetMapping
from app.schemas.explanations import ExplanationRecord
from app.schemas.health import HealthResponse
from app.schemas.series import SeriesResponse
from app.schemas.simulations import SimulationRequest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
EXAMPLES_DIR = PROJECT_ROOT / "contracts" / "examples" / "backend"

DATASET_ID = "11111111-1111-4111-8111-111111111111"
ANALYSIS_ID = "22222222-2222-4222-8222-222222222222"
BATCH_ID = "33333333-3333-4333-8333-333333333333"
EXPLANATION_ID = "44444444-4444-4444-8444-444444444444"
SIMULATION_ID = "55555555-5555-4555-8555-555555555555"
SHA256 = "a" * 64
CREATED_AT = "2026-01-01T00:00:00Z"
COMPLETED_AT = "2026-01-01T00:00:02Z"


def dataset_mapping() -> dict[str, Any]:
    return {
        "time": {"variable_id": "time", "column": "time"},
        "sample_rate_hz": 1024.0,
        "channels": [
            {
                "channel_id": "ch_1",
                "label": "Channel 1",
                "signal_kind": "real",
                "value": {"variable_id": "values", "column": "ch_1"},
                "imaginary_value": None,
                "complex_layout": "single_complex_variable",
            }
        ],
        "sample_axis": 0,
        "amplitude_unit": "a.u.",
        "phase_reference_s": 0.0,
    }


def dataset_manifest() -> dict[str, Any]:
    mapping = dataset_mapping()
    return {
        "dataset_id": DATASET_ID,
        "original_filename": "single_tone.csv",
        "media_type": "csv",
        "origin": "upload",
        "source_sha256": SHA256,
        "file_size_bytes": 1024,
        "total_numeric_count": 2048,
        "variables": [
            {
                "variable_id": "time",
                "variable_path": "time",
                "data_type": "float64",
                "shape": [1024],
                "is_complex": False,
                "estimated_numeric_count": 1024,
                "supported": True,
                "unsupported_reason": None,
            },
            {
                "variable_id": "values",
                "variable_path": "values",
                "data_type": "float64",
                "shape": [1024, 1],
                "is_complex": False,
                "estimated_numeric_count": 1024,
                "supported": True,
                "unsupported_reason": None,
            },
        ],
        "channels": [
            {
                "channel_id": "ch_1",
                "label": "Channel 1",
                "sample_count": 1024,
                "signal_kind": "real",
                "sampling_kind": "uniform",
                "sample_rate_hz": 1024.0,
                "duration_s": 1.0,
                "amplitude_unit": "a.u.",
                "quality_flags": [],
            }
        ],
        "detected_mappings": [
            {
                "mapping": mapping,
                "reasons": ["monotonic_time_column", "single_numeric_channel"],
                "requires_confirmation": True,
            }
        ],
        "confirmed_mapping": mapping,
        "validation_summary": {"valid": True, "issues": []},
        "metadata": {},
        "created_at": CREATED_AT,
    }


def analysis_request() -> dict[str, Any]:
    return {
        "dataset_id": DATASET_ID,
        "channel_ids": ["ch_1"],
        "mode": "specified",
        "candidate_models": ["single_tone"],
        "preprocessing": {"missing_policy": "reject", "detrend": "none", "steps": []},
        "analysis_config": {
            "max_tones": 8,
            "random_seed": 42,
            "uncertainty_methods": ["asymptotic", "multi_start"],
        },
        "explanation_policy": "after_analysis",
        "client_request_id": "example-request-0001",
    }


def artifact() -> dict[str, Any]:
    return {
        "artifact_id": "fit-single-tone",
        "artifact_type": "fitted_series",
        "media_type": "application/octet-stream",
        "download_path": (
            f"/api/v1/analysis-runs/{ANALYSIS_ID}/series?series_kind=fit&model_id=single_tone"
        ),
        "size_bytes": 4096,
        "sha256": SHA256,
    }


def analysis_result(*, unknown: bool = False) -> dict[str, Any]:
    evidence = {
        "evidence_id": "ev_peak_count",
        "category": "feature",
        "code": "SPECTRAL_PEAK_COUNT",
        "value": 0 if unknown else 1,
        "unit": "count",
        "threshold": {"minimum": 1},
        "source_artifact": "spectrum",
        "description_key": "features.spectral_peak_count",
    }
    recommendation = {
        "recommended_model": None if unknown else "single_tone",
        "unknown": unknown,
        "reason_codes": ["OUT_OF_LIBRARY"] if unknown else ["RESIDUAL_ACCEPTABLE"],
        "evidence_refs": ["ev_peak_count"],
        "rankings": []
        if unknown
        else [
            {
                "model_id": "single_tone",
                "rank": 1,
                "rmse": 0.003125,
                "aic": -1000.0,
                "bic": -990.0,
                "eligible": True,
            }
        ],
    }
    reliability = {
        "level": "insufficient_evidence" if unknown else "reliable",
        "is_unknown": unknown,
        "reason_codes": ["OUT_OF_LIBRARY"] if unknown else ["PARAMETERS_STABLE"],
        "evidence_refs": ["ev_peak_count"],
        "limitations": ["No registered model explains the signal."]
        if unknown
        else ["Conclusion is limited to the registered candidate set."],
        "recommended_actions": ["COLLECT_MORE_DATA"] if unknown else [],
        "rule_set_version": "1.0.0",
    }
    candidates = []
    if not unknown:
        candidates.append(
            {
                "model_id": "single_tone",
                "model_version": "1.0.0",
                "signal_kind": "real",
                "expression_id": "real_single_tone_v1",
                "parameters": [
                    {
                        "parameter_id": "amplitude",
                        "name": "Amplitude",
                        "value": 2.0,
                        "unit": "a.u.",
                        "standard_error": 0.001,
                        "ci95": [1.998, 2.002],
                        "estimable": True,
                        "bounds": [0.0, None],
                        "at_bound": False,
                        "phase_reference_s": None,
                        "metadata": {},
                    },
                    {
                        "parameter_id": "frequency",
                        "name": "Frequency",
                        "value": 100.0,
                        "unit": "Hz",
                        "standard_error": 0.0001,
                        "ci95": [99.9998, 100.0002],
                        "estimable": True,
                        "bounds": [0.0, 512.0],
                        "at_bound": False,
                        "phase_reference_s": None,
                        "metadata": {},
                    },
                    {
                        "parameter_id": "phase",
                        "name": "Phase",
                        "value": 0.3,
                        "unit": "rad",
                        "standard_error": 0.001,
                        "ci95": [0.298, 0.302],
                        "estimable": True,
                        "bounds": [-3.141592653589793, 3.141592653589793],
                        "at_bound": False,
                        "phase_reference_s": 0.0,
                        "metadata": {},
                    },
                    {
                        "parameter_id": "offset",
                        "name": "Offset",
                        "value": 0.1,
                        "unit": "a.u.",
                        "standard_error": 0.0001,
                        "ci95": [0.0998, 0.1002],
                        "estimable": True,
                        "bounds": [None, None],
                        "at_bound": False,
                        "phase_reference_s": None,
                        "metadata": {},
                    },
                ],
                "free_parameter_count": 4,
                "optimizer": {
                    "name": "least_squares",
                    "success": True,
                    "status_code": "converged",
                    "message": "Optimization converged.",
                    "iterations": 12,
                    "initial_value": 1.0,
                    "final_value": 0.01,
                    "multistart_count": 2,
                },
                "metrics": {
                    "rss": 0.01,
                    "rmse": 0.003125,
                    "r2": 0.9999,
                    "aic": -1000.0,
                    "bic": -990.0,
                    "sample_count": 1024,
                    "free_parameter_count": 4,
                },
                "residual_summary": {
                    "mean": 0.0,
                    "std": 0.003125,
                    "rms": 0.003125,
                    "lag1_autocorr": 0.01,
                    "max_abs_acf": 0.04,
                    "dominant_residual_frequency_hz": None,
                    "diagnostics": {},
                },
                "uncertainty": {
                    "methods": ["asymptotic", "multi_start"],
                    "covariance_artifact": None,
                    "condition_number": 12.5,
                    "rank": 4,
                    "notes": [],
                },
                "artifacts": [artifact()],
                "warnings": [],
                "evidence": [evidence],
            }
        )
    return {
        "analysis_id": ANALYSIS_ID,
        "input_manifest": dataset_manifest(),
        "source_sha256": SHA256,
        "algorithm_version": "0.1.0",
        "features": {"dominant_frequency_hz": None if unknown else 100.0},
        "candidate_results": candidates,
        "recommendation": recommendation,
        "reliability": reliability,
        "warnings": [],
        "artifacts": [] if unknown else [artifact()],
        "created_at": COMPLETED_AT,
    }


def model_definitions() -> list[dict[str, Any]]:
    parameters = {
        "single_tone": ["amplitude", "frequency", "phase", "offset"],
        "multi_tone": ["frequencies", "amplitudes", "phases", "offset"],
        "am": [
            "carrier_amplitude",
            "carrier_frequency",
            "modulation_frequency",
            "modulation_index",
        ],
        "fm": [
            "carrier_amplitude",
            "carrier_frequency",
            "modulation_frequency",
            "frequency_deviation",
        ],
    }
    units = {
        "amplitude": "a.u.",
        "frequencies": "Hz",
        "amplitudes": "a.u.",
        "phases": "rad",
        "offset": "a.u.",
        "frequency": "Hz",
        "phase": "rad",
        "carrier_amplitude": "a.u.",
        "carrier_frequency": "Hz",
        "modulation_frequency": "Hz",
        "modulation_index": "ratio",
        "frequency_deviation": "Hz",
    }
    return [
        {
            "model_id": model_id,
            "model_version": "1.0.0",
            "expression_id": f"real_{model_id}_v1",
            "display_name": model_id.replace("_", " ").title(),
            "supported_signal_kinds": ["real"],
            "supported_sampling_kinds": ["uniform", "nonuniform"],
            "enabled": True,
            "parameters": [
                {
                    "parameter_id": parameter,
                    "name": parameter.replace("_", " ").title(),
                    "unit": units[parameter],
                    "description": f"Estimated {parameter.replace('_', ' ')}.",
                    "bounds": [None, None],
                }
                for parameter in model_parameters
            ],
        }
        for model_id, model_parameters in parameters.items()
    ]


def payloads() -> dict[str, tuple[Any, Any]]:
    return {
        "health_success": (
            HealthResponse,
            {"status": "ok", "service": "SignalInsight", "version": "0.1.0", "environment": "test"},
        ),
        "error_validation": (
            ErrorResponse,
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed.",
                    "details": {"errors": []},
                    "request_id": "request-example-0001",
                }
            },
        ),
        "capabilities": (
            CapabilitiesResponse,
            {
                "api_version": "v1",
                "contract_version": "1.0.0",
                "dataset_formats": ["csv", "mat", "mat_v7_3"],
                "signal_kinds": ["real", "complex_analytic", "complex_baseband"],
                "sampling_kinds": ["uniform", "nonuniform", "unknown"],
                "analysis_tasks": False,
                "batch_tasks": False,
                "ai_providers": [
                    {"provider": "qoder", "available": False, "reason": "not_configured"},
                    {"provider": "bailian", "available": False, "reason": "not_configured"},
                    {"provider": "template", "available": True, "reason": None},
                ],
            },
        ),
        "models": (list[ModelDefinition], model_definitions()),
        "dataset_manifest": (DatasetManifest, dataset_manifest()),
        "dataset_mapping": (DatasetMapping, dataset_mapping()),
        "series_time": (
            SeriesResponse,
            {
                "series_kind": "time",
                "x": [0.0, 0.0009765625],
                "y_real": [0.1, 0.2],
                "y_imag": None,
                "x_unit": "s",
                "y_unit": "a.u.",
                "input_count": 1024,
                "output_count": 2,
                "downsampling": {"method": "minmax", "start_time_s": 0.0, "end_time_s": 1.0},
                "source_artifact": "dataset-time",
            },
        ),
        "series_spectrum_complex": (
            SeriesResponse,
            {
                "series_kind": "spectrum",
                "x": [-1.0, 0.0, 1.0],
                "y_real": [0.2, 0.1, 0.8],
                "y_imag": [0.0, 0.0, 0.0],
                "x_unit": "Hz",
                "y_unit": "a.u.",
                "input_count": 3,
                "output_count": 3,
                "downsampling": {"method": "none", "start_time_s": None, "end_time_s": None},
                "source_artifact": "complex-spectrum",
            },
        ),
        "analysis_request": (AnalysisRequest, analysis_request()),
        "analysis_run_accepted": (
            AnalysisRunAccepted,
            {"analysis_id": ANALYSIS_ID, "status": "queued", "created_at": CREATED_AT},
        ),
        "analysis_result_success": (AnalysisResult, analysis_result()),
        "analysis_result_unknown": (AnalysisResult, analysis_result(unknown=True)),
        "analysis_run_detail": (
            AnalysisRunDetail,
            {
                "analysis_id": ANALYSIS_ID,
                "dataset_id": DATASET_ID,
                "channel_ids": ["ch_1"],
                "status": "succeeded",
                "stage": "completed",
                "created_at": CREATED_AT,
                "completed_at": COMPLETED_AT,
                "config": analysis_request(),
                "result": analysis_result(),
                "error": None,
            },
        ),
        "analysis_batch_accepted": (
            AnalysisBatchAccepted,
            {
                "batch_id": BATCH_ID,
                "status": "queued",
                "analysis_ids": [ANALYSIS_ID],
                "created_at": CREATED_AT,
            },
        ),
        "explanation_template": (
            ExplanationRecord,
            {
                "explanation_id": EXPLANATION_ID,
                "analysis_id": ANALYSIS_ID,
                "status": "succeeded",
                "result": {
                    "summary": "The single-tone model is supported by the computed evidence.",
                    "parameter_explanations": [
                        {"parameter_id": "frequency", "text": "The estimated frequency is 100 Hz."}
                    ],
                    "observations": [
                        {
                            "text": "One dominant spectral peak was computed.",
                            "evidence_refs": ["ev_peak_count"],
                        }
                    ],
                    "limitations": ["The explanation is limited to the registered models."],
                    "recommended_next_steps": ["Validate with another SNR."],
                    "provider": "template",
                    "runtime_model": None,
                    "prompt_version": "1.0.0",
                    "is_fallback": True,
                    "validation_report": {"schema_valid": True, "evidence_valid": True},
                },
                "error": None,
                "created_at": CREATED_AT,
                "completed_at": COMPLETED_AT,
            },
        ),
        "simulation_request": (
            SimulationRequest,
            {
                "model_id": "single_tone",
                "signal_kind": "real",
                "parameters": {"amplitude": 2.0, "frequency": 100.0, "phase": 0.3, "offset": 0.1},
                "sampling": {
                    "kind": "uniform",
                    "sample_rate_hz": 1024.0,
                    "sample_count": 1024,
                    "time_start_s": 0.0,
                    "jitter_ratio": 0.0,
                    "dropout_ranges": [],
                },
                "noise_model": "gaussian",
                "snr_db": 20.0,
                "random_seed": 42,
                "amplitude_unit": "a.u.",
            },
        ),
    }


def generate_examples(examples_dir: Path = EXAMPLES_DIR) -> list[Path]:
    examples_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, (_, payload) in payloads().items():
        path = examples_dir / f"{name}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
            encoding="utf-8",
        )
        paths.append(path)
    return paths


if __name__ == "__main__":
    for generated_path in generate_examples():
        print(generated_path)
