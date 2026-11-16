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
