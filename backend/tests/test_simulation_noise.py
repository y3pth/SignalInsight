import numpy as np
import pytest

from app.simulation.noise import apply_gaussian_noise, measure_signal_power, snr_db_to_linear


def test_snr_conversion() -> None:
    assert snr_db_to_linear(0) == 1.0
    assert snr_db_to_linear(10) == 10.0
    assert snr_db_to_linear(20) == 100.0


def test_real_gaussian_noise_matches_target_snr() -> None:
    clean = np.ones(100_000, dtype=np.float64)
    result = apply_gaussian_noise(clean, 10.0, np.random.default_rng(42))

    assert result.noise_values.dtype == np.float64
    assert result.report.actual_snr_db == pytest.approx(10.0, abs=0.05)
    assert np.allclose(result.noisy_values, clean + result.noise_values)


def test_complex_gaussian_noise_uses_total_complex_power() -> None:
    clean = np.full(100_000, 1 + 1j, dtype=np.complex128)
    result = apply_gaussian_noise(clean, 20.0, np.random.default_rng(42))

    assert measure_signal_power(clean) == pytest.approx(2.0)
    assert result.noise_values.dtype == np.complex128
    assert result.report.actual_snr_db == pytest.approx(20.0, abs=0.05)


def test_noise_is_reproducible() -> None:
    clean = np.ones(1024, dtype=np.float64)
    first = apply_gaussian_noise(clean, 5.0, np.random.default_rng(42))
    second = apply_gaussian_noise(clean, 5.0, np.random.default_rng(42))

    assert np.array_equal(first.noise_values, second.noise_values)


def test_none_snr_produces_no_noise() -> None:
    clean = np.ones(64, dtype=np.float64)
    result = apply_gaussian_noise(clean, None, np.random.default_rng(42))

    assert np.array_equal(result.noisy_values, clean)
    assert result.report.noise_power == 0.0
    assert result.report.actual_snr_db is None


def test_zero_power_signal_rejects_finite_snr() -> None:
    with pytest.raises(ValueError, match="zero-power"):
        apply_gaussian_noise(np.zeros(64, dtype=np.float64), 20.0, np.random.default_rng(42))


def test_extreme_snr_is_rejected() -> None:
    with pytest.raises(ValueError, match="numeric range"):
        snr_db_to_linear(10_000.0)
