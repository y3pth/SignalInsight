from pathlib import Path

import pytest

from app.datasets.csv_parser import CsvParseError, parse_csv
from app.schemas.enums import Severity, SignalKind


def write_csv(path: Path, content: bytes) -> Path:
    path.write_bytes(content)
    return path


def test_parse_comma_csv_with_bom_and_mapping(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path / "data.csv",
        b"\xef\xbb\xbftime,ch_1,ch_2\n0.0,1.0,2.0\n0.001,2.0,3.0\n0.002,3.0,4.0\n",
    )

    result = parse_csv(path)

    assert result.row_count == 3
    assert result.column_count == 3
    assert result.total_numeric_count == 9
    assert result.validation_summary.valid
    assert [variable.variable_path for variable in result.variables] == ["time", "ch_1", "ch_2"]
    assert len(result.detected_mappings) == 1
    mapping = result.detected_mappings[0].mapping
    assert mapping.time is not None
    assert mapping.time.column == "time"
    assert [channel.channel_id for channel in mapping.channels] == ["ch_1", "ch_2"]
    assert all(channel.signal_kind == SignalKind.REAL for channel in mapping.channels)


def test_tab_and_semicolon_delimiters(tmp_path: Path) -> None:
    tab_result = parse_csv(write_csv(tmp_path / "tab.csv", b"time\tvalue\n0\t1\n1\t2\n"))
    semicolon_result = parse_csv(write_csv(tmp_path / "semi.csv", b"time;value\n0;1\n1;2\n"))

    assert tab_result.column_count == 2
    assert semicolon_result.column_count == 2
    assert tab_result.detected_mappings[0].mapping.time is not None
    assert semicolon_result.detected_mappings[0].mapping.time is not None


def test_iq_pair_produces_complex_candidate(tmp_path: Path) -> None:
    result = parse_csv(
        write_csv(
            tmp_path / "iq.csv",
            b"time,I,Q\n0.0,1.0,0.0\n0.001,0.0,1.0\n0.002,-1.0,0.0\n",
        )
    )

    assert len(result.detected_mappings) == 2
    complex_candidate = result.detected_mappings[1]
    assert complex_candidate.reasons[0] == "separate_iq_pair_detected"
    channel = complex_candidate.mapping.channels[0]
    assert channel.signal_kind == SignalKind.COMPLEX_ANALYTIC
    assert channel.complex_layout == "separate_i_q"
    assert channel.value.column == "I"
    assert channel.imaginary_value is not None
    assert channel.imaginary_value.column == "Q"


def test_non_monotonic_numeric_columns_have_no_mapping(tmp_path: Path) -> None:
    result = parse_csv(write_csv(tmp_path / "data.csv", b"a,b\n1,3\n3,1\n2,2\n"))

    assert result.detected_mappings == []
    assert result.validation_summary.valid
    assert any(
        issue.code == "NO_MAPPING_CANDIDATE" and issue.severity == Severity.WARNING
        for issue in result.validation_summary.issues
    )


def test_nonnumeric_column_is_explicitly_unsupported(tmp_path: Path) -> None:
    result = parse_csv(
        write_csv(
            tmp_path / "mixed.csv",
            b"time,value,label\n0,1,a\n1,2,b\n2,3,c\n",
        )
    )

    label = next(variable for variable in result.variables if variable.variable_id == "label")
    assert not label.supported
    assert label.unsupported_reason == "NON_NUMERIC_VALUES"
    issue = next(
        issue for issue in result.validation_summary.issues if issue.code == "NON_NUMERIC_COLUMN"
    )
    assert issue.severity == Severity.WARNING


def test_missing_and_non_finite_values_are_rejected(tmp_path: Path) -> None:
    result = parse_csv(
        write_csv(
            tmp_path / "bad_values.csv",
            b"time,missing,nonfinite\n0,1,1\n1,,2\n2,3,nan\n",
        )
    )

    assert not result.validation_summary.valid
    codes = {issue.code for issue in result.validation_summary.issues}
    assert "MISSING_VALUES" in codes
    assert "NON_FINITE_VALUES" in codes
    missing = next(variable for variable in result.variables if variable.variable_id == "missing")
    nonfinite = next(
        variable for variable in result.variables if variable.variable_id == "nonfinite"
    )
    assert not missing.supported
    assert missing.unsupported_reason == "MISSING_VALUES"
    assert not nonfinite.supported
    assert nonfinite.unsupported_reason == "NON_FINITE_VALUES"
    assert result.detected_mappings == []


def test_duplicate_headers_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(CsvParseError) as error:
        parse_csv(write_csv(tmp_path / "dup.csv", b"time,time\n0,1\n"))

    assert error.value.code == "DUPLICATE_HEADER"


def test_empty_headers_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(CsvParseError) as error:
        parse_csv(write_csv(tmp_path / "empty_header.csv", b"time,\n0,1\n"))

    assert error.value.code == "EMPTY_HEADER"


def test_row_length_mismatch_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(CsvParseError) as error:
        parse_csv(write_csv(tmp_path / "short.csv", b"time,value\n0,1\n1\n"))

    assert error.value.code == "ROW_LENGTH_MISMATCH"
    assert error.value.details["row"] == 3


def test_non_utf8_input_is_rejected(tmp_path: Path) -> None:
    path = write_csv(tmp_path / "utf16.csv", "time,value\n0,1\n".encode("utf-16"))

    with pytest.raises(CsvParseError) as error:
        parse_csv(path)

    assert error.value.code == "INVALID_ENCODING"


def test_cell_limit_is_enforced(tmp_path: Path) -> None:
    with pytest.raises(CsvParseError) as error:
        parse_csv(
            write_csv(tmp_path / "large.csv", b"time,value\n0,1\n1,2\n2,3\n"),
            max_cells=5,
        )

    assert error.value.code == "CELL_LIMIT_EXCEEDED"


def test_empty_file_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(CsvParseError) as error:
        parse_csv(write_csv(tmp_path / "empty.csv", b""))

    assert error.value.code == "EMPTY_FILE"


def test_no_data_rows_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(CsvParseError) as error:
        parse_csv(write_csv(tmp_path / "header.csv", b"time,value\n"))

    assert error.value.code == "NO_DATA_ROWS"
