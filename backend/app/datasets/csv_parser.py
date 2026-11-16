import csv
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.schemas.datasets import (
    ChannelMapping,
    DataLocator,
    DatasetMapping,
    MappingCandidate,
    ValidationIssue,
    ValidationSummary,
    VariableDescriptor,
)
from app.schemas.enums import Severity, SignalKind

CSV_DELIMITERS = ("\t", ",", ";")


class CsvParseError(ValueError):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass(frozen=True)
class CsvParseResult:
    variables: list[VariableDescriptor]
    detected_mappings: list[MappingCandidate]
    validation_summary: ValidationSummary
    total_numeric_count: int
    row_count: int
    column_count: int


@dataclass(frozen=True)
class _ColumnProfile:
    name: str
    numbers: list[float]
    variable: VariableDescriptor
    issue: ValidationIssue | None


def _detect_delimiter(sample: str) -> str:
    if not sample.strip():
        raise CsvParseError("EMPTY_FILE", "CSV file is empty.")
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters="".join(CSV_DELIMITERS))
        if dialect.delimiter in CSV_DELIMITERS:
            return dialect.delimiter
    except csv.Error:
        pass
    first_line = sample.splitlines()[0]
    counts = {delimiter: first_line.count(delimiter) for delimiter in CSV_DELIMITERS}
    delimiter = max(counts, key=lambda item: counts[item])
    if counts[delimiter] == 0:
        raise CsvParseError(
            "DELIMITER_NOT_DETECTED",
            "CSV delimiter could not be detected.",
        )
    return delimiter


def _infer_column(name: str, tokens: list[str], row_count: int) -> _ColumnProfile:
    numbers: list[float] = []
    missing_count = 0
    non_numeric_count = 0
    non_finite_count = 0

    for token in tokens:
        if token.strip() == "":
            missing_count += 1
            continue
        try:
            value = float(token)
        except ValueError:
            non_numeric_count += 1
            continue
        if not math.isfinite(value):
            non_finite_count += 1
            continue
        numbers.append(value)

    issue: ValidationIssue | None = None
    supported = True
    reason: str | None = None
    if missing_count:
        supported = False
        reason = "MISSING_VALUES"
        issue = ValidationIssue(
            code="MISSING_VALUES",
            message=f"Column '{name}' contains missing values.",
            severity=Severity.ERROR,
            details={"column": name, "count": missing_count},
        )
    elif non_numeric_count:
        supported = False
        reason = "NON_NUMERIC_VALUES"
        issue = ValidationIssue(
            code="NON_NUMERIC_COLUMN",
            message=f"Column '{name}' is not fully numeric.",
            severity=Severity.WARNING,
            details={"column": name, "count": non_numeric_count},
        )
    elif non_finite_count:
        supported = False
        reason = "NON_FINITE_VALUES"
        issue = ValidationIssue(
            code="NON_FINITE_VALUES",
            message=f"Column '{name}' contains NaN or Infinity.",
            severity=Severity.ERROR,
            details={"column": name, "count": non_finite_count},
        )
    elif len(numbers) != row_count:
        supported = False
        reason = "INCOMPLETE_COLUMN"
        issue = ValidationIssue(
            code="INCOMPLETE_COLUMN",
            message=f"Column '{name}' does not cover every row.",
            severity=Severity.ERROR,
            details={"column": name},
        )

    variable = VariableDescriptor(
        variable_id=name,
        variable_path=name,
        data_type="float64" if supported else "mixed",
        shape=[row_count],
        is_complex=False,
        estimated_numeric_count=len(numbers),
        supported=supported,
        unsupported_reason=reason,
    )
    return _ColumnProfile(
        name=name,
        numbers=numbers,
        variable=variable,
        issue=issue,
    )


def _strictly_increasing(values: list[float]) -> bool:
    return len(values) >= 2 and all(
        left < right for left, right in zip(values, values[1:], strict=False)
    )


def _mapping_candidates(columns: list[_ColumnProfile]) -> list[MappingCandidate]:
    numeric = [column for column in columns if column.variable.supported]
    time_columns = [column for column in numeric if _strictly_increasing(column.numbers)]
    if not time_columns:
        return []
    time_column = time_columns[0]
    channel_columns = [column for column in numeric if column is not time_column]
    if not channel_columns:
        return []

    time_locator = DataLocator(variable_id=time_column.name, column=time_column.name)
    real_channels = [
        ChannelMapping(
            channel_id=column.name,
            label=column.name,
            signal_kind=SignalKind.REAL,
            value=DataLocator(variable_id=column.name, column=column.name),
        )
        for column in channel_columns[:32]
    ]
    candidates = [
        MappingCandidate(
            mapping=DatasetMapping(
                time=time_locator,
                channels=real_channels,
                sample_axis=None,
                amplitude_unit="a.u.",
                phase_reference_s=0,
            ),
            reasons=["strictly_increasing_time_candidate", "numeric_signal_columns"],
            requires_confirmation=True,
        )
    ]

    by_name = {column.name.casefold(): column for column in channel_columns}
    i_column = by_name.get("i")
    q_column = by_name.get("q")
    real_column = by_name.get("real")
    imag_column = by_name.get("imag")
    pair = (
        (i_column, q_column)
        if i_column is not None and q_column is not None
        else (real_column, imag_column)
    )
    if pair[0] is not None and pair[1] is not None:
        candidates.append(
            MappingCandidate(
                mapping=DatasetMapping(
                    time=time_locator,
                    channels=[
                        ChannelMapping(
                            channel_id="iq",
                            label="I/Q",
                            signal_kind=SignalKind.COMPLEX_ANALYTIC,
                            value=DataLocator(
                                variable_id=pair[0].name,
                                column=pair[0].name,
                            ),
                            imaginary_value=DataLocator(
                                variable_id=pair[1].name,
                                column=pair[1].name,
                            ),
                            complex_layout="separate_i_q",
                        )
                    ],
                    sample_axis=None,
                    amplitude_unit="a.u.",
                    phase_reference_s=0,
                ),
                reasons=["separate_iq_pair_detected", "strictly_increasing_time_candidate"],
                requires_confirmation=True,
            )
        )
    return candidates


def parse_csv(
    path: Path,
    *,
    max_cells: int = 2_000_000,
    max_columns: int = 512,
) -> CsvParseResult:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            sample = file.read(65536)
            delimiter = _detect_delimiter(sample)
            file.seek(0)
            reader = csv.reader(file, delimiter=delimiter)
            header = next(reader, None)
            if header is None:
                raise CsvParseError("EMPTY_FILE", "CSV file has no header.")
            if not header:
                raise CsvParseError("EMPTY_HEADER", "CSV header is empty.")
            if len(header) > max_columns:
                raise CsvParseError(
                    "COLUMN_LIMIT_EXCEEDED",
                    "CSV column count exceeds the configured limit.",
                    {"column_count": len(header), "max_columns": max_columns},
                )
            if any(not name.strip() for name in header):
                raise CsvParseError("EMPTY_HEADER", "CSV contains an empty header.")
            if len(set(header)) != len(header):
                raise CsvParseError("DUPLICATE_HEADER", "CSV contains duplicate headers.")

            token_columns: list[list[str]] = [[] for _ in header]
            row_count = 0
            for row_number, row in enumerate(reader, start=2):
                if not row:
                    continue
                if len(row) != len(header):
                    raise CsvParseError(
                        "ROW_LENGTH_MISMATCH",
                        "CSV row length does not match the header.",
                        {
                            "row": row_number,
                            "expected": len(header),
                            "actual": len(row),
                        },
                    )
                row_count += 1
                if row_count * len(header) > max_cells:
                    raise CsvParseError(
                        "CELL_LIMIT_EXCEEDED",
                        "CSV cell count exceeds the configured limit.",
                        {"max_cells": max_cells},
                    )
                for index, token in enumerate(row):
                    token_columns[index].append(token)
    except UnicodeDecodeError as exc:
        raise CsvParseError(
            "INVALID_ENCODING",
            "CSV must be UTF-8 or UTF-8 with BOM.",
        ) from exc

    if row_count == 0:
        raise CsvParseError("NO_DATA_ROWS", "CSV contains no data rows.")

    columns = [
        _infer_column(name, tokens, row_count)
        for name, tokens in zip(header, token_columns, strict=True)
    ]
    issues = [column.issue for column in columns if column.issue is not None]
    candidates = _mapping_candidates(columns)
    if not candidates:
        issues.append(
            ValidationIssue(
                code="NO_MAPPING_CANDIDATE",
                message="No confirmed mapping candidate could be proposed.",
                severity=Severity.WARNING,
                details={"row_count": row_count, "column_count": len(header)},
            )
        )
    valid = not any(issue.severity == Severity.ERROR for issue in issues)
    return CsvParseResult(
        variables=[column.variable for column in columns],
        detected_mappings=candidates,
        validation_summary=ValidationSummary(valid=valid, issues=issues),
        total_numeric_count=sum(len(column.numbers) for column in columns),
        row_count=row_count,
        column_count=len(header),
    )
