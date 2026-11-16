class DatasetInUseError(ValueError):
    pass


class DuplicateRequestError(ValueError):
    pass


class ArtifactConflictError(ValueError):
    pass


class ArtifactHashMismatchError(ValueError):
    pass


class ArtifactNotFoundError(FileNotFoundError):
    pass


class UploadTooLargeError(ValueError):
    def __init__(self, size_bytes: int, max_bytes: int) -> None:
        super().__init__(f"upload exceeds the size limit: {size_bytes} > {max_bytes}")
        self.size_bytes = size_bytes
        self.max_bytes = max_bytes


class EmptyUploadError(ValueError):
    pass


class UnsupportedFileFormatError(ValueError):
    pass
