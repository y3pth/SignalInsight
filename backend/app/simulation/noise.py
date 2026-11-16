import math

import numpy as np

from app.simulation.types import NoiseApplication, NoiseReport, SignalArray

SNR_DEFINITION = "10*log10(mean(abs(clean)^2)/mean(abs(noise)^2))"


def measure_signal_power(values: SignalArray) -> float:
    if values.size == 0:
        raise ValueError("signal power requires at least one sample")
    if not np.all(np.isfinite(values)):
        raise ValueError("signal samples must be finite")
    return float(np.mean(np.abs(values) ** 2))


def snr_db_to_linear(snr_db: float) -> float:
    try:
        ratio: float = 10.0 ** (snr_db / 10.0)
    except OverflowError as exc:
        raise ValueError("snr_db is outside the supported numeric range") from exc
    if not math.isfinite(ratio) or ratio <= 0:
        raise ValueError("snr_db is outside the supported numeric range")
    return ratio


def apply_gaussian_noise(
    clean_values: SignalArray,
    snr_db: float | None,
    rng: np.random.Generator,
) -> NoiseApplication:
    signal_power = measure_signal_power(clean_values)
    if snr_db is None:
        noise_values = np.zeros_like(clean_values)
        report = NoiseReport(
            target_snr_db=None,
            actual_snr_db=None,
            signal_power=signal_power,
            noise_power=0.0,
            definition=SNR_DEFINITION,
        )
        return NoiseApplication(
            noisy_values=clean_values.copy(),
            noise_values=noise_values,
            report=report,
        )

    if signal_power == 0:
        raise ValueError("cannot apply finite SNR to a zero-power signal")
    noise_power = signal_power / snr_db_to_linear(snr_db)
    if np.iscomplexobj(clean_values):
        scale = math.sqrt(noise_power / 2.0)
        noise_values = scale * (
            rng.normal(size=clean_values.shape) + 1j * rng.normal(size=clean_values.shape)
        )
        noise_values = np.asarray(noise_values, dtype=np.complex128)
    else:
        noise_values = rng.normal(scale=math.sqrt(noise_power), size=clean_values.shape)
        noise_values = np.asarray(noise_values, dtype=np.float64)

    actual_noise_power = measure_signal_power(noise_values)
    actual_snr_db = 10.0 * math.log10(signal_power / actual_noise_power)
    report = NoiseReport(
        target_snr_db=snr_db,
        actual_snr_db=actual_snr_db,
        signal_power=signal_power,
        noise_power=actual_noise_power,
        definition=SNR_DEFINITION,
    )
    return NoiseApplication(
        noisy_values=clean_values + noise_values,
        noise_values=noise_values,
        report=report,
    )
