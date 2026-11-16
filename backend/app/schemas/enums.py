from enum import StrEnum


class AnalysisMode(StrEnum):
    AUTO = "auto"
    SPECIFIED = "specified"


class AnalysisStage(StrEnum):
    VALIDATING_INPUT = "validating_input"
    LOADING_SIGNAL = "loading_signal"
    EXTRACTING_FEATURES = "extracting_features"
    PROPOSING_CANDIDATES = "proposing_candidates"
    FITTING_MODELS = "fitting_models"
    COMPARING_MODELS = "comparing_models"
    ESTIMATING_UNCERTAINTY = "estimating_uncertainty"
    ASSESSING_RELIABILITY = "assessing_reliability"
    WRITING_RESULTS = "writing_results"
    COMPLETED = "completed"


class AnalysisStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INTERRUPTED = "interrupted"


class DatasetMediaType(StrEnum):
    CSV = "csv"
    MAT = "mat"
    MAT_V7_3 = "mat_v7_3"


class DatasetOrigin(StrEnum):
    UPLOAD = "upload"
    SIMULATION = "simulation"


class ExplanationPolicy(StrEnum):
    NONE = "none"
    AFTER_ANALYSIS = "after_analysis"


class ExplanationProvider(StrEnum):
    AUTO = "auto"
    QODER = "qoder"
    BAILIAN = "bailian"
    TEMPLATE = "template"


class ExplanationStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExportFormat(StrEnum):
    JSON = "json"
    CSV_BUNDLE = "csv_bundle"


class ModelId(StrEnum):
    SINGLE_TONE = "single_tone"
    MULTI_TONE = "multi_tone"
    AM = "am"
    FM = "fm"


class ReliabilityLevel(StrEnum):
    RELIABLE = "reliable"
    CAUTION = "caution"
    UNRELIABLE = "unreliable"
    INSUFFICIENT_EVIDENCE = "insufficient_evidence"


class SamplingKind(StrEnum):
    UNIFORM = "uniform"
    NONUNIFORM = "nonuniform"
    UNKNOWN = "unknown"


class SeriesKind(StrEnum):
    TIME = "time"
    SPECTRUM = "spectrum"
    FIT = "fit"
    RESIDUAL = "residual"
    ENVELOPE = "envelope"
    PHASE = "phase"
    INSTANTANEOUS_FREQUENCY = "instantaneous_frequency"
    CONSTELLATION = "constellation"


class Severity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class SignalKind(StrEnum):
    REAL = "real"
    COMPLEX_ANALYTIC = "complex_analytic"
    COMPLEX_BASEBAND = "complex_baseband"


class UncertaintyMethod(StrEnum):
    ASYMPTOTIC = "asymptotic"
    MULTI_START = "multi_start"
    PARAMETRIC_BOOTSTRAP = "parametric_bootstrap"
    RESIDUAL_BOOTSTRAP = "residual_bootstrap"
    BLOCK_BOOTSTRAP = "block_bootstrap"
