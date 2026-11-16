from pydantic import Field, model_validator

from app.schemas.base import ContractModel
from app.schemas.enums import SeriesKind


class DownsamplingInfo(ContractModel):
    method: str
    start_time_s: float | None = None
    end_time_s: float | None = None


class SeriesResponse(ContractModel):
    series_kind: SeriesKind
    x: list[float]
    y_real: list[float] | None = None
    y_imag: list[float] | None = None
    x_unit: str
    y_unit: str
    input_count: int = Field(ge=1)
    output_count: int = Field(ge=1, le=5000)
    downsampling: DownsamplingInfo
    source_artifact: str

    @model_validator(mode="after")
    def validate_series_lengths(self) -> "SeriesResponse":
        if self.y_real is None and self.y_imag is None:
            raise ValueError("y_real or y_imag is required")
        if len(self.x) != self.output_count:
            raise ValueError("x length must equal output_count")
        for values in (self.y_real, self.y_imag):
            if values is not None and len(values) != self.output_count:
                raise ValueError("series lengths must equal output_count")
        if self.input_count < self.output_count:
            raise ValueError("input_count must be greater than or equal to output_count")
        if self.series_kind == SeriesKind.CONSTELLATION and (
            self.y_real is None or self.y_imag is None
        ):
            raise ValueError("constellation series requires y_real and y_imag")
        return self
